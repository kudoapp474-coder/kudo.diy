import { createHash, timingSafeEqual } from "node:crypto";
import { ToolLoopAgent, isStepCount } from "ai";
import { all, ensureDatabase, id, now } from "../../../../lib/db";
import {
  AGENT_MODELS,
  AGENT_RUN_RESERVATION_CREDITS,
  calculateAgentCredits,
  estimateAgentCostUsd,
} from "../../../../lib/agent-models";

export const runtime = "nodejs";
export const maxDuration = 300;

const EXPECTED_KEY_SHA256 = "24a09e6bdc015207b16e5f4e52d7587f0a2f3c39d562df22196e0d25d8a1ac7c";
const STARTING_CREDITS = 500;

function authorized(request: Request) {
  const key = new URL(request.url).searchParams.get("key") ?? "";
  const actual = Buffer.from(createHash("sha256").update(key).digest("hex"), "utf8");
  const expected = Buffer.from(EXPECTED_KEY_SHA256, "utf8");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

type SmokeRun = {
  model: string;
  status: "complete" | "error";
  generationId: string;
  inputTokens: number;
  outputTokens: number;
  creditsUsed: number;
  estimatedCostUsd: number | null;
  outputMatched: boolean;
  error?: string;
};

type ModelUsageRow = {
  model: string;
  total_generations: number | string;
  completed_generations: number | string;
  input_tokens: number | string;
  output_tokens: number | string;
  credits_used: number | string;
};

export async function GET(request: Request) {
  if (!authorized(request)) return Response.json({ error: "Not found" }, { status: 404 });
  if (!process.env.AI_GATEWAY_API_KEY && !process.env.VERCEL_OIDC_TOKEN) {
    return Response.json({ passed: false, error: "AI Gateway is not configured in this preview." }, { status: 503 });
  }

  const db = await ensureDatabase();
  const suffix = crypto.randomUUID().replaceAll("-", "").slice(0, 16);
  const workspaceId = `ws_smoke_${suffix}`;
  const projectId = `proj_smoke_${suffix}`;
  const email = `smoke-${suffix}@kodo.invalid`;
  const timestamp = now();
  const runs: SmokeRun[] = [];

  try {
    await db.batch([
      db.prepare("INSERT INTO workspaces (id, owner_email, name, slug, plan, credits, created_at) VALUES (?, ?, ?, ?, 'free', ?, ?)")
        .bind(workspaceId, email, "Three-model smoke workspace", `smoke-${suffix}`, STARTING_CREDITS, timestamp),
      db.prepare("INSERT INTO projects (id, workspace_id, name, description, repository, branch, status, created_at, updated_at) VALUES (?, ?, ?, ?, NULL, 'main', 'draft', ?, ?)")
        .bind(projectId, workspaceId, "Three-model smoke project", "Temporary provider, billing and analytics verification", timestamp, timestamp),
    ]);

    for (const model of AGENT_MODELS) {
      const reservation = await db.prepare("UPDATE workspaces SET credits = credits - ? WHERE id = ? AND credits >= ?")
        .bind(AGENT_RUN_RESERVATION_CREDITS, workspaceId, AGENT_RUN_RESERVATION_CREDITS).run();
      if ((reservation.meta?.changes ?? 0) === 0) {
        runs.push({ model: model.id, status: "error", generationId: "", inputTokens: 0, outputTokens: 0, creditsUsed: 0, estimatedCostUsd: null, outputMatched: false, error: "Reservation failed" });
        continue;
      }

      const generationId = id("gen");
      await db.prepare("INSERT INTO generations (id, workspace_id, project_id, user_email, model, prompt, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, 'running', ?, ?)")
        .bind(generationId, workspaceId, projectId, email, model.id, "Reply exactly KODO_SMOKE_OK", now(), now()).run();

      try {
        const agent = new ToolLoopAgent({
          model: model.id,
          instructions: "This is a production connectivity smoke test. Reply exactly KODO_SMOKE_OK and do not add any other text.",
          stopWhen: isStepCount(1),
        });
        const result = await agent.generate({ prompt: "Reply exactly KODO_SMOKE_OK" });
        const inputTokens = Number(result.totalUsage.inputTokens ?? 0);
        const outputTokens = Number(result.totalUsage.outputTokens ?? 0);
        const creditsUsed = calculateAgentCredits(model.id, inputTokens, outputTokens);
        const estimatedCostUsd = estimateAgentCostUsd(model.id, inputTokens, outputTokens);
        const creditAdjustment = creditsUsed - AGENT_RUN_RESERVATION_CREDITS;
        const outputMatched = result.text.trim() === "KODO_SMOKE_OK";

        await db.batch([
          db.prepare("UPDATE generations SET result = ?, steps_json = '[]', status = 'complete', input_tokens = ?, output_tokens = ?, credits_used = ?, updated_at = ? WHERE id = ?")
            .bind(result.text.slice(0, 1000), inputTokens, outputTokens, creditsUsed, now(), generationId),
          db.prepare("UPDATE workspaces SET credits = MAX(0, credits - ?) WHERE id = ?")
            .bind(creditAdjustment, workspaceId),
          db.prepare("INSERT INTO usage_events (id, workspace_id, generation_id, kind, units, metadata_json, created_at) VALUES (?, ?, ?, 'agent_credit', ?, ?, ?)")
            .bind(id("use"), workspaceId, generationId, creditsUsed, JSON.stringify({ model: model.id, creditsUsed, inputTokens, outputTokens, estimatedCostUsd, smoke: true }), now()),
        ]);

        runs.push({ model: model.id, status: "complete", generationId, inputTokens, outputTokens, creditsUsed, estimatedCostUsd, outputMatched });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Provider call failed";
        await db.batch([
          db.prepare("UPDATE generations SET status = 'error', error = ?, updated_at = ? WHERE id = ?").bind(message.slice(0, 1000), now(), generationId),
          db.prepare("UPDATE workspaces SET credits = credits + ? WHERE id = ?").bind(AGENT_RUN_RESERVATION_CREDITS, workspaceId),
        ]);
        runs.push({ model: model.id, status: "error", generationId, inputTokens: 0, outputTokens: 0, creditsUsed: 0, estimatedCostUsd: null, outputMatched: false, error: message.slice(0, 300) });
      }
    }

    const workspace = await db.prepare("SELECT credits FROM workspaces WHERE id = ?").bind(workspaceId).first<{ credits: number | string }>();
    const history = await all<{ model: string; status: string; input_tokens: number | string; output_tokens: number | string; credits_used: number | string }>(
      db.prepare("SELECT model, status, input_tokens, output_tokens, credits_used FROM generations WHERE workspace_id = ? ORDER BY created_at").bind(workspaceId),
    );
    const usageEvents = await all<{ generation_id: string; units: number | string; metadata_json: string }>(
      db.prepare("SELECT generation_id, units, metadata_json FROM usage_events WHERE workspace_id = ? ORDER BY created_at").bind(workspaceId),
    );
    const adminGrouping = await all<ModelUsageRow>(db.prepare(`SELECT
      model,
      COUNT(*) AS total_generations,
      SUM(CASE WHEN status = 'complete' THEN 1 ELSE 0 END) AS completed_generations,
      COALESCE(SUM(input_tokens), 0) AS input_tokens,
      COALESCE(SUM(output_tokens), 0) AS output_tokens,
      COALESCE(SUM(credits_used), 0) AS credits_used
      FROM generations
      WHERE workspace_id = ?
      GROUP BY model
      ORDER BY credits_used DESC`).bind(workspaceId));

    const chargedCredits = runs.reduce((sum, run) => sum + (run.status === "complete" ? run.creditsUsed : 0), 0);
    const expectedBalance = STARTING_CREDITS - chargedCredits;
    const actualBalance = Number(workspace?.credits ?? -1);
    const allModelsCompleted = runs.length === AGENT_MODELS.length && runs.every(run => run.status === "complete");
    const usageMatches = usageEvents.length === runs.filter(run => run.status === "complete").length && usageEvents.every(event => Number(event.units) > 0);
    const historyMatches = history.length === AGENT_MODELS.length && history.every(row => row.status === "complete" && Number(row.credits_used) > 0);
    const adminMatches = adminGrouping.length === AGENT_MODELS.length && adminGrouping.every(row => Number(row.completed_generations) === 1 && Number(row.credits_used) > 0);
    const balanceMatches = actualBalance === expectedBalance;

    return Response.json({
      passed: allModelsCompleted && usageMatches && historyMatches && adminMatches && balanceMatches,
      checks: { allModelsCompleted, usageMatches, historyMatches, adminMatches, balanceMatches },
      balance: { starting: STARTING_CREDITS, charged: chargedCredits, expected: expectedBalance, actual: actualBalance },
      runs,
      history,
      adminGrouping,
      usageEventCount: usageEvents.length,
      cleanup: "Test rows are removed before this response completes.",
      timestamp: now(),
    });
  } finally {
    await db.batch([
      db.prepare("DELETE FROM usage_events WHERE workspace_id = ?").bind(workspaceId),
      db.prepare("DELETE FROM generations WHERE workspace_id = ?").bind(workspaceId),
      db.prepare("DELETE FROM project_files WHERE project_id = ?").bind(projectId),
      db.prepare("DELETE FROM versions WHERE project_id = ?").bind(projectId),
      db.prepare("DELETE FROM projects WHERE id = ?").bind(projectId),
      db.prepare("DELETE FROM workspaces WHERE id = ?").bind(workspaceId),
    ]);
  }
}
