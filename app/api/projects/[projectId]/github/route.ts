import { all, id, now } from "../../../../../lib/db";
import { getGitHubInstallationToken, getWorkspaceInstallationId, githubHeaders } from "../../../../../lib/github-app";
import { safeProjectPath, slugify } from "../../../../../lib/project-files";
import { requireApiUser, unauthorized } from "../../../../../lib/server-auth";

type GitHubResponse = {
  sha?: string;
  message?: string;
  default_branch?: string;
  object?: { sha?: string };
  tree?: { sha?: string };
  content?: string;
  encoding?: string;
};

type ProjectFile = { path: string; content: string; language: string };
type Manifest = { paths?: unknown };

const MANIFEST_PATH = ".kodo/project-manifest.json";
const VERCEL_CONFIG_PATH = "vercel.json";
const DEFAULT_VERCEL_CONFIG = JSON.stringify({
  $schema: "https://openapi.vercel.sh/vercel.json",
  framework: null,
  installCommand: "npm install",
  buildCommand: "npm run build",
  outputDirectory: "dist",
}, null, 2) + "\n";

class GitHubRequestError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

async function github<T extends GitHubResponse>(url: string, token: string, init?: RequestInit) {
  const response = await fetch(url, {
    ...init,
    headers: { ...githubHeaders(token), "content-type": "application/json", ...init?.headers },
  });
  const data = await response.json().catch(() => ({})) as T;
  if (!response.ok) throw new GitHubRequestError(data.message ?? `GitHub request failed (${response.status}).`, response.status);
  return data;
}

function normalizeBranch(value: string) {
  const branch = value
    .replace(/[^a-zA-Z0-9/_.-]/g, "-")
    .replace(/\/{2,}/g, "/")
    .replace(/^\/+|\/+$/g, "")
    .slice(0, 120);
  if (!branch || branch.startsWith(".") || branch.endsWith(".") || branch.includes("..") || branch.includes("@{") || branch.endsWith(".lock")) return "";
  return branch;
}

