export const AGENT_MODELS = [
  {
    id: "openai/gpt-5.4",
    label: "GPT 5.4",
    description: "Best quality for complex builds",
  },
  {
    id: "openai/gpt-5.3-codex",
    label: "GPT 5.3 Codex",
    description: "Specialized for agentic coding",
  },
  {
    id: "openai/gpt-5.4-mini",
    label: "GPT 5.4 Mini",
    description: "Fast and efficient for smaller edits",
  },
] as const;

export type AgentModelId = (typeof AGENT_MODELS)[number]["id"];
export const DEFAULT_AGENT_MODEL_ID: AgentModelId = "openai/gpt-5.4";

export function isAgentModelId(value: unknown): value is AgentModelId {
  return typeof value === "string" && AGENT_MODELS.some(model => model.id === value);
}

export function resolveAgentModelId(value: unknown): AgentModelId {
  return isAgentModelId(value) ? value : DEFAULT_AGENT_MODEL_ID;
}

export function agentModelLabel(value: unknown) {
  return AGENT_MODELS.find(model => model.id === value)?.label ?? "KODO model";
}
