import { env } from "kodo-runtime-env";
import { put } from "@vercel/blob";
import { id, now } from "../../../lib/db";
import { requireApiUser, unauthorized } from "../../../lib/server-auth";

export async function POST(request: Request) {
  const auth = await requireApiUser();
  if (!auth) return unauthorized();
  const form = await request.formData();
  const file = form.get("file");
  const projectId = String(form.get("projectId") ?? "");
  if (!(file instanceof File) || !projectId) return Response.json({ error: "file and projectId are required." }, { status: 400 });
  if (file.size > 10 * 1024 * 1024) return Response.json({ error: "File must be smaller than 10 MB." }, { status: 413 });
  const project = await auth.db.prepare("SELECT id FROM projects WHERE id = ? AND workspace_id = ?").bind(projectId, auth.workspaceId).first();
  if (!project) return Response.json({ error: "Project not found." }, { status: 404 });
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 180);
  const key = `workspaces/${auth.workspaceId}/projects/${projectId}/uploads/${crypto.randomUUID()}-${safeName}`;
  let storageReference: string;
  if (process.env.BLOB_READ_WRITE_TOKEN) {
    const blob = await put(key, file, {
      access: "private",
      addRandomSuffix: false,
      contentType: file.type || "application/octet-stream",
      maximumSizeInBytes: 10 * 1024 * 1024,
    });
    storageReference = blob.url;
  } else if (env.BUCKET) {
    await env.BUCKET.put(key, file.stream(), { httpMetadata: { contentType: file.type || "application/octet-stream" } });
    storageReference = `r2://${key}`;
  } else {
    return Response.json({ error: "Object storage is not configured.", code: "SETUP_REQUIRED" }, { status: 503 });
  }
  await auth.db.prepare("INSERT INTO project_files (id, project_id, path, content, language, updated_at) VALUES (?, ?, ?, ?, 'asset', ?) ON CONFLICT(project_id, path) DO UPDATE SET content = excluded.content, updated_at = excluded.updated_at")
    .bind(id("file"), projectId, `uploads/${safeName}`, storageReference, now()).run();
  return Response.json({ file: { name: safeName, path: `uploads/${safeName}`, size: file.size, type: file.type } }, { status: 201 });
}
