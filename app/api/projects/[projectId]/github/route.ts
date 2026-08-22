import { all, now } from "../../../../../lib/db";
import { getGitHubInstallationToken, githubHeaders } from "../../../../../lib/github-app";
import { safeProjectPath, slugify } from "../../../../../lib/project-files";
import { requireApiUser, unauthorized } from "../../../../../lib/server-auth";

type GitHubResponse = { sha?: string; message?: string; default_branch?: string; object?: { sha?: string }; tree?: { sha?: string }; html_url?: string };

async function github<T extends GitHubResponse>(url: string, token: string, init?: RequestInit) {
  const response = await fetch(url, { ...init, headers: { ...githubHeaders(token), "content-type": "application/json", ...init?.headers } });
  const data = await response.json() as T;
  if (!response.ok) throw new Error(data.message ?? `GitHub request failed (${response.status}).`);
  return data;
}

export async function POST(request: Request, { params }: { params: Promise<{ projectId: string }> }) {
  const auth = await requireApiUser();
  if (!auth) return unauthorized();
  const { projectId } = await params;
  const body = await request.json() as { repository?: string; branch?: string };
  const repository = body.repository?.trim();
  if (!repository || !/^[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+$/.test(repository)) return Response.json({ error: "Enter the repository as owner/name." }, { status: 400 });
  const project = await auth.db.prepare("SELECT id, name FROM projects WHERE id = ? AND workspace_id = ?").bind(projectId, auth.workspaceId).first<{ id: string; name: string }>();
  if (!project) return Response.json({ error: "Project not found." }, { status: 404 });
  const connection = await auth.db.prepare("SELECT metadata_json FROM connections WHERE workspace_id = ? AND provider = 'github' AND status = 'connected'").bind(auth.workspaceId).first<{ metadata_json: string }>();
  let installationId = "";
  try { installationId = String(JSON.parse(connection?.metadata_json ?? "{}").installationId ?? ""); } catch { installationId = ""; }
  if (!installationId) return Response.json({ error: "Connect GitHub before exporting this project.", code: "GITHUB_SETUP_REQUIRED", connectUrl: "/api/github/connect" }, { status: 503 });

  try {
    const token = await getGitHubInstallationToken(installationId);
    const repo = await github<GitHubResponse>(`https://api.github.com/repos/${repository}`, token);
    const defaultBranch = repo.default_branch || "main";
    const requestedBranch = body.branch?.trim() || `kodo/${slugify(project.name) || "project"}-${projectId.slice(-6)}`;
    const branch = requestedBranch.replace(/[^a-zA-Z0-9/_-]/g, "-").replace(/^\/+|\/+$/g, "").slice(0, 120);
    if (!branch) return Response.json({ error: "Choose a valid branch name." }, { status: 400 });

    let headSha = "";
    const branchResponse = await fetch(`https://api.github.com/repos/${repository}/git/ref/heads/${encodeURIComponent(branch)}`, { headers: githubHeaders(token) });
    if (branchResponse.ok) {
      const current = await branchResponse.json() as GitHubResponse;
      headSha = current.object?.sha ?? "";
    } else if (branchResponse.status === 404) {
      const base = await github<GitHubResponse>(`https://api.github.com/repos/${repository}/git/ref/heads/${encodeURIComponent(defaultBranch)}`, token);
      headSha = base.object?.sha ?? "";
      await github(`https://api.github.com/repos/${repository}/git/refs`, token, { method: "POST", body: JSON.stringify({ ref: `refs/heads/${branch}`, sha: headSha }) });
    } else {
      const error = await branchResponse.json() as GitHubResponse;
      throw new Error(error.message ?? "Could not inspect the GitHub branch.");
    }
    if (!headSha) throw new Error("GitHub did not return a branch commit.");

    const baseCommit = await github<GitHubResponse>(`https://api.github.com/repos/${repository}/git/commits/${headSha}`, token);
    const baseTree = baseCommit.tree?.sha;
    if (!baseTree) throw new Error("GitHub did not return the base tree.");
    const files = await all<{ path: string; content: string; language: string }>(auth.db.prepare("SELECT path, content, language FROM project_files WHERE project_id = ? ORDER BY path").bind(projectId));
    const textFiles = files.filter(file => file.language !== "asset" && safeProjectPath(file.path));
    const blobs = await Promise.all(textFiles.map(async file => {
      const blob = await github<GitHubResponse>(`https://api.github.com/repos/${repository}/git/blobs`, token, { method: "POST", body: JSON.stringify({ content: file.content, encoding: "utf-8" }) });
      return { path: file.path, mode: "100644", type: "blob", sha: blob.sha };
    }));
    const tree = await github<GitHubResponse>(`https://api.github.com/repos/${repository}/git/trees`, token, { method: "POST", body: JSON.stringify({ base_tree: baseTree, tree: blobs }) });
    if (!tree.sha) throw new Error("GitHub did not create the project tree.");
    const commit = await github<GitHubResponse>(`https://api.github.com/repos/${repository}/git/commits`, token, { method: "POST", body: JSON.stringify({ message: `Build ${project.name} with KODO`, tree: tree.sha, parents: [headSha] }) });
    if (!commit.sha) throw new Error("GitHub did not create the project commit.");
    await github(`https://api.github.com/repos/${repository}/git/refs/heads/${encodeURIComponent(branch)}`, token, { method: "PATCH", body: JSON.stringify({ sha: commit.sha, force: false }) });
    await auth.db.prepare("UPDATE projects SET repository = ?, branch = ?, status = 'synced', updated_at = ? WHERE id = ? AND workspace_id = ?")
      .bind(repository, branch, now(), projectId, auth.workspaceId).run();
    return Response.json({ repository, branch, commit: commit.sha, url: `https://github.com/${repository}/tree/${encodeURIComponent(branch)}` });
  } catch (error) {
    const message = error instanceof Error ? error.message : "GitHub export failed";
    return Response.json({ error: message.slice(0, 600) }, { status: 502 });
  }
}
