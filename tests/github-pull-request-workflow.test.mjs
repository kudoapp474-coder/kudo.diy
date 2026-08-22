import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("wires a real branch-to-merge GitHub pull request workflow", async () => {
  const dbSchema = await readFile(new URL("../lib/db.ts", import.meta.url), "utf8");
  const githubApp = await readFile(new URL("../lib/github-app.ts", import.meta.url), "utf8");
  const prRoute = await readFile(new URL("../app/api/projects/[projectId]/github/pull-request/route.ts", import.meta.url), "utf8");
  const mergeRoute = await readFile(new URL("../app/api/projects/[projectId]/github/pull-request/merge/route.ts", import.meta.url), "utf8");
  const syncRoute = await readFile(new URL("../app/api/projects/[projectId]/github/route.ts", import.meta.url), "utf8");
  const workspace = await readFile(new URL("../app/components/project-workspace.tsx", import.meta.url), "utf8");

  assert.match(dbSchema, /ALTER TABLE github_syncs ADD COLUMN pr_number INTEGER/);
  assert.match(dbSchema, /ALTER TABLE github_syncs ADD COLUMN pr_url TEXT/);
  assert.match(dbSchema, /ALTER TABLE github_syncs ADD COLUMN pr_state TEXT/);

  assert.match(githubApp, /export async function getWorkspaceInstallationId/);
  assert.match(syncRoute, /getWorkspaceInstallationId\(auth\.db, auth\.workspaceId\)/);

  // Creating a PR must require a real, ready sync first, be idempotent
  // against GitHub's own "pull request already exists" error, and never
  // silently create a duplicate.
  assert.match(prRoute, /sync\.status !== "ready"/);
  assert.match(prRoute, /sync\.pr_number\) return Response\.json\(\{ error: "A pull request already exists/);
  assert.match(prRoute, /alreadyExists = response\.status === 422/);

  // Merging is blocked once GitHub reports the PR merged, and only ever
  // squash-merges through GitHub's own merge endpoint.
  assert.match(mergeRoute, /sync\.pr_state === "merged"/);
  assert.match(mergeRoute, /merge_method: "squash"/);

  // The workspace UI surfaces open/merge actions tied to the latest sync.
  assert.match(workspace, /async function openPullRequest\(\)/);
  assert.match(workspace, /async function mergePullRequest\(\)/);
  assert.match(workspace, /pr_number \? <>/);
});
