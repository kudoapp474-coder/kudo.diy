import { now, type KodoDatabase } from "../../../../../../lib/db";
import { getGitHubInstallationToken, getWorkspaceInstallationId, githubHeaders } from "../../../../../../lib/github-app";
import { requireApiUser, unauthorized } from "../../../../../../lib/server-auth";

type SyncRow = { id: string; repository: string; branch: string; status: string; pr_number: number | null };
type PullRequestResponse = {
  number?: number;
  html_url?: string;
  state?: string;
  merged?: boolean;
  mergeable_state?: string;
  message?: string;
  errors?: Array<{ message?: string }>;
};

async function findExistingPullRequest(repository: string, branch: string, token: string) {
  const [owner] = repository.split("/");
  const response = await fetch(`https://api.github.com/repos/${repository}/pulls?head=${encodeURIComponent(`${owner}/${branch}`)}&state=all`, {
    headers: githubHeaders(token),
    cache: "no-store",
  });
  if (!response.ok) return null;
  const results = await response.json() as PullRequestResponse[];
  return results[0] ?? null;
}

async function latestSync(db: KodoDatabase, projectId: string) {
  return db.prepare("SELECT id, repository, branch, status, pr_number FROM github_syncs WHERE project_id = ? ORDER BY created_at DESC LIMIT 1")
    .bind(projectId).first<SyncRow>();
}

export async function GET(_request: Request, { params }: { params: Promise<{ projectId: string }> }) {
  const auth = await requireApiUser();
  if (!auth) return unauthorized();
  const { projectId } = await params;

  const sync = await latestSync(auth.db, projectId);
  if (!sync || !sync.pr_number) return Response.json({ pullRequest: null });

  const installationId = await getWorkspaceInstallationId(auth.db, auth.workspaceId);
  if (!installationId) return Response.json({ error: "Connect GitHub first.", code: "GITHUB_SETUP_REQUIRED" }, { status: 503 });

  const token = await getGitHubInstallationToken(installationId);
  const response = await fetch(`https://api.github.com/repos/${sync.repository}/pulls/${sync.pr_number}`, { headers: githubHeaders(token), cache: "no-store" });
  const pr = await response.json() as PullRequestResponse;
  if (!response.ok) return Response.json({ error: pr.message ?? "Could not load the pull request." }, { status: 502 });

  const state = pr.merged ? "merged" : pr.state === "closed" ? "closed" : "open";
  await auth.db.prepare("UPDATE github_syncs SET pr_state = ?, updated_at = ? WHERE id = ?").bind(state, now(), sync.id).run();

  return Response.json({ pullRequest: { number: pr.number, url: pr.html_url, state, mergeableState: pr.mergeable_state } });
}

export async function POST(request: Request, { params }: { params: Promise<{ projectId: string }> }) {
  const auth = await requireApiUser();
  if (!auth) return unauthorized();
  const { projectId } = await params;
  const body = await request.json().catch(() => ({})) as { title?: string; body?: string };

  const sync = await latestSync(auth.db, projectId);
  if (!sync || sync.status !== "ready") return Response.json({ error: "Sync this project to GitHub before opening a pull request." }, { status: 409 });
  if (sync.pr_number) return Response.json({ error: "A pull request already exists for this branch.", code: "PR_EXISTS" }, { status: 409 });

  const installationId = await getWorkspaceInstallationId(auth.db, auth.workspaceId);
  if (!installationId) return Response.json({ error: "Connect GitHub first.", code: "GITHUB_SETUP_REQUIRED" }, { status: 503 });

  const project = await auth.db.prepare("SELECT name FROM projects WHERE id = ? AND workspace_id = ?").bind(projectId, auth.workspaceId).first<{ name: string }>();

  try {
    const token = await getGitHubInstallationToken(installationId);
    const repoInfo = await fetch(`https://api.github.com/repos/${sync.repository}`, { headers: githubHeaders(token) });
    const repoData = await repoInfo.json() as { default_branch?: string };
    const base = repoData.default_branch || "main";

    const response = await fetch(`https://api.github.com/repos/${sync.repository}/pulls`, {
      method: "POST",
      headers: { ...githubHeaders(token), "content-type": "application/json" },
      body: JSON.stringify({
        title: body.title?.trim().slice(0, 200) || `KODO: ${project?.name ?? "project"} sync`,
        head: sync.branch,
        base,
        body: body.body?.trim().slice(0, 2000) || "Opened by KODO from the project workspace.",
      }),
    });
    let pr = await response.json() as PullRequestResponse;

    if (!response.ok) {
      const alreadyExists = response.status === 422 && (pr.errors ?? []).some(item => (item.message ?? "").toLowerCase().includes("already exists"));
      const existing = alreadyExists ? await findExistingPullRequest(sync.repository, sync.branch, token) : null;
      if (!existing) return Response.json({ error: pr.message ?? "Could not open the pull request." }, { status: 502 });
      pr = existing;
    }

    await auth.db.prepare("UPDATE github_syncs SET pr_number = ?, pr_url = ?, pr_state = 'open', updated_at = ? WHERE id = ?")
      .bind(pr.number, pr.html_url, now(), sync.id).run();

    return Response.json({ pullRequest: { number: pr.number, url: pr.html_url, state: "open" } }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not open the pull request.";
    return Response.json({ error: message.slice(0, 500) }, { status: 502 });
  }
}
