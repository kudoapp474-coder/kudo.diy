import { now } from "../../../../../../lib/db";
import { requireApiUser, unauthorized } from "../../../../../../lib/server-auth";
import { refreshVercelDeployment } from "../../../../../../lib/vercel-publish";

type DeploymentRecord = {
  id: string;
  environment: string;
  status: string;
  url: string | null;
  project_id: string;
};

export async function GET(_request: Request, { params }: { params: Promise<{ projectId: string; deploymentId: string }> }) {
  const auth = await requireApiUser();
  if (!auth) return unauthorized();
  const { projectId, deploymentId } = await params;
  const deployment = await auth.db.prepare(`
    SELECT d.id, d.project_id, d.environment, d.status, d.url
    FROM deployments d
    INNER JOIN projects p ON p.id = d.project_id
    WHERE d.id = ? AND d.project_id = ? AND p.workspace_id = ?
  `).bind(deploymentId, projectId, auth.workspaceId).first<DeploymentRecord>();
  if (!deployment) return Response.json({ error: "Deployment not found." }, { status: 404 });
  if (deployment.status === "ready" || deployment.status === "failed" || !deployment.url) {
    return Response.json({ deployment });
  }

  try {
    const refreshed = await refreshVercelDeployment(deployment.url);
    if (!refreshed.configured) return Response.json({ deployment });
    await auth.db.batch([
      auth.db.prepare("UPDATE deployments SET status = ?, url = ?, updated_at = ? WHERE id = ?")
        .bind(refreshed.status, refreshed.url, now(), deployment.id),
      auth.db.prepare("UPDATE projects SET status = ?, updated_at = ? WHERE id = ? AND workspace_id = ?")
        .bind(refreshed.status === "ready" ? "published" : refreshed.status === "failed" ? "deploy_failed" : "deploying", now(), projectId, auth.workspaceId),
    ]);
    return Response.json({ deployment: { ...deployment, status: refreshed.status, url: refreshed.url, providerId: refreshed.id, providerState: refreshed.state } });
  } catch (error) {
    const detail = error instanceof Error ? error.message : "Could not refresh the Vercel deployment.";
    return Response.json({ error: "Could not refresh deployment status.", detail: detail.slice(0, 500), deployment }, { status: 502 });
  }
}
