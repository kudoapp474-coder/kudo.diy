import type { KodoDatabase } from "./db";
import {
  AGENT_RUN_RESERVATION_CREDITS,
  agentModelPolicy,
  calculateAgentCredits,
  type AgentModelId,
} from "./agent-models";

const HOUR_MS = 60 * 60 * 1000;
const DEFAULT_CONTEXT_MAX_CHARACTERS = 120_000;
const DEFAULT_MAX_OUTPUT_TOKENS_PER_STEP = 4_096;

const PLAN_DAILY_CREDITS: Record<string, number> = {
  free: 500,
  pro: 5_000,
  team: 15_000,
};

type UsageStep = {
  usage?: {
    inputTokens?: number | null;
    outputTokens?: number | null;
  };
};

function positiveInteger(value: string | undefined, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

export function dailyAgentCreditLimit(plan: string | null | undefined) {
  const normalized = (plan ?? "free").trim().toLowerCase();
  const fallback = PLAN_DAILY_CREDITS[normalized] ?? PLAN_DAILY_CREDITS.free;
  const envName = `KODO_DAILY_AGENT_CREDITS_${normalized.toUpperCase()}`;
  return positiveInteger(process.env[envName], fallback);
}

export function projectContextCharacterLimit() {
  return positiveInteger(process.env.KODO_AGENT_CONTEXT_MAX_CHARS, DEFAULT_CONTEXT_MAX_CHARACTERS);
}

export function boundedProjectContext(files: Array<{ path: string; content: string }>) {
  const totalLimit = projectContextCharacterLimit();
  const perFileLimit = Math.min(12_000, Math.max(2_000, Math.floor(totalLimit / 12)));
  let remaining = totalLimit;
  const bounded: Array<{ path: string; content: string; truncated?: boolean }> = [];

  for (const file of files) {
    if (remaining <= 0) break;
    const take = Math.min(file.content.length, perFileLimit, remaining);
    bounded.push({
      path: file.path,
      content: file.content.slice(0, take),
      ...(take < file.content.length ? { truncated: true } : {}),
    });
    remaining -= take;
  }

  return { files: bounded, truncated: bounded.length < files.length || bounded.some(file => file.truncated) };
}

export async function workspaceAgentSpendWindow(db: KodoDatabase, workspaceId: string, plan: string) {
  const since = new Date(Date.now() - 24 * HOUR_MS).toISOString();
  const row = await db.prepare(`SELECT COALESCE(SUM(
    CASE
      WHEN status = 'running' THEN ?
      WHEN status = 'complete' THEN credits_used
      ELSE 0
    END
  ), 0) AS credits_used
  FROM generations
  WHERE workspace_id = ? AND created_at > ?`)
    .bind(AGENT_RUN_RESERVATION_CREDITS, workspaceId, since)
    .first<{ credits_used: number | string }>();
  const used = Math.max(0, Number(row?.credits_used ?? 0));
  const limit = dailyAgentCreditLimit(plan);
  return { since, used, limit, remaining: Math.max(0, limit - used) };
}

export function sumAgentStepUsage(steps: UsageStep[]) {
  return steps.reduce((totals, step) => ({
    inputTokens: totals.inputTokens + Math.max(0, Number(step.usage?.inputTokens ?? 0)),
    outputTokens: totals.outputTokens + Math.max(0, Number(step.usage?.outputTokens ?? 0)),
  }), { inputTokens: 0, outputTokens: 0 });
}

export function agentCreditStopCondition(model: AgentModelId, runCreditBudget: number) {
  return ({ steps }: { steps: UsageStep[] }) => {
    if (!steps.length) return false;
    const usage = sumAgentStepUsage(steps);
    return calculateAgentCredits(model, usage.inputTokens, usage.outputTokens) >= runCreditBudget;
  };
}

export function agentStepOutputTokenLimit(model: AgentModelId, runCreditBudget: number, steps: UsageStep[]) {
  const policy = agentModelPolicy(model);
  const usage = sumAgentStepUsage(steps);
  const weightedBudget = Math.floor((Math.max(1, runCreditBudget) * 200) / policy.creditMultiplier);
  const weightedUsed = usage.inputTokens + usage.outputTokens * 6;
  const weightedRemaining = Math.max(0, weightedBudget - weightedUsed);
  // Keep headroom for the next request's prompt/tool context before allowing output.
  const inputHeadroom = Math.min(12_000, Math.max(1_000, Math.floor(weightedRemaining * 0.35)));
  const outputByBudget = Math.floor(Math.max(0, weightedRemaining - inputHeadroom) / 6);
  const configuredMaximum = positiveInteger(process.env.KODO_AGENT_MAX_OUTPUT_TOKENS_PER_STEP, DEFAULT_MAX_OUTPUT_TOKENS_PER_STEP);
  return Math.max(256, Math.min(configuredMaximum, outputByBudget || 256));
}

export function agentSpendAlert(used: number, limit: number) {
  if (limit <= 0) return { level: "blocked" as const, percent: 100 };
  const percent = Math.round((Math.max(0, used) / limit) * 100);
  if (percent >= 100) return { level: "blocked" as const, percent };
  if (percent >= 80) return { level: "high" as const, percent };
  if (percent >= 50) return { level: "watch" as const, percent };
  return { level: "normal" as const, percent };
}
