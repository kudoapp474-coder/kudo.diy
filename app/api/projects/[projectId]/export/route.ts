import { all } from "../../../../../lib/db";
import { slugify } from "../../../../../lib/project-files";
import { requireApiUser, unauthorized } from "../../../../../lib/server-auth";
import { createZip } from "../../../../../lib/zip";

type ProjectFile = { path: string; content: string; language: string };

export async function GET(_request: Request, { params }: { params: Promise<{ projectId: string }> }) {
  const auth = await requireApiUser();
  if (!auth) return unauthorized();
  const { projectId } = await params;

  const project = await auth.db.prepare("SELECT id, name FROM projects WHERE id = ? AND workspace_id = ?").bind(projectId, auth.workspaceId).first<{ id: string; name: string }>();
  if (!project) return Response.json({ error: "Project not found." }, { status: 404 });

  // Uploaded assets are stored as blob/R2 references rather than inline
  // content (see /api/uploads), the same way the GitHub sync route excludes
  // them from the pushed tree -- this exports the real, editable project
  // source, consistent with that existing behavior.
  const files = await all<ProjectFile>(auth.db.prepare("SELECT path, content, language FROM project_files WHERE project_id = ? ORDER BY path").bind(projectId));
  const textFiles = files.filter(file => file.language !== "asset");
  if (!textFiles.length) return Response.json({ error: "This project has no files to export." }, { status: 400 });

  const zip = createZip(textFiles.map(file => ({ path: file.path, content: file.content })));
  const filename = `${slugify(project.name) || "project"}.zip`;

  return new Response(zip, {
    status: 200,
    headers: {
      "content-type": "application/zip",
      "content-disposition": `attachment; filename="${filename}"`,
      "content-length": String(zip.length),
    },
  });
}
