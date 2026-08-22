import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("renders the production landing page", async () => {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  const response = await worker.fetch(
    new Request("http://localhost/", {
      headers: { accept: "text/html" },
    }),
    {
      ASSETS: {
        fetch: async () => new Response("Not found", { status: 404 }),
      },
    },
    {
      waitUntil() {},
      passThroughOnException() {},
    },
  );

  assert.equal(response.status, 200);
  assert.match(
    response.headers.get("content-type") ?? "",
    /^text\/html\b/i,
  );
  const html = await response.text();
  assert.match(html, /<title>KODO — AI Coding Agent for Ambitious Software<\/title>/i);
  assert.match(html, /Build ambitious(?:<br\s*\/?>|\s+)software with KODO\./i);
  assert.doesNotMatch(html, /Internal Server Error|Application error/i);
});

test("wires the real prompt-to-publish builder flow", async () => {
  const [workspace, builder, projectApi, agentApi, publishApi, publicProject] = await Promise.all([
    readFile(new URL("../app/components/workspace-composer.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/components/project-workspace.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/api/projects/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/agent/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/projects/[projectId]/publish/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/p/[projectId]/route.ts", import.meta.url), "utf8"),
  ]);

  assert.match(workspace, /fetch\("\/api\/projects"/);
  assert.match(projectApi, /starterProjectFiles/);
  assert.match(builder, /fetch\("\/api\/agent"/);
  assert.match(builder, /srcDoc=\{previewDocument\}/);
  assert.match(builder, /\/files`/);
  assert.match(builder, /\/publish`/);
  assert.match(agentApi, /openai\/gpt-5\.6-sol/);
  assert.match(agentApi, /runProjectChecks/);
  assert.match(publishApi, /status = 'ready'/);
  assert.match(publicProject, /renderProjectDocument/);
  assert.doesNotMatch(builder, /Acme Labs|fake code|fake publish/i);
});

test("wires live GitHub repository connections", async () => {
  const [views, manager, repositoriesApi, connectApi, callbackApi] = await Promise.all([
    readFile(new URL("../app/components/product-views.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/components/repositories-manager.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/api/github/repositories/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/github/connect/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/github/callback/route.ts", import.meta.url), "utf8"),
  ]);

  assert.match(views, /api\/github\/connect\?returnTo=\/repositories/);
  assert.match(manager, /fetch\("\/api\/github\/repositories"/);
  assert.match(repositoriesApi, /installation\/repositories\?per_page=100/);
  assert.match(repositoriesApi, /getGitHubInstallationToken/);
  assert.match(connectApi, /JSON\.stringify\(\{ state, returnTo \}\)/);
  assert.match(callbackApi, /destination\.searchParams\.set\("connected", "github"\)/);
  assert.match(callbackApi, /DELETE FROM connections WHERE workspace_id = \? AND provider = 'github_oauth_state'/);
  assert.doesNotMatch(views, /kodo\/web|kodo\/dashboard/);
});
