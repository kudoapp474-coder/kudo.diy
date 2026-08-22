import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("forces KODO to write project files before completing a build run", async () => {
  const agentApi = await readFile(new URL("../app/api/agent/route.ts", import.meta.url), "utf8");

  assert.match(agentApi, /toolName: "inspectProject"/);
  assert.match(agentApi, /toolName: "savePlan"/);
  assert.match(agentApi, /toolName: "applyProjectFiles"/);
  assert.match(agentApi, /toolName: "runChecks"/);
  assert.match(agentApi, /toolName: "createVersion"/);
  assert.match(agentApi, /toolChoice: "none"/);
  assert.match(agentApi, /files: z\.array\(z\.object/);
  assert.match(agentApi, /\.min\(1\)\.max\(12\)/);
  assert.match(agentApi, /auth\.db\.batch\(normalizedFiles\.map/);
  assert.match(agentApi, /failedChecks < 2/);
  assert.match(agentApi, /creditsUsed = madeFileEdits \? Math\.min\(rawCreditsUsed, runCreditBudget\) : 0/);
  assert.match(agentApi, /reserved credits were refunded/);
  assert.doesNotMatch(agentApi, /planned the work but did not make any file changes/);
});
