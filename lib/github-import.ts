import { githubHeaders } from "./github-app";
import { safeProjectPath } from "./project-files";

type GitHubApiError = { message?: string };
type GitHubRepository = GitHubApiError & { default_branch?: string };
type GitHubRef = GitHubApiError & { object?: { sha?: string } };
type GitHubCommit = GitHubApiError & { tree?: { sha?: string } };
type GitHubTree = GitHubApiError & { truncated?: boolean; tree?: Array<{ path?: string; type?: string; sha?: string; size?: number }> };
type GitHubBlob = GitHubApiError & { content?: string; encoding?: string };

export type ImportedGitHubFile = { path: string; content: string; language: string };

const MAX_IMPORT_FILES = 80;
const MAX_FILE_BYTES = 120_000;
const MAX_TOTAL_BYTES = 3_000_000;
const TEXT_EXTENSIONS = new Set(["css","csv","graphql","gql","html","htm","js","cjs","mjs","json","jsx","md","mdx","py","rb","rs","sh","sql","svg","toml","ts","tsx","txt","vue","xml","yaml","yml"]);
const TEXT_NAMES = new Set(["dockerfile","makefile","procfile",".gitignore",".prettierignore"]);
const IGNORED_DIRECTORIES = new Set([".git",".next","build","coverage","dist","node_modules","vendor"]);

async function github<T extends GitHubApiError>(url: string, token: string) {
  const response = await fetch(url, { headers: githubHeaders(token), cache: "no-store" });
  const data = await response.json().catch(() => ({})) as T;
  if (!response.ok) throw new Error(data.message ?? `GitHub request failed (${response.status}).`);
  return data;
}

function normalizeBranch(value: string) {
  const branch = value.trim().slice(0, 120);
  if (!branch || /[~^:?*[\\\s]/.test(branch) || branch.includes("..") || branch.includes("@{") || branch.startsWith("/") || branch.endsWith("/") || branch.endsWith(".lock")) return "";
  return branch;
}

function importablePath(value: string) {
  const path = safeProjectPath(value);
  if (!path) return "";
  const parts = path.toLowerCase().split("/");
  const name = parts.at(-1) ?? "";
  if (parts.some(part => IGNORED_DIRECTORIES.has(part))) return "";
  if (name === ".env" || name.startsWith(".env.") || name === ".npmrc" || /\.(pem|key|p12|pfx)$/.test(name)) return "";
  const extension = name.includes(".") ? name.split(".").at(-1) ?? "" : "";
  return TEXT_NAMES.has(name) || TEXT_EXTENSIONS.has(extension) ? path : "";
}

function languageForPath(path: string) {
  const extension = path.split(".").at(-1)?.toLowerCase();
  return ({css:"css",html:"html",htm:"html",js:"javascript",cjs:"javascript",mjs:"javascript",json:"json",jsx:"javascript",md:"markdown",mdx:"markdown",py:"python",sh:"shell",sql:"sql",ts:"typescript",tsx:"typescript",yaml:"yaml",yml:"yaml"} as Record<string,string>)[extension ?? ""] ?? "text";
}

export async function importGitHubRepository(repository: string, requestedBranch: string | undefined, token: string) {
  if (!/^[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+$/.test(repository)) throw new Error("Choose a valid connected GitHub repository.");
  const metadata = await github<GitHubRepository>(`https://api.github.com/repos/${repository}`, token);
  const branch = normalizeBranch(requestedBranch || metadata.default_branch || "main");
  if (!branch) throw new Error("The selected GitHub branch is invalid.");
  const ref = await github<GitHubRef>(`https://api.github.com/repos/${repository}/git/ref/heads/${encodeURIComponent(branch)}`, token);
  const commitSha = ref.object?.sha;
  if (!commitSha) throw new Error("GitHub did not return the selected branch head.");
  const commit = await github<GitHubCommit>(`https://api.github.com/repos/${repository}/git/commits/${encodeURIComponent(commitSha)}`, token);
  const treeSha = commit.tree?.sha;
  if (!treeSha) throw new Error("GitHub did not return the repository tree.");
  const tree = await github<GitHubTree>(`https://api.github.com/repos/${repository}/git/trees/${encodeURIComponent(treeSha)}?recursive=1`, token);
  if (tree.truncated) throw new Error("This repository is too large for a safe one-click import.");

  let selectedBytes = 0;
  const candidates = (tree.tree ?? [])
    .filter(entry => entry.type === "blob" && entry.sha && entry.path && Number(entry.size ?? 0) <= MAX_FILE_BYTES)
    .map(entry => ({ ...entry, safePath: importablePath(entry.path ?? "") }))
    .filter(entry => entry.safePath)
    .sort((left, right) => left.safePath.split("/").length - right.safePath.split("/").length || left.safePath.localeCompare(right.safePath))
    .filter(entry => {
      const size = Number(entry.size ?? 0);
      if (selectedBytes + size > MAX_TOTAL_BYTES) return false;
      selectedBytes += size;
      return true;
    })
    .slice(0, MAX_IMPORT_FILES);

  const files: ImportedGitHubFile[] = [];
  for (let index = 0; index < candidates.length; index += 10) {
    const chunk = candidates.slice(index, index + 10);
    const blobs = await Promise.all(chunk.map(entry => github<GitHubBlob>(`https://api.github.com/repos/${repository}/git/blobs/${encodeURIComponent(entry.sha!)}`, token)));
    blobs.forEach((blob, offset) => {
      if (blob.encoding !== "base64" || !blob.content) return;
      const content = Buffer.from(blob.content.replace(/\s+/g, ""), "base64").toString("utf8");
      if (content.includes("\0") || Buffer.byteLength(content, "utf8") > MAX_FILE_BYTES) return;
      const path = chunk[offset].safePath;
      files.push({ path, content, language: languageForPath(path) });
    });
  }

  if (!files.length) throw new Error("No safe text or code files were found on the selected branch.");
  const totalBlobs = (tree.tree ?? []).filter(entry => entry.type === "blob").length;
  return { repository, branch, files, imported: files.length, skipped: Math.max(0, totalBlobs - files.length) };
}
