import { id, now, type KodoDatabase } from "./db";
import { runKodoAgent, type AgentRunResult } from "./agent-runner";

export type AutomationTrigger = "manual" | "schedule" | "github";

export async function runAutomation(params: {
  db: KodoDatabase;
  automationId: string;
  workspaceId: string;
  projectId: string;
  userEmail: string;
  prompt: string;
  trigger: AutomationTrigger;
}): Promise<{ runId: string; result: AgentRunResult }> {
  const { db, automationId, workspaceId, projectId, userEmail, prompt, trigger } = params;
  const runId = id("arun");
  const startedAt = now();
  await db.prepare("INSERT INTO automation_runs (id, automation_id, workspace_id, trigger, status, created_at, updated_at) VALUES (?, ?, ?, ?, 'running', ?, ?)")
    .bind(runId, automationId, workspaceId, trigger, startedAt, startedAt).run();

  const result = await runKodoAgent({ db, workspaceId, userEmail, projectId, prompt });
  const generationId = typeof result.body.generationId === "string" ? result.body.generationId : null;
  const cancelled = result.body.status === "cancelled";
  const success = result.httpStatus === 200 && result.body.status === "complete";
  const status = cancelled ? "cancelled" : success ? "complete" : "error";
  const errorMessage = !success && !cancelled ? (typeof result.body.error === "string" ? result.body.error.slice(0, 600) : "Automation run failed.") : null;
  const completedAt = now();

  await db.batch([
    db.prepare("UPDATE automation_runs SET generation_id = ?, status = ?, error = ?, updated_at = ? WHERE id = ?")
      .bind(generationId, status, errorMessage, completedAt, runId),
    db.prepare("UPDATE automations SET last_run_at = ? WHERE id = ?").bind(completedAt, automationId),
  ]);

  return { runId, result };
}
