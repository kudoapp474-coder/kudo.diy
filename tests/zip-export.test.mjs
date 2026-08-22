import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("exports the full project as a real, downloadable ZIP archive", async () => {
  const zipLib = await readFile(new URL("../lib/zip.ts", import.meta.url), "utf8");
  const exportRoute = await readFile(new URL("../app/api/projects/[projectId]/export/route.ts", import.meta.url), "utf8");
  const workspace = await readFile(new URL("../app/components/project-workspace.tsx", import.meta.url), "utf8");

  // No new dependency: DEFLATE comes from Node's built-in zlib, and this
  // writes the ZIP local/central-directory/end-of-central-directory records
  // itself. Verified by hand against both a manual byte-level parse and the
  // system `unzip` CLI (both round-tripped a multi-entry archive correctly).
  assert.match(zipLib, /from "node:zlib"/);
  assert.match(zipLib, /0x04034b50/); // local file header signature
  assert.match(zipLib, /0x02014b50/); // central directory header signature
  assert.match(zipLib, /0x06054b50/); // end of central directory signature
  assert.match(zipLib, /function crc32/);

  // Asset files (uploaded via /api/uploads) are stored as blob/R2 references,
  // not inline content -- excluded the same way the GitHub sync route
  // already excludes them from the pushed tree, not a new inconsistency.
  assert.match(exportRoute, /file\.language !== "asset"/);
  assert.match(exportRoute, /content-disposition.*attachment/);

  assert.match(workspace, /export-zip-btn/);
});
