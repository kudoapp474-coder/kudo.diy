import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("offers a one-click retry with the suggested fallback model, reusing the resume-from-checkpoint route", async () => {
  const agentRunner = await readFile(new URL("../lib/agent-runner.ts", import.meta.url), "utf8");
  const workspace = await readFile(new URL("../app/components/project-workspace.tsx", import.meta.url), "utf8");

  // The upstream-rate-limit error already names a safe fallback model; this
  // feature is the UI hookup for it, not a new backend concept.
  assert.match(agentRunner, /code: "UPSTREAM_RATE_LIMITED"/);
  assert.match(agentRunner, /fallbackModel: "openai\/gpt-5\.4-mini"/);

  // resumeRun must forward the chosen model as an override to the same
  // resume endpoint item #10 built, not spin up a separate retry pathway.
  assert.match(workspace, /async function resumeRun\(generationId: string, modelOverride\?: string\)/);
  assert.match(workspace, /body: JSON\.stringify\(modelOverride \? \{ model: modelOverride \} : \{\}\)/);
  assert.match(workspace, /Retry with \$\{agentModelLabel\(message\.fallbackModel\)\}/);
});
