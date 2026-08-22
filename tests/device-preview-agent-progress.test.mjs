import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("shows app and game projects inside a mobile device preview", async () => {
  const [workspace, css] = await Promise.all([
    readFile(new URL("../app/components/project-workspace.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);

  assert.match(workspace, /inferPreviewKind/);
  assert.match(workspace, /app\|mobile\|android\|ios\|iphone\|game\|gaming/);
  assert.match(workspace, /phone-preview-shell/);
  assert.match(workspace, /Auto.*Phone/);
  assert.match(css, /\.phone-preview-shell/);
  assert.match(css, /aspect-ratio:390\/844/);
});

test("persists and renders honest live agent stages", async () => {
  const [workspace, runner] = await Promise.all([
    readFile(new URL("../app/components/project-workspace.tsx", import.meta.url), "utf8"),
    readFile(new URL("../lib/agent-runner.ts", import.meta.url), "utf8"),
  ]);

  for (const label of ["Inspecting project files", "Planning the experience", "Editing real project files", "Building and checking", "Saving a review version"]) {
    assert.match(workspace, new RegExp(label));
  }
  assert.match(workspace, /Live activity/);
  assert.match(workspace, /setInterval/);
  assert.match(runner, /const recordStep = async/);
  assert.match(runner, /UPDATE generations SET steps_json/);
  assert.match(runner, /await recordStep/);
});
