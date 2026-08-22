import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("keeps the visual project preview synchronized while an agent is building", async () => {
  const [page, sync] = await Promise.all([
    readFile(new URL("../app/project/[projectId]/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/components/live-project-preview-sync.tsx", import.meta.url), "utf8"),
  ]);

  assert.match(page, /LiveProjectPreviewSync/);
  assert.match(sync, /\/api\/projects\/\$\{encodeURIComponent\(projectId\)\}/);
  assert.match(sync, /generation\.status === "running"/);
  assert.match(sync, /agentRunning \? 900 : 2_500/);
  assert.match(sync, /\.live-preview iframe/);
  assert.match(sync, /renderProjectDocument/);
  assert.match(sync, /iframe\.srcdoc/);
});
