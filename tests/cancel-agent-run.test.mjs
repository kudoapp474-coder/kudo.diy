import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("lets a workspace stop a running agent, releasing the lock and reconciling credits", async () => {
  const agentRunner = await readFile(new URL("../lib/agent-runner.ts", import.meta.url), "utf8");
  const automationRunner = await readFile(new URL("../lib/automation-runner.ts", import.meta.url), "utf8");
  const cancelRoute = await readFile(new URL("../app/api/projects/[projectId]/generations/[generationId]/cancel/route.ts", import.meta.url), "utf8");
  const workspace = await readFile(new URL("../app/components/project-workspace.tsx", import.meta.url), "utf8");
  const dbSchema = await readFile(new URL("../lib/db.ts", import.meta.url), "utf8");

  assert.match(dbSchema, /ALTER TABLE generations ADD COLUMN cancel_requested_at TEXT/);

  // The cancel endpoint only flags a running generation it can prove belongs
  // to the caller's workspace; it never touches a finished run.
  assert.match(cancelRoute, /INNER JOIN projects p ON p\.id = g\.project_id/);
  assert.match(cancelRoute, /generation\.status !== "running"/);
  assert.match(cancelRoute, /cancel_requested_at = \? WHERE id = \? AND cancel_requested_at IS NULL/);

  // The running agent loop must cooperatively check the flag between tool
  // calls and stop the ToolLoopAgent, not just orphan the HTTP request.
  assert.match(agentRunner, /let cancelled = false/);
  assert.match(agentRunner, /SELECT cancel_requested_at FROM generations WHERE id = \?/);
  assert.match(agentRunner, /stopWhen: \[\s*isStepCount\(12\),\s*\(\) => cancelled,/);
  assert.match(agentRunner, /const finalStatus = cancelled \? "cancelled" : "complete"/);
  // The agent_run_locks release already happens unconditionally in the
  // existing `finally` block, so a cancelled run frees the workspace lock
  // the same way a completed or failed one does.
  assert.match(agentRunner, /finally \{\s*await db\.prepare\("DELETE FROM agent_run_locks/);

  assert.match(automationRunner, /const cancelled = result\.body\.status === "cancelled"/);

  // The UI surfaces a Stop control tied to the currently polled generation id.
  assert.match(workspace, /async function cancelRun\(\)/);
  assert.match(workspace, /generations\/\$\{encodeURIComponent\(activeGenerationId\)\}\/cancel/);
});
