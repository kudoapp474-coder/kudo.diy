import { ToolLoopAgent, isStepCount, tool } from "ai";
import { z } from "zod";
import { all, id, now, type KodoDatabase } from "./db";
import { safeProjectPath, starterProjectFiles } from "./project-files";
import {
  AGENT_RUN_RESERVATION_CREDITS,
  DEFAULT_AGENT_MODEL_ID,
  calculateAgentCredits,
  estimateAgentCostUsd,
  isAgentModelId,
  type AgentModelId,
} from "./agent-models";
import {
  agentCreditStopCondition,
  agentStepOutputTokenLimit,
  boundedProjectContext,
  workspaceAgentSpendWindow,
} from "./agent-spend";
import { nativeSandboxConfigured, runProjectChecks } from "./vercel-sandbox";

const CONFIGURED_DEFAULT_MODEL = isAgentModelId(process.env.KODO_MODEL) ? process.env.KODO_MODEL : DEFAULT_AGENT_MODEL_ID;
const STALE_AGENT_LOCK_MS = 10 * 60 * 1000;

export type AgentRunResult = { httpStatus: number; body: Record<string, unknown> };

type AgentStep = { type: string; label: string; status: string };

function lastStepIndex(steps: AgentStep[], type: string) {
  for (let index = steps.length - 1; index >= 0; index -= 1) {
    if (steps[index]?.type === type) return index;
  }
  return -1;
}

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