async function readManagedPaths(repository: string, branch: string, token: string) {
  const manifestPath = MANIFEST_PATH.split("/").map(encodeURIComponent).join("/");
  const response = await fetch(`https://api.github.com/repos/${repository}/contents/${manifestPath}?ref=${encodeURIComponent(branch)}`, {
    headers: githubHeaders(token),
    cache: "no-store",
  });
  if (response.status === 404) return [];
  const data = await response.json().catch(() => ({})) as GitHubResponse;
  if (!response.ok) throw new GitHubRequestError(data.message ?? "Could not read the previous KODO sync manifest.", response.status);
  if (!data.content || data.encoding !== "base64") return [];
  try {
    const manifest = JSON.parse(Buffer.from(data.content.replace(/\s+/g, ""), "base64").toString("utf8")) as Manifest;
    return Array.isArray(manifest.paths)
      ? manifest.paths.filter((path): path is string => typeof path === "string" && Boolean(safeProjectPath(path)) && !path.startsWith(".kodo/"))
      : [];
  } catch {
    return [];
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ projectId: string }> }) {
  const auth = await requireApiUser();
  if (!auth) return unauthorized();
  const { projectId } = await params;
  const body = await request.json().catch(() => ({})) as { repository?: string; branch?: string };
  const repository = body.repository?.trim();
  if (!repository || !/^[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+$/.test(repository)) {
    return Response.json({ error: "Choose a repository connected to the KODO GitHub App." }, { status: 400 });
  }

  const project = await auth.db
    .prepare("SELECT id, name FROM projects WHERE id = ? AND workspace_id = ?")
    .bind(projectId, auth.workspaceId)
    .first<{ id: string; name: string }>();
  if (!project) return Response.json({ error: "Project not found." }, { status: 404 });

  const installationId = await getWorkspaceInstallationId(auth.db, auth.workspaceId);
  if (!installationId) {
    return Response.json({
      error: "Connect GitHub before syncing this project.",
      code: "GITHUB_SETUP_REQUIRED",
      connectUrl: `/api/github/connect?returnTo=/project/${encodeURIComponent(projectId)}`,
    }, { status: 503 });
  }

  const requestedBranch = body.branch?.trim() || `kodo/${slugify(project.name) || "project"}-${projectId.slice(-6)}`;
  const branch = normalizeBranch(requestedBranch);
  if (!branch) return Response.json({ error: "Choose a valid GitHub branch name." }, { status: 400 });

  const syncId = id("ghs");
  const createdAt = now();
  await auth.db.prepare("INSERT INTO github_syncs (id, project_id, repository, branch, status, created_at, updated_at) VALUES (?, ?, ?, ?, 'syncing', ?, ?)")
    .bind(syncId, projectId, repository, branch, createdAt, createdAt).run();

  try {
    const token = await getGitHubInstallationToken(installationId);
    const repo = await github<GitHubResponse>(`https://api.github.com/repos/${repository}`, token);
    const defaultBranch = repo.default_branch || "main";
    let headSha = "";
    let targetBranchExists = false;

    const branchResponse = await fetch(`https://api.github.com/repos/${repository}/git/ref/heads/${encodeURIComponent(branch)}`, {
      headers: githubHeaders(token),
      cache: "no-store",
    });
    if (branchResponse.ok) {
      const current = await branchResponse.json() as GitHubResponse;
      headSha = current.object?.sha ?? "";
      targetBranchExists = true;
    } else if (branchResponse.status === 404) {
      const baseResponse = await fetch(`https://api.github.com/repos/${repository}/git/ref/heads/${encodeURIComponent(defaultBranch)}`, {
        headers: githubHeaders(token),
        cache: "no-store",
      });
      if (baseResponse.ok) {
        const base = await baseResponse.json() as GitHubResponse;
        headSha = base.object?.sha ?? "";
      } else if (baseResponse.status !== 404) {
        const error = await baseResponse.json().catch(() => ({})) as GitHubResponse;
        throw new GitHubRequestError(error.message ?? "Could not inspect the repository default branch.", baseResponse.status);
      }
    } else {
      const error = await branchResponse.json().catch(() => ({})) as GitHubResponse;
      throw new GitHubRequestError(error.message ?? "Could not inspect the GitHub branch.", branchResponse.status);
    }

    let baseTree = "";
    if (headSha) {
      const baseCommit = await github<GitHubResponse>(`https://api.github.com/repos/${repository}/git/commits/${headSha}`, token);
      baseTree = baseCommit.tree?.sha ?? "";
      if (!baseTree) throw new Error("GitHub did not return the base tree.");
    }

    const files = await all<ProjectFile>(auth.db.prepare("SELECT path, content, language FROM project_files WHERE project_id = ? ORDER BY path").bind(projectId));
    const textFiles = files.filter(file => file.language !== "asset" && Boolean(safeProjectPath(file.path)) && !file.path.startsWith(".kodo/"));
    if (!textFiles.length) throw new Error("This project has no text files to sync.");
    const syncFiles = textFiles.some(file => file.path === VERCEL_CONFIG_PATH)
      ? textFiles
      : [...textFiles, { path: VERCEL_CONFIG_PATH, content: DEFAULT_VERCEL_CONFIG, language: "json" }];

    const previousPaths = targetBranchExists ? await readManagedPaths(repository, branch, token) : [];
    const currentPaths = new Set(syncFiles.map(file => file.path));
    const deletedPaths = previousPaths.filter(path => !currentPaths.has(path));
    const manifest = JSON.stringify({
      projectId,
      projectName: project.name,
      paths: [...currentPaths].sort(),
      syncedAt: now(),
    }, null, 2) + "\n";

    const blobs = await Promise.all([...syncFiles.map(file => ({ path: file.path, content: file.content })), { path: MANIFEST_PATH, content: manifest }].map(async file => {
      const blob = await github<GitHubResponse>(`https://api.github.com/repos/${repository}/git/blobs`, token, {
        method: "POST",
        body: JSON.stringify({ content: file.content, encoding: "utf-8" }),
      });
      if (!blob.sha) throw new Error(`GitHub did not create the blob for ${file.path}.`);
      return { path: file.path, mode: "100644", type: "blob", sha: blob.sha };
    }));

    const tree = await github<GitHubResponse>(`https://api.github.com/repos/${repository}/git/trees`, token, {
      method: "POST",
      body: JSON.stringify({
        ...(baseTree ? { base_tree: baseTree } : {}),
        tree: [...blobs, ...deletedPaths.map(path => ({ path, mode: "100644", type: "blob", sha: null }))],
      }),
    });
    if (!tree.sha) throw new Error("GitHub did not create the project tree.");

    const commit = await github<GitHubResponse>(`https://api.github.com/repos/${repository}/git/commits`, token, {
      method: "POST",
      body: JSON.stringify({
        message: `Sync ${project.name} from KODO`,
        tree: tree.sha,
        parents: headSha ? [headSha] : [],
      }),
    });
    if (!commit.sha) throw new Error("GitHub did not create the project commit.");

    if (targetBranchExists) {
      await github(`https://api.github.com/repos/${repository}/git/refs/heads/${encodeURIComponent(branch)}`, token, {
        method: "PATCH",
        body: JSON.stringify({ sha: commit.sha, force: false }),
      });
    } else {
      await github(`https://api.github.com/repos/${repository}/git/refs`, token, {
        method: "POST",
        body: JSON.stringify({ ref: `refs/heads/${branch}`, sha: commit.sha }),
      });
    }

    const commitUrl = `https://github.com/${repository}/commit/${commit.sha}`;
    const treeUrl = `https://github.com/${repository}/tree/${encodeURIComponent(branch)}`;
    await auth.db.batch([
      auth.db.prepare("UPDATE projects SET repository = ?, branch = ?, updated_at = ? WHERE id = ? AND workspace_id = ?")
        .bind(repository, branch, now(), projectId, auth.workspaceId),
      auth.db.prepare("UPDATE github_syncs SET commit_sha = ?, status = 'ready', url = ?, updated_at = ? WHERE id = ?")
        .bind(commit.sha, commitUrl, now(), syncId),
    ]);
    return Response.json({ id: syncId, repository, branch, commit: commit.sha, url: commitUrl, treeUrl, status: "ready", deletedFiles: deletedPaths.length }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "GitHub sync failed";
    await auth.db.prepare("UPDATE github_syncs SET status = 'failed', error = ?, updated_at = ? WHERE id = ?")
      .bind(message.slice(0, 600), now(), syncId).run();
    const status = error instanceof GitHubRequestError && (error.status === 409 || error.status === 422) ? 409 : 502;
    return Response.json({ error: message.slice(0, 600), syncId }, { status });
  }
}
