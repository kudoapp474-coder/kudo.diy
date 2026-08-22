import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("resumes a failed or stopped run from its last checkpoint instead of starting over", async () => {
  const agentRunner = await readFile(new URL("../lib/agent-runner.ts", import.meta.url), "utf8");
  const resumeRoute = await readFile(new URL("../app/api/projects/[projectId]/generations/[generationId]/resume/route.ts", import.meta.url), "utf8");
  const dbSchema = await readFile(new URL("../lib/db.ts", import.meta.url), "utf8");
  const workspace = await readFile(new URL("../app/components/project-workspace.tsx", import.meta.url), "utf8");

  assert.match(dbSchema, /ALTER TABLE generations ADD COLUMN resumed_from TEXT/);

  // Resuming only makes sense for a run that actually stopped short.
  assert.match(agentRunner, /source\.status !== "error" && source\.status !== "cancelled"/);
  assert.match(agentRunner, /Only a failed or stopped run can be resumed/);

  // The whole point: seed the new run's step history from the failed run so
  // the existing prepareStep state machine skips phases already done
  // (read/plan/edit/test) instead of redoing them from scratch.
  assert.match(agentRunner, /const steps: AgentStep\[\] = \[\.\.\.resumeSteps\]/);
  assert.match(agentRunner, /resumedFrom = resumeFromGenerationId/);
  assert.match(agentRunner, /resumed_from, steps_json/);

  // The resume route needs no prompt from the caller -- runKodoAgent derives
  // the original prompt and model from the source generation itself.
  assert.doesNotMatch(resumeRoute, /prompt:/);
  assert.match(resumeRoute, /resumeFromGenerationId: generationId/);

  assert.match(workspace, /async function resumeRun\(generationId: string\)/);
  assert.match(workspace, /Resume from checkpoint/);
});
