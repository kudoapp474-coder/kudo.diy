import { ToolLoopAgent, isStepCount, tool } from "ai";
import { z } from "zod";
import { all, id, now } from "../../../lib/db";
import { safeProjectPath, starterProjectFiles } from "../../../lib/project-files";
import {
  AGENT_RUN_RESERVATION_CREDITS,
  DEFAULT_AGENT_MODEL_ID,
  calculateAgentCredits,
  estimateAgentCostUsd,
  isAgentModelId,
} from "../../../lib/agent-models";
import {
  agentCreditStopCondition,
  agentStepOutputTokenLimit,
  boundedProjectContext,
  workspaceAgentSpendWindow,
} from "../../../lib/agent-spend";
import { requireApiUser, unauthorized } from "../../../lib/server-auth";
import { nativeSandboxConfigured, runProjectChecks } from "../../../lib/vercel-sandbox";

const CONFIGURED_DEFAULT_MODEL = isAgentModelId(process.env.KODO_MODEL) ? process.env.KODO_MODEL : DEFAULT_AGENT_MODEL_ID;
const STALE_AGENT_LOCK_MS = 10 * 60 * 1000;
export const maxDuration = 300;

function upstreamStatus(error: unknown) {
  if (!error || typeof error !== "object") return 0;
  const candidate = error as { status?: unknown; statusCode?: unknown; response?: { status?: unknown } };
  for (const value of [candidate.status, candidate.statusCode, candidate.response?.status]) {
    if (typeof value === "number") return value;
  }
  return 0;
}

function isUpstreamRateLimit(error: unknown) {
  const message = error instanceof Error ? error.message : "";
  return upstreamStatus(error) === 429 || /\b429\b|rate[ -]?limit|too many requests/i.test(message);
}

