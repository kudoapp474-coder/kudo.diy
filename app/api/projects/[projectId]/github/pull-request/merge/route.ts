import { now } from "../../../../../../../lib/db";
import { getGitHubInstallationToken, getWorkspaceInstallationId, githubHeaders } from "../../../../../../../lib/github-app";
import { requireApiUser, unauthorized } from "../../../../../../../lib/server-auth";

type SyncRow = { id: string; repository: string; pr_number: number | null; pr_state: string | null };
type MergeResponse = { merged?: boolean; message?: string };

export async function POST(_request: Request, { params }: { params: Promise<{ projectId: string }> }) {
  const auth = await requireApiUser();
  if (!auth) return unauthorized();
  const { projectId } = await params;

  const sync = await auth.db.prepare("SELECT id, repository, pr_number, pr_state FROM github_syncs WHERE project_id = ? ORDER BY created_at DESC LIMIT 1")
    .bind(projectId).first<SyncRow>();
  if (!sync || !sync.pr_number) return Response.json({ error: "No pull request is open for this project." }, { status: 404 });
  if (sync.pr_state === "merged") return Response.json({ error: "This pull request is already merged." }, { status: 409 });

  const installationId = await getWorkspaceInstallationId(auth.db, auth.workspaceId);
  if (!installationId) return Response.json({ error: "Connect GitHub first.", code: "GITHUB_SETUP_REQUIRED" }, { status: 503 });

  try {
    const token = await getGitHubInstallationToken(installationId);
    const response = await fetch(`https://api.github.com/repos/${sync.repository}/pulls/${sync.pr_number}/merge`, {
      method: "PUT",
      headers: { ...githubHeaders(token), "content-type": "application/json" },
      body: JSON.stringify({ merge_method: "squash" }),
    });
    const result = await response.json() as MergeResponse;
    if (!response.ok || !result.merged) return Response.json({ error: result.message ?? "GitHub could not merge this pull request." }, { status: 409 });

    await auth.db.prepare("UPDATE github_syncs SET pr_state = 'merged', updated_at = ? WHERE id = ?").bind(now(), sync.id).run();
    return Response.json({ merged: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not merge this pull request.";
    return Response.json({ error: message.slice(0, 500) }, { status: 502 });
  }
}
