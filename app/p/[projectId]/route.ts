import { ensureDatabase } from "../../../lib/db";
import { renderProjectDocument, type ProjectFileRecord } from "../../../lib/project-files";

export async function GET(_request: Request, { params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const db = await ensureDatabase();
  const deployment = await db.prepare("SELECT version_id FROM deployments WHERE project_id = ? AND status = 'ready' ORDER BY created_at DESC LIMIT 1").bind(projectId).first<{ version_id: string }>();
  if (!deployment) return new Response("Published project not found", { status: 404 });
  const [project, version] = await Promise.all([
    db.prepare("SELECT name FROM projects WHERE id = ?").bind(projectId).first<{ name: string }>(),
    db.prepare("SELECT snapshot_json FROM versions WHERE id = ? AND project_id = ?").bind(deployment.version_id, projectId).first<{ snapshot_json: string }>(),
  ]);
  if (!version) return new Response("Published version not found", { status: 404 });
  let files: ProjectFileRecord[] = [];
  try { files = JSON.parse(version.snapshot_json) as ProjectFileRecord[]; } catch { return new Response("Published version is invalid", { status: 500 }); }
  const html = renderProjectDocument(files, project?.name ?? "KODO project");
  return new Response(html, {
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "public, max-age=0, s-maxage=60, stale-while-revalidate=300",
      "content-security-policy": "sandbox allow-scripts allow-forms allow-popups; default-src 'self' https: data: blob:; img-src 'self' https: data: blob:; style-src 'unsafe-inline' https:; script-src 'unsafe-inline' https:; connect-src https:; font-src https: data:; frame-src https:;",
      "referrer-policy": "no-referrer",
      "x-content-type-options": "nosniff",
    },
  });
}
