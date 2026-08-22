"use client";

import { useEffect, useState } from "react";
import { Check, ExternalLink, FolderGit2, GitBranch, LockKeyhole, RefreshCw, ShieldCheck } from "lucide-react";

type Repository = {
  name: string;
  url: string;
  private: boolean;
  language: string;
  branch: string;
  updatedAt?: string | null;
};

type RepositoryResponse = {
  connected: boolean;
  account?: string | null;
  repositories: Repository[];
  connectUrl?: string;
  error?: string;
};

function relativeTime(value?: string | null) {
  if (!value) return "Not pushed yet";
  const elapsed = Date.now() - new Date(value).getTime();
  if (!Number.isFinite(elapsed) || elapsed < 0) return "Recently";
  const minutes = Math.floor(elapsed / 60_000);
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function languageColor(language: string) {
  const colors: Record<string, string> = {
    TypeScript: "#5b8def",
    JavaScript: "#d6b85b",
    Python: "#4da67c",
    HTML: "#d16d4f",
    CSS: "#8c72d6",
    MDX: "#b78b52",
  };
  return colors[language] ?? "#77756d";
}

async function loadRepositories() {
  const response = await fetch("/api/github/repositories", { cache: "no-store" });
  const data = await response.json() as RepositoryResponse;
  if (!response.ok) throw new Error(data.error || `Repository request failed (${response.status}).`);
  return data;
}

export function RepositoriesManager() {
  const [data, setData] = useState<RepositoryResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function refresh() {
    setLoading(true);
    setError("");
    try {
      setData(await loadRepositories());
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Could not load GitHub repositories.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    let active = true;
    loadRepositories()
      .then(response => { if (active) setData(response); })
      .catch(requestError => {
        if (active) setError(requestError instanceof Error ? requestError.message : "Could not load GitHub repositories.");
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  const repositories = data?.repositories ?? [];
  const connected = Boolean(data?.connected);

  return <>
    <div className="repo-summary">
      <article><FolderGit2 size={17}/><span><b>{loading ? "Checking repositories…" : `${repositories.length} repositories`}</b><small>{connected ? `Connected${data?.account ? ` as ${data.account}` : " to GitHub"}` : "Connect the KODO GitHub App"}</small></span></article>
      <article><RefreshCw size={17}/><span><b>{connected ? "Live GitHub data" : "Not connected"}</b><small>{connected ? "Refreshes on every visit" : "No demo repositories shown"}</small></span></article>
      <article><ShieldCheck size={17}/><span><b>Scoped access</b><small>Only repositories approved in GitHub</small></span></article>
    </div>

    {error ? <div className="repo-state repo-state-error"><b>GitHub repositories are unavailable</b><span>{error}</span><button onClick={() => void refresh()}>Try again</button></div> : null}

    {!loading && !error && !connected ? <div className="repo-state"><LockKeyhole size={22}/><b>Connect GitHub to use real repositories</b><span>KODO will only see repositories you approve during GitHub App setup.</span><a href={data?.connectUrl || "/api/github/connect?returnTo=/repositories"}>Connect GitHub</a></div> : null}

    {!loading && !error && connected && repositories.length === 0 ? <div className="repo-state"><FolderGit2 size={22}/><b>No repositories available</b><span>Update the GitHub App installation and select at least one repository.</span><a href={data?.connectUrl || "/api/github/connect?returnTo=/repositories"}>Update GitHub access</a></div> : null}

    {repositories.length > 0 ? <div className="repo-list">
      <div className="repo-list-head"><span>Repository</span><span>Language</span><span>Default branch</span><span>Last pushed</span><span>Access</span><span/></div>
      {repositories.map(repository => <a href={repository.url} target="_blank" rel="noreferrer" key={repository.name}>
        <span className="repo-name"><i><FolderGit2 size={16}/></i><b>{repository.name}</b></span>
        <span><i className="language-dot" style={{ background: languageColor(repository.language) }}/>{repository.language}</span>
        <span><GitBranch size={12}/>{repository.branch}</span>
        <span>{relativeTime(repository.updatedAt)}</span>
        <span className="ready"><Check size={12}/>{repository.private ? "Private" : "Public"}</span>
        <ExternalLink size={14}/>
      </a>)}
    </div> : null}
  </>;
}