export async function POST(request: Request) {
  const auth = await requireApiUser();
  if (!auth) return unauthorized();
  const body = await request.json() as { projectId?: string; prompt?: string; model?: string };
  const prompt = body.prompt?.trim();
  const requestedModel = body.model?.trim();
  if (requestedModel && !isAgentModelId(requestedModel)) return Response.json({ error: "This AI model is not available.", code: "INVALID_MODEL" }, { status: 400 });
  const selectedModel = requestedModel && isAgentModelId(requestedModel) ? requestedModel : CONFIGURED_DEFAULT_MODEL;
  const projectId = body.projectId?.trim();
  if (!prompt || !projectId) return Response.json({ error: "projectId and prompt are required." }, { status: 400 });

  const recentRuns = await auth.db.prepare("SELECT COUNT(*) AS count FROM generations WHERE user_email = ? AND created_at > ?")
    .bind(auth.user.email, new Date(Date.now() - 60_000).toISOString()).first<{ count: number }>();
  if ((recentRuns?.count ?? 0) >= 5) return Response.json({ error: "Too many agent runs. Try again in one minute.", code: "RATE_LIMITED" }, { status: 429 });

  const existingProject = await auth.db.prepare("SELECT id, name, description FROM projects WHERE id = ? AND workspace_id = ?")
    .bind(projectId, auth.workspaceId).first<{ id: string; name: string; description: string }>();
  if (!existingProject) return Response.json({ error: "Project not found." }, { status: 404 });

  const existingFiles = await auth.db.prepare("SELECT COUNT(*) AS count FROM project_files WHERE project_id = ?")
    .bind(projectId).first<{ count: number | string }>();
  if (Number(existingFiles?.count ?? 0) === 0) {
    const timestamp = now();
    await auth.db.batch(starterProjectFiles(existingProject.name).map(file => auth.db.prepare("INSERT INTO project_files (id, project_id, path, content, language, updated_at) VALUES (?, ?, ?, ?, ?, ?)")
      .bind(id("file"), projectId, file.path, file.content, file.language ?? "text", timestamp)));
  }

  if (!process.env.AI_GATEWAY_API_KEY && !process.env.VERCEL_OIDC_TOKEN) {
    return Response.json({ status: "setup_required", error: "Connect Vercel AI Gateway in Integrations to run KODO on a real model.", connectUrl: "/integrations" }, { status: 503 });
  }

  const workspace = await auth.db.prepare("SELECT plan, credits FROM workspaces WHERE id = ?")
    .bind(auth.workspaceId).first<{ plan: string; credits: number | string }>();
  if (!workspace) return Response.json({ error: "Workspace not found." }, { status: 404 });

  const balanceBeforeRun = Math.max(0, Number(workspace.credits ?? 0));
  const spendWindow = await workspaceAgentSpendWindow(auth.db, auth.workspaceId, workspace.plan);
  if (spendWindow.remaining < AGENT_RUN_RESERVATION_CREDITS) {
    return Response.json({
      error: `This workspace reached its ${spendWindow.limit.toLocaleString("en-IN")}-credit rolling 24-hour AI limit. Earlier runs must leave the 24-hour window before another agent can start.`,
      code: "DAILY_CREDIT_LIMIT_REACHED",
      dailyCreditsUsed: spendWindow.used,
      dailyCreditsLimit: spendWindow.limit,
    }, { status: 429 });
  }
  if (balanceBeforeRun < AGENT_RUN_RESERVATION_CREDITS) {
    return Response.json({ error: "Not enough credits. Recharge before starting this agent.", code: "INSUFFICIENT_CREDITS", creditsRequired: AGENT_RUN_RESERVATION_CREDITS }, { status: 402 });
  }

  const runCreditBudget = Math.max(AGENT_RUN_RESERVATION_CREDITS, Math.floor(Math.min(balanceBeforeRun, spendWindow.remaining)));
  const generationId = id("gen");
  const timestamp = now();
  const staleBefore = new Date(Date.now() - STALE_AGENT_LOCK_MS).toISOString();
  await auth.db.prepare("DELETE FROM agent_run_locks WHERE workspace_id = ? AND acquired_at < ?").bind(auth.workspaceId, staleBefore).run();
  const lock = await auth.db.prepare("INSERT OR IGNORE INTO agent_run_locks (workspace_id, generation_id, acquired_at) VALUES (?, ?, ?)")
    .bind(auth.workspaceId, generationId, timestamp).run();
  if ((lock.meta?.changes ?? 0) === 0) {
    return Response.json({ error: "Another KODO agent is already running in this workspace. Let it finish before starting another run.", code: "AGENT_ALREADY_RUNNING" }, { status: 409 });
  }

  let reserved = false;
  let generationInserted = false;
  const steps: Array<{ type: string; label: string; status: string }> = [];

  try {
    const reservation = await auth.db.prepare("UPDATE workspaces SET credits = credits - ? WHERE id = ? AND credits >= ?")
      .bind(AGENT_RUN_RESERVATION_CREDITS, auth.workspaceId, AGENT_RUN_RESERVATION_CREDITS).run();
    if ((reservation.meta?.changes ?? 0) === 0) {
      return Response.json({ error: "Not enough credits. Recharge before starting this agent.", code: "INSUFFICIENT_CREDITS", creditsRequired: AGENT_RUN_RESERVATION_CREDITS }, { status: 402 });
    }
    reserved = true;

    await auth.db.prepare("INSERT INTO generations (id, workspace_id, project_id, user_email, model, prompt, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, 'running', ?, ?)")
      .bind(generationId, auth.workspaceId, projectId, auth.user.email, selectedModel, prompt.slice(0, 12000), timestamp, timestamp).run();
    generationInserted = true;

    const agent = new ToolLoopAgent({
      model: selectedModel,
      instructions: `You are KODO, a careful production website coding agent. First inspect the existing files, then save a plan, edit only necessary files, run the production build, and create a version.
The instant preview runtime is a dependency-free static web project. Build the complete experience in index.html, styles.css and script.js. Keep package.json and scripts/build.mjs working. You may use remote HTTPS image/font URLs, but do not add npm dependencies or frameworks unless the user explicitly asks and the static preview can still work.
Every website must be responsive, accessible, visually polished, and use real copy instead of placeholders. Implement interactions in script.js. Never claim a check passed if the sandbox reports skipped or failed. Keep the final response concise and list the files changed.`,
      stopWhen: [isStepCount(12), agentCreditStopCondition(selectedModel, runCreditBudget)],
      prepareStep: ({ steps: completedSteps }) => ({
        maxOutputTokens: agentStepOutputTokenLimit(selectedModel, runCreditBudget, completedSteps),
      }),
      tools: {
        inspectProject: tool({
          description: "Read the current project file paths and their text content.",
          inputSchema: z.object({}),
          execute: async () => {
            steps.push({ type: "read", label: "Inspected project files", status: "complete" });
            const files = await all<{ path: string; content: string }>(auth.db.prepare("SELECT path, content FROM project_files WHERE project_id = ? ORDER BY path LIMIT 80").bind(projectId));
            return boundedProjectContext(files);
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
            const normalizedPath = safeProjectPath(path);
            if (!normalizedPath) return { saved: false, error: "Unsafe project path." };
            const fileId = id("file");
            await auth.db.prepare("INSERT INTO project_files (id, project_id, path, content, language, updated_at) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(project_id, path) DO UPDATE SET content = excluded.content, language = excluded.language, updated_at = excluded.updated_at")
              .bind(fileId, projectId, normalizedPath, content, language, now()).run();
            steps.push({ type: "edit", label: `Updated ${normalizedPath}`, status: "complete" });
            return { saved: true, path: normalizedPath, characters: content.length };
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

    const result = await agent.generate({ prompt: `${prompt}\n\nProject: ${existingProject.name}\nProject description: ${existingProject.description}\nProject ID: ${projectId}` });
    const inputTokens = Number(result.totalUsage.inputTokens ?? 0);
    const outputTokens = Number(result.totalUsage.outputTokens ?? 0);
    const rawCreditsUsed = calculateAgentCredits(selectedModel, inputTokens, outputTokens);
    const creditsUsed = Math.min(rawCreditsUsed, runCreditBudget);
    const budgetLimited = rawCreditsUsed >= runCreditBudget;
    if (budgetLimited) steps.push({ type: "budget", label: `Stopped at the ${runCreditBudget.toLocaleString("en-IN")}-credit run budget`, status: "complete" });
    const creditAdjustment = creditsUsed - AGENT_RUN_RESERVATION_CREDITS;
    const estimatedCostUsd = estimateAgentCostUsd(selectedModel, inputTokens, outputTokens);
    const finalText = result.text.trim() || (budgetLimited
      ? "KODO reached the available credit budget for this run. Review the saved changes, then add credits or switch to GPT 5.4 Mini to continue."
      : "KODO completed the run.");

    await auth.db.batch([
      auth.db.prepare("UPDATE generations SET result = ?, steps_json = ?, status = 'complete', input_tokens = ?, output_tokens = ?, credits_used = ?, updated_at = ? WHERE id = ?")
        .bind(finalText, JSON.stringify(steps), inputTokens, outputTokens, creditsUsed, now(), generationId),
      auth.db.prepare("UPDATE workspaces SET credits = MAX(0, credits - ?) WHERE id = ?").bind(creditAdjustment, auth.workspaceId),
      auth.db.prepare("INSERT INTO usage_events (id, workspace_id, generation_id, kind, units, metadata_json, created_at) VALUES (?, ?, ?, 'agent_credit', ?, ?, ?)")
        .bind(id("use"), auth.workspaceId, generationId, creditsUsed, JSON.stringify({
          model: selectedModel,
          creditsUsed,
          rawCreditsUsed,
          runCreditBudget,
          budgetLimited,
          inputTokens,
          outputTokens,
          estimatedCostUsd,
          dailyCreditsUsedBefore: spendWindow.used,
          dailyCreditsLimit: spendWindow.limit,
          sandboxChecks: steps.filter(step => step.type === "test").length,
        }), now()),
      auth.db.prepare("UPDATE projects SET updated_at = ? WHERE id = ? AND workspace_id = ?").bind(now(), projectId, auth.workspaceId),
    ]);
    reserved = false;

    const savedVersion = await auth.db.prepare("SELECT id FROM versions WHERE project_id = ? AND generation_id = ? LIMIT 1").bind(projectId, generationId).first();
    if (!savedVersion) {
      const files = await all<{ path: string; content: string; language: string }>(auth.db.prepare("SELECT path, content, language FROM project_files WHERE project_id = ? ORDER BY path").bind(projectId));
      await auth.db.prepare("INSERT INTO versions (id, project_id, generation_id, label, snapshot_json, created_at) VALUES (?, ?, ?, ?, ?, ?)")
        .bind(id("ver"), projectId, generationId, prompt.slice(0, 100), JSON.stringify(files), now()).run();
    }

    const balance = await auth.db.prepare("SELECT credits FROM workspaces WHERE id = ?").bind(auth.workspaceId).first<{ credits: number }>();
    return Response.json({
      generationId,
      status: "complete",
      result: finalText,
      steps,
      usage: {
        inputTokens,
        outputTokens,
        creditsUsed,
        creditsRemaining: balance?.credits ?? 0,
        estimatedCostUsd,
        runCreditBudget,
        budgetLimited,
        dailyCreditsUsed: spendWindow.used + creditsUsed,
        dailyCreditsLimit: spendWindow.limit,
        dailyCreditsRemaining: Math.max(0, spendWindow.limit - spendWindow.used - creditsUsed),
      },
      model: selectedModel,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Agent failed";
    const upstreamRateLimited = isUpstreamRateLimit(error);
    if (generationInserted) {
      await auth.db.prepare("UPDATE generations SET status = 'error', error = ?, steps_json = ?, updated_at = ? WHERE id = ?")
        .bind(message.slice(0, 1000), JSON.stringify(steps), now(), generationId).run();
    }
    if (reserved) {
      await auth.db.prepare("UPDATE workspaces SET credits = credits + ? WHERE id = ?")
        .bind(AGENT_RUN_RESERVATION_CREDITS, auth.workspaceId).run();
      reserved = false;
    }
    if (upstreamRateLimited) {
      return Response.json({
        generationId,
        status: "error",
        error: "The selected AI provider is busy. Your reserved credits were refunded. Retry shortly or switch to GPT 5.4 Mini.",
        code: "UPSTREAM_RATE_LIMITED",
        retryable: true,
        fallbackModel: "openai/gpt-5.4-mini",
      }, { status: 429 });
    }
    return Response.json({ generationId, status: "error", error: "The agent could not complete this run. Your reserved credits were refunded; check the AI connection and try again.", code: "AGENT_FAILED", retryable: true }, { status: 502 });
  } finally {
    await auth.db.prepare("DELETE FROM agent_run_locks WHERE workspace_id = ? AND generation_id = ?")
      .bind(auth.workspaceId, generationId).run();
  }
}
