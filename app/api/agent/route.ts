import { ToolLoopAgent, isStepCount, tool } from "ai";
import { z } from "zod";
import { all, id, now } from "../../../lib/db";
import { requireApiUser, unauthorized } from "../../../lib/server-auth";
import { nativeSandboxConfigured, runProjectChecks } from "../../../lib/vercel-sandbox";

const MODEL = "openai/gpt-5.6-sol";
export const maxDuration = 300;

export async function POST(request: Request) {
  const auth = await requireApiUser();
  if (!auth) return unauthorized();
  const body = await request.json() as { projectId?: string; prompt?: string };
  const prompt = body.prompt?.trim();
  const projectId = body.projectId?.trim();
  if (!prompt || !projectId) return Response.json({ error: "projectId and prompt are required." }, { status: 400 });
  const recentRuns = await auth.db.prepare("SELECT COUNT(*) AS count FROM generations WHERE user_email = ? AND created_at > ?").bind(auth.user.email, new Date(Date.now() - 60_000).toISOString()).first<{ count: number }>();
  if ((recentRuns?.count ?? 0) >= 5) return Response.json({ error: "Too many agent runs. Try again in one minute.", code: "RATE_LIMITED" }, { status: 429 });
  const existingProject = await auth.db.prepare("SELECT id FROM projects WHERE id = ? AND workspace_id = ?").bind(projectId, auth.workspaceId).first();
  if (!existingProject) {
    const timestamp = now();
    await auth.db.prepare("INSERT INTO projects (id, workspace_id, name, description, branch, status, created_at, updated_at) VALUES (?, ?, ?, 'Created from KODO workspace', 'main', 'draft', ?, ?)")
      .bind(projectId, auth.workspaceId, projectId.replaceAll("-", " ").slice(0, 100), timestamp, timestamp).run();
  }
  const workspace = await auth.db.prepare("SELECT credits FROM workspaces WHERE id = ?").bind(auth.workspaceId).first<{ credits: number }>();
  if (!workspace || workspace.credits < 20) return Response.json({ error: "Not enough credits. Recharge before starting this agent.", code: "INSUFFICIENT_CREDITS" }, { status: 402 });

  const generationId = id("gen");
  const timestamp = now();
  await auth.db.prepare("INSERT INTO generations (id, workspace_id, project_id, user_email, model, prompt, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, 'running', ?, ?)")
    .bind(generationId, auth.workspaceId, projectId, auth.user.email, MODEL, prompt.slice(0, 12000), timestamp, timestamp).run();

  if (!process.env.AI_GATEWAY_API_KEY && !process.env.VERCEL_OIDC_TOKEN) {
    await auth.db.prepare("UPDATE generations SET status = 'setup_required', error = ?, updated_at = ? WHERE id = ?")
      .bind("AI Gateway is not connected.", now(), generationId).run();
    return Response.json({ generationId, status: "setup_required", error: "Connect Vercel AI Gateway in Integrations to run KODO on a real model.", connectUrl: "/integrations" }, { status: 503 });
  }

  const steps: Array<{ type: string; label: string; status: string }> = [];
  const agent = new ToolLoopAgent({
    model: MODEL,
    instructions: "You are KODO, a careful production coding agent. First inspect the existing files, then plan, edit only necessary files, run checks, and create a version. Never claim a check passed if the sandbox reports skipped or failed. Keep the final response concise and list what changed.",
    stopWhen: isStepCount(12),
    tools: {
      inspectProject: tool({
        description: "Read the current project file paths and their text content.",
        inputSchema: z.object({}),
        execute: async () => {
          steps.push({ type: "read", label: "Inspected project files", status: "complete" });
          const files = await all<{ path: string; content: string }>(auth.db.prepare("SELECT path, content FROM project_files WHERE project_id = ? ORDER BY path LIMIT 80").bind(projectId));
          return { files: files.map(file => ({ path: file.path, content: file.content.slice(0, 12000) })) };
        },
      }),
      savePlan: tool({
        description: "Save the implementation plan before editing.",
        inputSchema: z.object({ tasks: z.array(z.string()).min(1).max(12) }),
        execute: async ({ tasks }) => {
          steps.push({ type: "plan", label: `${tasks.length} implementation tasks planned`, status: "complete" });
          return { saved: true, tasks };
        },
      }),
      writeFile: tool({
        description: "Create or replace one text project file.",
        inputSchema: z.object({ path: z.string().min(1).max(240), content: z.string().max(120000), language: z.string().max(40).default("text") }),
        execute: async ({ path, content, language }) => {
          const fileId = id("file");
          await auth.db.prepare("INSERT INTO project_files (id, project_id, path, content, language, updated_at) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(project_id, path) DO UPDATE SET content = excluded.content, language = excluded.language, updated_at = excluded.updated_at")
            .bind(fileId, projectId, path, content, language, now()).run();
          steps.push({ type: "edit", label: `Updated ${path}`, status: "complete" });
          return { saved: true, path, characters: content.length };
        },
      }),
      runChecks: tool({
        description: "Run project build and tests in the connected secure sandbox.",
        inputSchema: z.object({ command: z.string().max(300).default("npm run build") }),
        execute: async ({ command }) => {
          if (!nativeSandboxConfigured()) {
            steps.push({ type: "test", label: "Checks need sandbox connection", status: "skipped" });
            return { status: "skipped", reason: "Vercel OIDC is unavailable. Do not claim tests passed." };
          }
          const files = await all<{ path: string; content: string }>(auth.db.prepare("SELECT path, content FROM project_files WHERE project_id = ?").bind(projectId));
          const result = await runProjectChecks(files, command);
          steps.push({ type: "test", label: result.status === "passed" ? "Build and tests passed" : "Checks failed", status: result.status === "passed" ? "complete" : "failed" });
          return result;
        },
      }),
      createVersion: tool({
        description: "Create an immutable project checkpoint after edits.",
        inputSchema: z.object({ label: z.string().min(1).max(120) }),
        execute: async ({ label }) => {
          const files = await all<{ path: string; content: string; language: string }>(auth.db.prepare("SELECT path, content, language FROM project_files WHERE project_id = ? ORDER BY path").bind(projectId));
          const versionId = id("ver");
          await auth.db.prepare("INSERT INTO versions (id, project_id, generation_id, label, snapshot_json, created_at) VALUES (?, ?, ?, ?, ?, ?)")
            .bind(versionId, projectId, generationId, label, JSON.stringify(files), now()).run();
          steps.push({ type: "version", label: "Created review checkpoint", status: "complete" });
          return { versionId, files: files.length };
        },
      }),
    },
  });

  try {
    const result = await agent.generate({ prompt: `${prompt}\n\nProject ID: ${projectId}` });
    const inputTokens = result.totalUsage.inputTokens ?? 0;
    const outputTokens = result.totalUsage.outputTokens ?? 0;
    const creditsUsed = Math.max(20, Math.ceil((inputTokens + outputTokens) / 100));
    await auth.db.batch([
      auth.db.prepare("UPDATE generations SET result = ?, steps_json = ?, status = 'complete', input_tokens = ?, output_tokens = ?, credits_used = ?, updated_at = ? WHERE id = ?").bind(result.text, JSON.stringify(steps), inputTokens, outputTokens, creditsUsed, now(), generationId),
      auth.db.prepare("UPDATE workspaces SET credits = MAX(0, credits - ?) WHERE id = ?").bind(creditsUsed, auth.workspaceId),
      auth.db.prepare("INSERT INTO usage_events (id, workspace_id, generation_id, kind, units, metadata_json, created_at) VALUES (?, ?, ?, 'agent_tokens', ?, ?, ?)").bind(id("use"), auth.workspaceId, generationId, inputTokens + outputTokens, JSON.stringify({ model: MODEL, creditsUsed }), now()),
      auth.db.prepare("UPDATE projects SET updated_at = ? WHERE id = ? AND workspace_id = ?").bind(now(), projectId, auth.workspaceId),
    ]);
    return Response.json({ generationId, status: "complete", result: result.text, steps, usage: { inputTokens, outputTokens, creditsUsed }, model: MODEL });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Agent failed";
    await auth.db.prepare("UPDATE generations SET status = 'error', error = ?, steps_json = ?, updated_at = ? WHERE id = ?").bind(message.slice(0, 1000), JSON.stringify(steps), now(), generationId).run();
    return Response.json({ generationId, status: "error", error: "The agent could not complete this run. Check the AI connection and try again." }, { status: 502 });
  }
}
