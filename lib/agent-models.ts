export const AGENT_MODELS = [
  {
    id: "openai/gpt-5.4",
    label: "GPT 5.4",
    description: "Best quality for complex builds",
    creditLabel: "Standard credits",
    inputUsdPerMillion: 2.5,
    outputUsdPerMillion: 15,
    creditMultiplier: 1,
    minimumCredits: 20,
  },
  {
    id: "openai/gpt-5.3-codex",
    label: "GPT 5.3 Codex",
    description: "Specialized for agentic coding",
    creditLabel: "Standard credits",
    inputUsdPerMillion: 2.5,
    outputUsdPerMillion: 15,
    creditMultiplier: 1,
    minimumCredits: 20,
  },
  {
    id: "openai/gpt-5.4-mini",
    label: "GPT 5.4 Mini",
    description: "Fast and efficient for smaller edits",
    creditLabel: "About 70% fewer credits",
    inputUsdPerMillion: 0.75,
    outputUsdPerMillion: 4.5,
    creditMultiplier: 0.3,
    minimumCredits: 6,
  },
] as const;

export type AgentModelId = (typeof AGENT_MODELS)[number]["id"];
export const DEFAULT_AGENT_MODEL_ID: AgentModelId = "openai/gpt-5.4";
export const AGENT_RUN_RESERVATION_CREDITS = 20;

export function isAgentModelId(value: unknown): value is AgentModelId {
  return typeof value === "string" && AGENT_MODELS.some(model => model.id === value);
}

export function resolveAgentModelId(value: unknown): AgentModelId {
  return isAgentModelId(value) ? value : DEFAULT_AGENT_MODEL_ID;
}

export function agentModelLabel(value: unknown) {
  return AGENT_MODELS.find(model => model.id === value)?.label ?? "KODO model";
}

export function agentModelPolicy(value: unknown) {
  return AGENT_MODELS.find(model => model.id === value) ?? AGENT_MODELS[0];
}

export function calculateAgentCredits(model: unknown, inputTokens: number, outputTokens: number) {
  const policy = agentModelPolicy(model);
  const safeInput = Math.max(0, Number.isFinite(inputTokens) ? inputTokens : 0);
  const safeOutput = Math.max(0, Number.isFinite(outputTokens) ? outputTokens : 0);
  // GPT 5.4-family output tokens cost 6x input tokens in the Gateway catalog.
  // Dividing weighted tokens by 200 preserves the old KODO credit curve for a typical 80/20 input/output run.
  const weightedTokenCredits = Math.ceil(((safeInput + safeOutput * 6) / 200) * policy.creditMultiplier);
  return Math.max(policy.minimumCredits, weightedTokenCredits);
}

export function estimateAgentCostUsd(model: unknown, inputTokens: number, outputTokens: number) {
  const policy = agentModelPolicy(model);
  const safeInput = Math.max(0, Number.isFinite(inputTokens) ? inputTokens : 0);
  const safeOutput = Math.max(0, Number.isFinite(outputTokens) ? outputTokens : 0);
  return (safeInput * policy.inputUsdPerMillion + safeOutput * policy.outputUsdPerMillion) / 1_000_000;
}
