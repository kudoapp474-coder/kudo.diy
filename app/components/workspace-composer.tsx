"use client";

import { ChangeEvent, FormEvent, useRef, useState } from "react";
import { ArrowRight, ChevronDown, FileText, GitBranch, Github, LoaderCircle, Plus, Sparkles, X } from "lucide-react";
import { AGENT_MODELS, DEFAULT_AGENT_MODEL_ID } from "../../lib/agent-models";

const MAX_CONTEXT_FILES = 5;
const MAX_CONTEXT_FILE_BYTES = 10 * 1024 * 1024;
type GitHubRepository = { name: string; branch: string; private: boolean; language?: string };
type GitHubRepositoriesResponse = { connected: boolean; repositories: GitHubRepository[]; connectUrl?: string; error?: string };

function projectNameFromTask(task: string) {
  const words = task.replace(/[^a-zA-Z0-9\s-]/g, " ").trim().split(/\s+/).filter(Boolean);
  return words.slice(0, 6).join(" ").slice(0, 72) || "Untitled project";
}
function fileKey(file: File) { return `${file.name}:${file.size}:${file.lastModified}`; }

export function WorkspaceComposer() {
  const [task, setTask] = useState("");
  const [attachments, setAttachments] = useState<File[]>([]);
  const [selectedRepository, setSelectedRepository] = useState<GitHubRepository | null>(null);
  const [repositoryOpen, setRepositoryOpen] = useState(false);
  const [repositoryLoading, setRepositoryLoading] = useState(false);
  const [repositoryLoaded, setRepositoryLoaded] = useState(false);
  const [githubConnected, setGithubConnected] = useState(false);
  const [repositories, setRepositories] = useState<GitHubRepository[]>([]);
  const [githubConnectUrl, setGithubConnectUrl] = useState("/api/github/connect?returnTo=%2Fworkspace");
  const [busy, setBusy] = useState(false);
  const [selectedModel, setSelectedModel] = useState(DEFAULT_AGENT_MODEL_ID);
  const [error, setError] = useState("");
  const contextInput = useRef<HTMLInputElement>(null);

  function selectContextFiles(event: ChangeEvent<HTMLInputElement>) {
    const incoming = Array.from(event.target.files ?? []);
    event.target.value = "";
    const oversized = incoming.find(file => file.size > MAX_CONTEXT_FILE_BYTES);
    if (oversized) { setError(`${oversized.name} is larger than 10 MB.`); return; }
    setAttachments(current => {
      const unique = new Map(current.map(file => [fileKey(file), file]));
      incoming.forEach(file => unique.set(fileKey(file), file));
      const next = Array.from(unique.values());
      if (next.length > MAX_CONTEXT_FILES) setError(`You can attach up to ${MAX_CONTEXT_FILES} context files.`);
      else setError("");
      return next.slice(0, MAX_CONTEXT_FILES);
    });
  }
  function removeContextFile(key: string) { setAttachments(current => current.filter(file => fileKey(file) !== key)); setError(""); }

  async function loadRepositories() {
    if (repositoryLoading || repositoryLoaded) return;
    setRepositoryLoading(true); setError("");
    try {
      const response = await fetch("/api/github/repositories?returnTo=/workspace", { cache: "no-store" });
      const data = await response.json() as GitHubRepositoriesResponse;
      setGithubConnected(Boolean(data.connected));
      setRepositories(data.repositories ?? []);
      setGithubConnectUrl(data.connectUrl ?? "/api/github/connect?returnTo=%2Fworkspace");
      if (!response.ok) setError(data.error ?? "KODO could not load GitHub repositories.");
      setRepositoryLoaded(response.ok);
    } catch { setError("KODO could not reach GitHub. Please try again."); }
    finally { setRepositoryLoading(false); }
  }
  function toggleRepositoryPicker() {
    const next = !repositoryOpen;
    setRepositoryOpen(next);
    if (next) void loadRepositories();
  }

  async function createProject(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const prompt = task.trim();
    if (!prompt || busy) return;
    setBusy(true); setError("");
    try {
      const repositoryName = selectedRepository?.name;
      const response = await fetch("/api/projects", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: repositoryName?.split("/").at(-1) || projectNameFromTask(prompt),
          description: prompt.slice(0, 500), prompt, repository: repositoryName, branch: selectedRepository?.branch,
        }),
      });
      const data = await response.json() as { project?: { id: string }; error?: string; importSummary?: { imported: number; skipped: number } };
      if (!response.ok || !data.project) { setError(data.error ?? "KODO could not create the project."); return; }

      const uploadResults = await Promise.all(attachments.map(async file => {
        const form = new FormData(); form.set("projectId", data.project!.id); form.set("file", file);
        const upload = await fetch("/api/uploads", { method: "POST", body: form });
        return { ok: upload.ok, name: file.name };
      }));
      const failedUploads = uploadResults.filter(result => !result.ok);
      const notices: string[] = [];
      if (data.importSummary?.skipped) notices.push(`${data.importSummary.skipped} unsupported, secret, binary, or oversized repository files were safely skipped.`);
      if (failedUploads.length) notices.push(`${failedUploads.length} context file${failedUploads.length === 1 ? "" : "s"} could not be uploaded. Add them again, then run KODO.`);
      const query = new URLSearchParams({ task: prompt, model: selectedModel });
      if (notices.length) query.set("notice", notices.join(" "));
      if (!failedUploads.length) query.set("autorun", "1");
      window.location.assign(`/project/${data.project.id}?${query.toString()}`);
    } catch { setError("KODO could not reach the project service. Please try again."); }
    finally { setBusy(false); }
  }

  return <form id="build" className="workspace-composer" onSubmit={createProject}>
    <textarea value={task} onChange={event => setTask(event.target.value)} placeholder="Describe the website or app you want KODO to build" aria-label="Give KODO a task" />
    <input ref={contextInput} className="hidden-file-input" type="file" multiple accept="image/*,.pdf,.txt,.md,.csv,.json,.html,.css,.js,.mjs,.ts,.tsx" onChange={selectContextFiles} />
    {attachments.length ? <ul className="composer-context-files" aria-label="Attached project context">{attachments.map(file => <li key={fileKey(file)}><FileText size={12}/><span title={file.name}>{file.name}</span><small>{Math.max(1, Math.ceil(file.size / 1024))} KB</small><button type="button" onClick={() => removeContextFile(fileKey(file))} aria-label={`Remove ${file.name}`}><X size={11}/></button></li>)}</ul> : null}
    <div>
      <button type="button" className="composer-plus" aria-label="Add project context" title="Attach up to 5 files" onClick={() => contextInput.current?.click()}><Plus size={16}/></button>
      <button type="button" className="composer-repo" aria-haspopup="dialog" aria-expanded={repositoryOpen} onClick={toggleRepositoryPicker}><GitBranch size={14}/> {selectedRepository?.name ?? "Blank project"} <span>⌄</span></button>
      {repositoryOpen ? <div className="composer-repo-menu" role="dialog" aria-label="Choose project source">
        <header><span>PROJECT SOURCE</span><button type="button" onClick={() => setRepositoryOpen(false)} aria-label="Close repository picker"><X size={12}/></button></header>
        <button type="button" className={!selectedRepository ? "selected" : ""} onClick={() => { setSelectedRepository(null); setRepositoryOpen(false); }}><Plus size={13}/><span><b>Blank project</b><small>Start with KODO starter files</small></span></button>
        {repositoryLoading ? <p><LoaderCircle size={13}/> Loading connected repositories…</p> : null}
        {!repositoryLoading && !githubConnected ? <a href={githubConnectUrl}><Github size={13}/> Connect GitHub</a> : null}
        {!repositoryLoading && githubConnected ? <div className="composer-repo-list">{repositories.map(repository => <button type="button" className={selectedRepository?.name === repository.name ? "selected" : ""} key={repository.name} onClick={() => { setSelectedRepository(repository); setRepositoryOpen(false); }}><Github size={13}/><span><b>{repository.name}</b><small>{repository.branch} · {repository.private ? "Private" : "Public"} · {repository.language || "Code"}</small></span></button>)}{!repositories.length ? <p>No repositories are available to this GitHub App.</p> : null}</div> : null}
      </div> : null}
      <span/>
      <label className="composer-model"><Sparkles size={13}/><select value={selectedModel} onChange={event => setSelectedModel(event.target.value as typeof selectedModel)} aria-label="Choose AI model">{AGENT_MODELS.map(model => <option value={model.id} key={model.id}>{model.label} · {model.creditLabel}</option>)}</select><ChevronDown size={11}/></label>
      <button className="composer-submit" disabled={!task.trim() || busy} aria-label="Create project and run KODO"><ArrowRight size={16}/></button>
    </div>
    <footer><span>@ context</span><span>/ commands</span><span>{busy ? selectedRepository ? "Importing repository…" : attachments.length ? "Uploading context…" : "Creating project…" : "⌘ ↵ run"}</span></footer>
    {error ? <p className="workspace-composer-error" role="alert">{error}</p> : null}
  </form>;
}
