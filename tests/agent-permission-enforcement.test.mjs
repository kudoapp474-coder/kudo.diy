import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("enforces workspace agent permissions on the server, not just in the settings UI", async () => {
  const agentRunner = await readFile(new URL("../lib/agent-runner.ts", import.meta.url), "utf8");
  const permissions = await readFile(new URL("../lib/permissions.ts", import.meta.url), "utf8");
  const settingsRoute = await readFile(new URL("../app/api/settings/route.ts", import.meta.url), "utf8");
  const permissionsRoute = await readFile(new URL("../app/api/settings/permissions/route.ts", import.meta.url), "utf8");

  assert.match(permissions, /export async function loadWorkspacePermissions/);

  // A workspace that disabled "Create branches and commits" must block the run
  // before any credits are reserved or files are touched, not merely hide a button.
  assert.match(agentRunner, /const permissions = await loadWorkspacePermissions\(db, workspaceId\)/);
  assert.match(agentRunner, /if \(!permissions\.createCommits\)/);
  assert.match(agentRunner, /code: "PERMISSION_DENIED"/);

  // Disabling "Run tests and builds" must stop the forced tool sequence from
  // ever choosing runChecks, and the tool itself must refuse as defense in depth.
  assert.match(agentRunner, /permissions\.runTests && testIndex < editIndex/);
  assert.match(agentRunner, /permissions\.runTests && steps\[testIndex\]\?\.status === "failed"/);
  assert.match(agentRunner, /if \(!permissions\.runTests\) \{/);

  // Only the owner or an admin can change the permissions that gate the agent.
  assert.match(settingsRoute, /canManageMembers\(auth\.role\)/);
  assert.match(permissionsRoute, /canManageMembers\(auth\.role\)/);
});
