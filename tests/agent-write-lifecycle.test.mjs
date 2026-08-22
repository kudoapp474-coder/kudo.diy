import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("forces KODO to write project files before completing a build run", async () => {
  // The agent execution core moved from app/api/agent/route.ts into
  // lib/agent-runner.ts so it can be shared with automation-triggered runs;
  // route.ts is now a thin wrapper that delegates to it.
  const agentApi = await readFile(new URL("../lib/agent-runner.ts", import.meta.url), "utf8");
  const routeWrapper = await readFile(new URL("../app/api/agent/route.ts", import.meta.url), "utf8");

  assert.match(agentApi, /toolName: "inspectProject"/);
  assert.match(agentApi, /toolName: "savePlan"/);
  assert.match(agentApi, /toolName: "applyProjectFiles"/);
  assert.match(agentApi, /toolName: "runChecks"/);
  assert.match(agentApi, /toolName: "createVersion"/);
  assert.match(agentApi, /toolChoice: "none"/);
  assert.match(agentApi, /files: z\.array\(z\.object/);
  assert.match(agentApi, /\.min\(1\)\.max\(12\)/);
  assert.match(agentApi, /db\.batch\(normalizedFiles\.map/);
  assert.match(agentApi, /failedChecks < 2/);
  assert.match(agentApi, /creditsUsed = madeFileEdits \? Math\.min\(rawCreditsUsed, runCreditBudget\) : 0/);
  assert.match(agentApi, /reserved credits were refunded/);
  assert.doesNotMatch(agentApi, /planned the work but did not make any file changes/);
  assert.match(routeWrapper, /runKodoAgent/);
});