export async function runKodoAgent(params: {
  db: KodoDatabase;
  workspaceId: string;
  userEmail: string;
  projectId: string;
  prompt: string;
  model?: string;
}): Promise<AgentRunResult> {
  const { db, workspaceId, userEmail, projectId, prompt } = params;
  const requestedModel = params.model?.trim();
  if (requestedModel && !isAgentModelId(requestedModel)) return { httpStatus: 400, body: { error: "This AI model is not available.", code: "INVALID_MODEL" } };
  const selectedModel: AgentModelId = requestedModel && isAgentModelId(requestedModel) ? requestedModel : CONFIGURED_DEFAULT_MODEL;

  const recentRuns = await db.prepare("SELECT COUNT(*) AS count FROM generations WHERE user_email = ? AND created_at > ?")
    .bind(userEmail, new Date(Date.now() - 60_000).toISOString()).first<{ count: number }>();
  if ((recentRuns?.count ?? 0) >= 5) return { httpStatus: 429, body: { error: "Too many agent runs. Try again in one minute.", code: "RATE_LIMITED" } };

  const existingProject = await db.prepare("SELECT id, name, description FROM projects WHERE id = ? AND workspace_id = ?")
    .bind(projectId, workspaceId).first<{ id: string; name: string; description: string }>();
  if (!existingProject) return { httpStatus: 404, body: { error: "Project not found." } };

  const existingFiles = await db.prepare("SELECT COUNT(*) AS count FROM project_files WHERE project_id = ?")
    .bind(projectId).first<{ count: number | string }>();
  if (Number(existingFiles?.count ?? 0) === 0) {
    const timestamp = now();
    await db.batch(starterProjectFiles(existingProject.name).map(file => db.prepare("INSERT INTO project_files (id, project_id, path, content, language, updated_at) VALUES (?, ?, ?, ?, ?, ?)")
      .bind(id("file"), projectId, file.path, file.content, file.language ?? "text", timestamp)));
  }

  if (!process.env.AI_GATEWAY_API_KEY && !process.env.VERCEL_OIDC_TOKEN) {
    return { httpStatus: 503, body: { status: "setup_required", error: "Connect Vercel AI Gateway in Integrations to run KODO on a real model.", connectUrl: "/integrations" } };
  }

  const workspace = await db.prepare("SELECT plan, credits FROM workspaces WHERE id = ?")
    .bind(workspaceId).first<{ plan: string; credits: number | string }>();
  if (!workspace) return { httpStatus: 404, body: { error: "Workspace not found." } };

  const balanceBeforeRun = Math.max(0, Number(workspace.credits ?? 0));
  const spendWindow = await workspaceAgentSpendWindow(db, workspaceId, workspace.plan);
  if (spendWindow.remaining < AGENT_RUN_RESERVATION_CREDITS) {
    return {
      httpStatus: 429,
      body: {
        error: `This workspace reached its ${spendWindow.limit.toLocaleString("en-IN")}-credit rolling 24-hour AI limit. Earlier runs must leave the 24-hour window before another agent can start.`,
        code: "DAILY_CREDIT_LIMIT_REACHED",
        dailyCreditsUsed: spendWindow.used,
        dailyCreditsLimit: spendWindow.limit,
      },
    };
  }
  if (balanceBeforeRun < AGENT_RUN_RESERVATION_CREDITS) {
    return { httpStatus: 402, body: { error: "Not enough credits. Recharge before starting this agent.", code: "INSUFFICIENT_CREDITS", creditsRequired: AGENT_RUN_RESERVATION_CREDITS } };
  }

  const runCreditBudget = Math.max(AGENT_RUN_RESERVATION_CREDITS, Math.floor(Math.min(balanceBeforeRun, spendWindow.remaining)));
  const generationId = id("gen");
  const timestamp = now();
  const staleBefore = new Date(Date.now() - STALE_AGENT_LOCK_MS).toISOString();
  await db.prepare("DELETE FROM agent_run_locks WHERE workspace_id = ? AND acquired_at < ?").bind(workspaceId, staleBefore).run();
  const lock = await db.prepare("INSERT OR IGNORE INTO agent_run_locks (workspace_id, generation_id, acquired_at) VALUES (?, ?, ?)")
    .bind(workspaceId, generationId, timestamp).run();
  if ((lock.meta?.changes ?? 0) === 0) {
    return { httpStatus: 409, body: { error: "Another KODO agent is already running in this workspace. Let it finish before starting another run.", code: "AGENT_ALREADY_RUNNING" } };
  }

  let reserved = false;
  let generationInserted = false;
  const steps: AgentStep[] = [];

  try {
    const reservation = await db.prepare("UPDATE workspaces SET credits = credits - ? WHERE id = ? AND credits >= ?")
      .bind(AGENT_RUN_RESERVATION_CREDITS, workspaceId, AGENT_RUN_RESERVATION_CREDITS).run();
    if ((reservation.meta?.changes ?? 0) === 0) {
      return { httpStatus: 402, body: { error: "Not enough credits. Recharge before starting this agent.", code: "INSUFFICIENT_CREDITS", creditsRequired: AGENT_RUN_RESERVATION_CREDITS } };
    }
    reserved = true;

    await db.prepare("INSERT INTO generations (id, workspace_id, project_id, user_email, model, prompt, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, 'running', ?, ?)")
      .bind(generationId, workspaceId, projectId, userEmail, selectedModel, prompt.slice(0, 12000), timestamp, timestamp).run();
    generationInserted = true;

    const agent = new ToolLoopAgent({
      model: selectedModel,
      instructions: `You are KODO, a production website coding agent. You must implement the user's request in the project files, not merely describe a design or print code in chat.
The build lifecycle is enforced: inspect the project, save a concise plan, apply all necessary file changes, run the production check, repair failed checks when possible, create a version, then summarize the result.
The instant preview runtime is a dependency-free static web project. For a new or redesigned experience, implement the complete visual result in index.html, styles.css and script.js. Keep package.json and scripts/build.mjs working. Use compact production code so the complete implementation fits in the file-application step. You may use remote HTTPS image, video and font URLs, but do not add npm dependencies or frameworks unless the user explicitly asks and the static preview still works.
When applyProjectFiles is requested, send the complete contents of every file required to implement the plan in that single tool call. For full website/app builds, normally include index.html, styles.css and script.js together. Preserve unrelated existing files. Never put prose, markdown fences, or explanations inside file contents.
Every website must be responsive, accessible, visually polished, and use real copy instead of placeholders. Implement interactions in script.js. Never claim a check passed if the sandbox reports skipped or failed. Keep the final response concise and list the files changed.`,
      stopWhen: [isStepCount(12), agentCreditStopCondition(selectedModel, runCreditBudget)],
      prepareStep: ({ steps: completedSteps }) => {
        const maxOutputTokens = agentStepOutputTokenLimit(selectedModel, runCreditBudget, completedSteps);
        if (lastStepIndex(steps, "read") < 0) {
          return { maxOutputTokens, toolChoice: { type: "tool", toolName: "inspectProject" } };
        }
        if (lastStepIndex(steps, "plan") < 0) {
          return { maxOutputTokens, toolChoice: { type: "tool", toolName: "savePlan" } };
        }

        const versionIndex = lastStepIndex(steps, "version");
        if (versionIndex >= 0) return { maxOutputTokens, toolChoice: "none" as const };

        const editIndex = lastStepIndex(steps, "edit");
        const testIndex = lastStepIndex(steps, "test");
        const failedChecks = steps.filter(step => step.type === "test" && step.status === "failed").length;

        if (editIndex < 0) {
          return { maxOutputTokens, toolChoice: { type: "tool", toolName: "applyProjectFiles" } };
        }
        if (testIndex < editIndex) {
          return { maxOutputTokens, toolChoice: { type: "tool", toolName: "runChecks" } };
        }
        if (steps[testIndex]?.status === "failed" && failedChecks < 2) {
          return { maxOutputTokens, toolChoice: { type: "tool", toolName: "applyProjectFiles" } };
        }
        return { maxOutputTokens, toolChoice: { type: "tool", toolName: "createVersion" } };
      },
      tools: {
        inspectProject: tool({
          description: "Read the current project file paths and their text content.",
          inputSchema: z.object({}),
          execute: async () => {
            steps.push({ type: "read", label: "Inspected project files", status: "complete" });
            const files = await all<{ path: string; content: string }>(db.prepare("SELECT path, content FROM project_files WHERE project_id = ? ORDER BY path LIMIT 80").bind(projectId));
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
        applyProjectFiles: tool({
          description: "Apply the complete set of text file changes required by the plan in one batch. Include every file needed for the requested result, not a partial sketch.",
          inputSchema: z.object({
            files: z.array(z.object({
              path: z.string().min(1).max(240),
              content: z.string().max(120000),
              language: z.string().max(40).default("text"),
            })).min(1).max(12),
          }),
          execute: async ({ files }) => {
            const normalizedFiles = files.map(file => ({ ...file, normalizedPath: safeProjectPath(file.path) }));
            const invalid = normalizedFiles.find(file => !file.normalizedPath);
            if (invalid) return { saved: false, error: `Unsafe project path: ${invalid.path}` };
            const paths = normalizedFiles.map(file => file.normalizedPath as string);
            if (new Set(paths).size !== paths.length) return { saved: false, error: "Duplicate project paths in one file batch." };

            const updatedAt = now();
            await db.batch(normalizedFiles.map(file => db.prepare("INSERT INTO project_files (id, project_id, path, content, language, updated_at) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(project_id, path) DO UPDATE SET content = excluded.content, language = excluded.language, updated_at = excluded.updated_at")
              .bind(id("file"), projectId, file.normalizedPath as string, file.content, file.language, updatedAt)));
            for (const file of normalizedFiles) {
              steps.push({ type: "edit", label: `Updated ${file.normalizedPath}`, status: "complete" });
            }
            return {
              saved: true,
              files: normalizedFiles.map(file => ({ path: file.normalizedPath, characters: file.content.length })),
            };
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
            const files = await all<{ path: string; content: string }>(db.prepare("SELECT path, content FROM project_files WHERE project_id = ?").bind(projectId));
            const result = await runProjectChecks(files, command);
            steps.push({ type: "test", label: result.status === "passed" ? "Build and tests passed" : "Checks failed", status: result.status === "passed" ? "complete" : "failed" });
            return result;
          },
        }),
        createVersion: tool({
          description: "Create an immutable project checkpoint after edits and checks.",
          inputSchema: z.object({ label: z.string().min(1).max(120) }),
          execute: async ({ label }) => {
            const files = await all<{ path: string; content: string; language: string }>(db.prepare("SELECT path, content, language FROM project_files WHERE project_id = ? ORDER BY path").bind(projectId));
            const versionId = id("ver");
            await db.prepare("INSERT INTO versions (id, project_id, generation_id, label, snapshot_json, created_at) VALUES (?, ?, ?, ?, ?, ?)")
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
    const madeFileEdits = steps.some(step => step.type === "edit");
    const creditsUsed = madeFileEdits ? Math.min(rawCreditsUsed, runCreditBudget) : 0;
    const budgetLimited = rawCreditsUsed >= runCreditBudget;
    if (budgetLimited) steps.push({ type: "budget", label: `Stopped at the ${runCreditBudget.toLocaleString("en-IN")}-credit run budget`, status: "complete" });
    const creditAdjustment = creditsUsed - AGENT_RUN_RESERVATION_CREDITS;
    const estimatedCostUsd = estimateAgentCostUsd(selectedModel, inputTokens, outputTokens);
    const finalText = !madeFileEdits
      ? "KODO did not save any file changes in this run, so your reserved credits were refunded. Please retry the build."
      : result.text.trim() || (budgetLimited
        ? "KODO reached the available credit budget after saving changes. Review the live preview, then add credits or switch to GPT 5.4 Mini to continue."
        : "KODO completed the run and saved the project changes.");

    await db.batch([
      db.prepare("UPDATE generations SET result = ?, steps_json = ?, status = 'complete', input_tokens = ?, output_tokens = ?, credits_used = ?, updated_at = ? WHERE id = ?")
        .bind(finalText, JSON.stringify(steps), inputTokens, outputTokens, creditsUsed, now(), generationId),
      db.prepare("UPDATE workspaces SET credits = MAX(0, credits - ?) WHERE id = ?").bind(creditAdjustment, workspaceId),
      db.prepare("INSERT INTO usage_events (id, workspace_id, generation_id, kind, units, metadata_json, created_at) VALUES (?, ?, ?, 'agent_credit', ?, ?, ?)")
        .bind(id("use"), workspaceId, generationId, creditsUsed, JSON.stringify({
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
          madeFileEdits,
        }), now()),
      db.prepare("UPDATE projects SET updated_at = ? WHERE id = ? AND workspace_id = ?").bind(now(), projectId, workspaceId),
    ]);
    reserved = false;

    if (madeFileEdits) {
      const savedVersion = await db.prepare("SELECT id FROM versions WHERE project_id = ? AND generation_id = ? LIMIT 1").bind(projectId, generationId).first();
      if (!savedVersion) {
        const files = await all<{ path: string; content: string; language: string }>(db.prepare("SELECT path, content, language FROM project_files WHERE project_id = ? ORDER BY path").bind(projectId));
        await db.prepare("INSERT INTO versions (id, project_id, generation_id, label, snapshot_json, created_at) VALUES (?, ?, ?, ?, ?, ?)")
          .bind(id("ver"), projectId, generationId, prompt.slice(0, 100), JSON.stringify(files), now()).run();
      }
    }

    const balance = await db.prepare("SELECT credits FROM workspaces WHERE id = ?").bind(workspaceId).first<{ credits: number }>();
    return {
      httpStatus: 200,
      body: {
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
      },
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Agent failed";
    const upstreamRateLimited = isUpstreamRateLimit(error);
    if (generationInserted) {
      await db.prepare("UPDATE generations SET status = 'error', error = ?, steps_json = ?, updated_at = ? WHERE id = ?")
        .bind(message.slice(0, 1000), JSON.stringify(steps), now(), generationId).run();
    }
    if (reserved) {
      await db.prepare("UPDATE workspaces SET credits = credits + ? WHERE id = ?")
        .bind(AGENT_RUN_RESERVATION_CREDITS, workspaceId).run();
      reserved = false;
    }
    if (upstreamRateLimited) {
      return {
        httpStatus: 429,
        body: {
          generationId,
          status: "error",
          error: "The selected AI provider is busy. Your reserved credits were refunded. Retry shortly or switch to GPT 5.4 Mini.",
          code: "UPSTREAM_RATE_LIMITED",
          retryable: true,
          fallbackModel: "openai/gpt-5.4-mini",
        },
      };
    }
    return { httpStatus: 502, body: { generationId, status: "error", error: "The agent could not complete this run. Your reserved credits were refunded; check the AI connection and try again.", code: "AGENT_FAILED", retryable: true } };
  } finally {
    await db.prepare("DELETE FROM agent_run_locks WHERE workspace_id = ? AND generation_id = ?")
      .bind(workspaceId, generationId).run();
  }
}
