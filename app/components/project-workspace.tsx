"use client";

import { useEffect, useEffectEvent, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  ArrowUp, Check, ChevronDown, CircleAlert, Code2, Download, ExternalLink, Eye, File, FileCode2,
  Folder, GitBranch, Github, Globe, History, LoaderCircle, MoreHorizontal, Paperclip, Play, Plus,
  RefreshCw, RotateCcw, Save, Settings2, Sparkles, Terminal, Trash2, X,
} from "lucide-react";
import { renderProjectDocument } from "../../lib/project-files";
import { BrandLogo } from "./brand-logo";

type ProjectFile = { id: string; path: string; content: string; language: string; updated_at: string };
type Generation = { id: string; prompt: string; result: string | null; status: string; model: string; credits_used: number; error: string | null; steps_json: string; created_at: string };
type Version = {
  id: string;
  label: string;
  generation_id: string | null;
  created_at: string;
  file_count: number;
  deployment_id: string | null;
  deployment_environment: string | null;
  deployment_status: string | null;
  deployment_url: string | null;
};
type Deployment = { id: string; version_id: string; environment: string; status: string; url: string | null; created_at: string };
type GitHubSync = { id: string; repository: string; branch: string; commit_sha: string | null; status: string; url: string | null; error: string | null; created_at: string };
type GitHubRepository = { name: string; branch: string; private: boolean };
type GitHubRepositoriesResponse = { connected: boolean; repositories: GitHubRepository[]; connectUrl?: string; error?: string };
type ProjectData = {
  project: { id: string; name: string; description: string; repository: string | null; branch: string; status: string; preview_url: string | null; production_url: string | null };
  files: ProjectFile[]; generations: Generation[]; versions: Version[]; deployments: Deployment[]; githubSyncs: GitHubSync[];
  workspace: { plan: string; credits: number } | null;
};
type AgentStep = { type: string; label: string; status: string };
type ChatMessage = { id: string; role: "user" | "agent"; text: string; done?: boolean; connectUrl?: string; credits?: number; steps?: AgentStep[] };
type CheckResult = { status?: string; phase?: string; command?: string; stdout?: string; stderr?: string; error?: string };

function parseSteps(value: string) {
  try { const parsed = JSON.parse(value) as AgentStep[]; return Array.isArray(parsed) ? parsed : []; } catch { return []; }
}

function messagesFromGenerations(generations: Generation[]): ChatMessage[] {
  if (!generations.length) return [{ id: "welcome", role: "agent", text: "Your real project files are ready. Describe the website and KODO will edit them, run checks and save a version." }];
  return generations.toReversed().flatMap(generation => [
    { id: `${generation.id}-user`, role: "user" as const, text: generation.prompt },
    { id: `${generation.id}-agent`, role: "agent" as const, text: generation.result || generation.error || "The agent run did not return a summary.", done: generation.status === "complete", credits: generation.credits_used, steps: parseSteps(generation.steps_json) },
  ]);
}

function languageForPath(path: string) {
  const extension = path.split(".").pop()?.toLowerCase();
  return ({ html: "html", css: "css", js: "javascript", mjs: "javascript", ts: "typescript", tsx: "typescript", json: "json", md: "markdown" } as Record<string, string>)[extension ?? ""] ?? "text";
}

export function ProjectWorkspace({ projectId, initialTask = "", autoRun = false }: { projectId: string; initialTask?: string; autoRun?: boolean }) {
  const [view, setView] = useState<"preview" | "code">("preview");
  const [prompt, setPrompt] = useState("");
  const [running, setRunning] = useState(false);
  const [loading, setLoading] = useState(true);
  const [showFiles, setShowFiles] = useState(true);
  const [showVersions, setShowVersions] = useState(false);
  const [versionBusy, setVersionBusy] = useState<string | null>(null);
  const [publishOpen, setPublishOpen] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [githubOpen, setGithubOpen] = useState(false);
  const [githubBusy, setGithubBusy] = useState(false);
  const [githubLoading, setGithubLoading] = useState(false);
  const [githubConnected, setGithubConnected] = useState<boolean | null>(null);
  const [githubRepositories, setGithubRepositories] = useState<GitHubRepository[]>([]);
  const [githubLoadError, setGithubLoadError] = useState("");
  const [githubConnectUrl, setGithubConnectUrl] = useState("/api/github/connect");
  const [githubRepository, setGithubRepository] = useState("");
  const [githubBranch, setGithubBranch] = useState("");
  const [data, setData] = useState<ProjectData | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [selectedPath, setSelectedPath] = useState("index.html");
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [checking, setChecking] = useState(false);
  const [checkOutput, setCheckOutput] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [previewNonce, setPreviewNonce] = useState(0);
  const uploadInput = useRef<HTMLInputElement>(null);
  const autoRunStarted = useRef(false);
  const startInitialRun = useEffectEvent((task: string) => { void runAgent(task); });

  function applyProject(payload: ProjectData) {
    setData(payload);
    setMessages(messagesFromGenerations(payload.generations));
    setGithubRepository(payload.project.repository ?? "");
    setGithubBranch(payload.project.branch === "main" ? "" : payload.project.branch);
    setSelectedPath(current => payload.files.some(file => file.path === current) ? current : payload.files.find(file => file.path === "index.html")?.path ?? payload.files[0]?.path ?? "");
  }

  async function fetchProject() {
    const response = await fetch(`/api/projects/${encodeURIComponent(projectId)}`, { cache: "no-store" });
    const payload = await response.json() as ProjectData & { error?: string };
    if (!response.ok) throw new Error(payload.error ?? "Could not load the project.");
    return payload;
  }

  async function loadProject() {
    const payload = await fetchProject();
    applyProject(payload);
    return payload;
  }

  useEffect(() => {
    let active = true;
    fetch(`/api/projects/${encodeURIComponent(projectId)}`, { cache: "no-store" })
      .then(async response => {
        const payload = await response.json() as ProjectData & { error?: string };
        if (!response.ok) throw new Error(payload.error ?? "Could not load the project.");
        return payload;
      })
      .then(payload => { if (active) applyProject(payload); })
      .catch(reason => { if (active) setError(reason instanceof Error ? reason.message : "Could not load the project."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [projectId]);

  useEffect(() => {
    if (!loading && data && autoRun && initialTask.trim() && !data.generations.length && !autoRunStarted.current) {
      autoRunStarted.current = true;
      startInitialRun(initialTask);
    }
  }, [loading, data, autoRun, initialTask]);

  const previewDocument = useMemo(() => renderProjectDocument(data?.files ?? [], data?.project.name), [data?.files, data?.project.name]);
  const selectedFile = data?.files.find(file => file.path === selectedPath) ?? null;
  const editorValue = drafts[selectedPath] ?? selectedFile?.content ?? "";
  const dirty = Boolean(selectedFile && editorValue !== selectedFile.content);
  const latestDeployment = data?.deployments[0] ?? null;
  const latestGitHubSync = data?.githubSyncs?.[0] ?? null;
  const latestUrl = data?.deployments.find(deployment => deployment.status === "ready" && deployment.url)?.url || data?.project.production_url || data?.project.preview_url;

  async function runAgent(override?: string) {
    const task = (override ?? prompt).trim();
    if (!task || running) return;
    if (Number(data?.workspace?.credits ?? 20) < 20) { setError("At least 20 credits are required for an agent run. Recharge from Billing."); return; }
    setError(""); setNotice("");
    setMessages(current => [...current, { id: `local-user-${Date.now()}`, role: "user", text: task }]);
    setPrompt(""); setRunning(true);
    try {
      const response = await fetch("/api/agent", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ projectId, prompt: task }) });
      const result = await response.json() as { result?: string; error?: string; connectUrl?: string; usage?: { creditsUsed?: number }; steps?: AgentStep[] };
      setMessages(current => [...current, { id: `local-agent-${Date.now()}`, role: "agent", text: result.result ?? result.error ?? "The agent could not complete this run.", done: response.ok, connectUrl: result.connectUrl, credits: result.usage?.creditsUsed, steps: result.steps }]);
      if (!response.ok) setError(result.error ?? "The agent could not complete this run.");
      setDrafts({}); await loadProject(); setPreviewNonce(value => value + 1);
      window.history.replaceState(null, "", `/project/${projectId}`);
    } catch { setError("KODO could not reach the agent service. Your reserved credits were not charged."); }
    finally { setRunning(false); }
  }

  async function saveFile() {
    if (!selectedPath || !selectedFile || saving) return;
    setSaving(true); setError("");
    const response = await fetch(`/api/projects/${encodeURIComponent(projectId)}/files`, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ path: selectedPath, content: editorValue, language: selectedFile.language }) });
    const result = await response.json() as { error?: string };
    if (!response.ok) setError(result.error ?? "Could not save the file.");
    else { setDrafts(current => { const next = { ...current }; delete next[selectedPath]; return next; }); setNotice(`${selectedPath} saved and versioned.`); await loadProject(); setPreviewNonce(value => value + 1); }
    setSaving(false);
  }

  async function createFile() {
    const path = window.prompt("New file path (for example sections/about.html)")?.trim(); if (!path) return;
    const response = await fetch(`/api/projects/${encodeURIComponent(projectId)}/files`, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ path, content: "", language: languageForPath(path) }) });
    const result = await response.json() as { error?: string };
    if (!response.ok) { setError(result.error ?? "Could not create the file."); return; }
    await loadProject(); setSelectedPath(path); setView("code");
  }

  async function deleteFile() {
    if (!selectedPath || !window.confirm(`Delete ${selectedPath}?`)) return;
    const response = await fetch(`/api/projects/${encodeURIComponent(projectId)}/files`, { method: "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify({ path: selectedPath }) });
    const result = await response.json() as { error?: string };
    if (!response.ok) { setError(result.error ?? "Could not delete the file."); return; }
    setDrafts(current => { const next = { ...current }; delete next[selectedPath]; return next; }); await loadProject(); setNotice(`${selectedPath} deleted.`);
  }

  function downloadFile() {
    if (!selectedFile) return;
    const url = URL.createObjectURL(new Blob([editorValue], { type: "text/plain;charset=utf-8" }));
    const anchor = document.createElement("a"); anchor.href = url; anchor.download = selectedFile.path.split("/").pop() || "project-file.txt"; anchor.click(); URL.revokeObjectURL(url);
  }

  async function uploadFile(file?: globalThis.File) {
    if (!file) return;
    const form = new FormData(); form.set("projectId", projectId); form.set("file", file);
    const response = await fetch("/api/uploads", { method: "POST", body: form });
    const result = await response.json() as { file?: { name: string }; error?: string };
    if (!response.ok) setError(result.error ?? "Upload failed."); else { setNotice(`${result.file?.name ?? "File"} uploaded to project context.`); await loadProject(); }
  }

  async function runCheck() {
    if (checking) return; setChecking(true); setCheckOutput("Starting secure production build…");
    const response = await fetch(`/api/projects/${encodeURIComponent(projectId)}/check`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ command: "npm run build" }) });
    const result = await response.json() as { result?: CheckResult; error?: string; detail?: string }; const check = result.result;
    setCheckOutput([check?.status ? `Status: ${check.status}` : result.error, check?.phase ? `Phase: ${check.phase}` : "", check?.stdout ?? "", check?.stderr ?? "", check?.error ?? result.detail ?? ""].filter(Boolean).join("\n\n"));
    if (!response.ok) setError(result.error ?? "Build check failed."); else { setNotice("Production build passed in Vercel Sandbox."); await loadProject(); }
    setChecking(false);
  }

  async function publish(target: "preview" | "production") {
    if (publishing) return; setPublishing(true); setError("");
    const response = await fetch(`/api/projects/${encodeURIComponent(projectId)}/publish`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ target }) });
    const result = await response.json() as { deployment?: { id: string; status: string; url: string; provider: string }; error?: string; detail?: string; warning?: string; check?: CheckResult };
    if (!response.ok) { setError(result.error ?? "Publish failed."); if (result.check) setCheckOutput([result.check.stdout, result.check.stderr, result.check.error].filter(Boolean).join("\n\n")); }
    else if (result.deployment) {
      const label = target === "production" ? "Production" : "Preview";
      setNotice(result.deployment.status === "ready" ? `${label} is live on ${result.deployment.provider}: ${result.deployment.url}${result.warning ? ` · ${result.warning}` : ""}` : `${label} deployment started on ${result.deployment.provider}.`);
      setPublishOpen(false);
      await loadProject();
      if (result.deployment.status === "building") void pollDeployment(result.deployment.id, label, result.deployment.provider);
    }
    setPublishing(false);
  }

  async function pollDeployment(deploymentId: string, label: string, provider: string) {
    for (let attempt = 0; attempt < 20; attempt += 1) {
      await new Promise(resolve => setTimeout(resolve, 3_000));
      const response = await fetch(`/api/projects/${encodeURIComponent(projectId)}/deployments/${encodeURIComponent(deploymentId)}`, { cache: "no-store" });
      const result = await response.json() as { deployment?: { status: string; url: string | null }; error?: string };
      if (!response.ok) {
        if (attempt === 19) setError(result.error ?? "Could not refresh deployment status.");
        continue;
      }
      if (result.deployment?.status === "ready") {
        setNotice(`${label} is live on ${provider}: ${result.deployment.url}`);
        await loadProject();
        return;
      }
      if (result.deployment?.status === "failed") {
        setError(`${label} deployment failed on ${provider}.`);
        await loadProject();
        return;
      }
    }
    setNotice(`${label} is still building on ${provider}. Its status will remain in project history.`);
    await loadProject();
  }

  async function exportToGitHub() {
    if (!githubRepository.trim() || githubBusy) return; setGithubBusy(true); setError("");
    try {
      const response = await fetch(`/api/projects/${encodeURIComponent(projectId)}/github`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ repository: githubRepository, branch: githubBranch }) });
      const result = await response.json() as { error?: string; repository?: string; branch?: string; url?: string; connectUrl?: string };
      if (!response.ok) {
        setError(result.error ?? "GitHub sync failed.");
        if (result.connectUrl) setGithubConnectUrl(result.connectUrl);
        await loadProject();
      } else {
        setNotice(`Project synced to ${result.repository} on ${result.branch}.`);
        setGithubOpen(false);
        await loadProject();
      }
    } catch {
      setError("KODO could not reach the GitHub sync service. No repository changes were confirmed.");
    } finally {
      setGithubBusy(false);
    }
  }

  async function openGitHubDialog() {
    setGithubOpen(true);
    setGithubLoading(true);
    setGithubLoadError("");
    try {
      const response = await fetch(`/api/github/repositories?returnTo=${encodeURIComponent(`/project/${projectId}`)}`, { cache: "no-store" });
      const result = await response.json() as GitHubRepositoriesResponse;
      if (!response.ok) throw new Error(result.error ?? "Could not load approved repositories.");
      setGithubConnected(result.connected);
      setGithubRepositories(result.repositories ?? []);
      setGithubConnectUrl(result.connectUrl ?? `/api/github/connect?returnTo=/project/${encodeURIComponent(projectId)}`);
      setGithubRepository(current => {
        if (result.repositories.some(repository => repository.name === current)) return current;
        const saved = data?.project.repository;
        if (saved && result.repositories.some(repository => repository.name === saved)) return saved;
        return result.repositories[0]?.name ?? "";
      });
    } catch (reason) {
      setGithubLoadError(reason instanceof Error ? reason.message : "Could not load approved repositories.");
    } finally {
      setGithubLoading(false);
    }
  }

  async function createCheckpoint() {
    const label = window.prompt("Checkpoint name", "Manual checkpoint")?.trim();
    if (!label || versionBusy) return;
    setVersionBusy("checkpoint"); setError("");
    try {
      const response = await fetch("/api/versions", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ projectId, label }) });
      const result = await response.json() as { error?: string };
      if (!response.ok) setError(result.error ?? "Could not create a checkpoint."); else { setNotice(`Checkpoint “${label}” created.`); await loadProject(); }
    } catch { setError("KODO could not reach version history. Try again."); }
    finally { setVersionBusy(null); }
  }

  async function restoreVersion(version: Version) {
    if (versionBusy || !window.confirm(`Restore “${version.label}” (${version.file_count} files)? KODO will save the current files first. Any unsaved editor changes will be discarded.`)) return;
    setVersionBusy(version.id); setError("");
    try {
      const response = await fetch("/api/versions", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ projectId, versionId: version.id }) });
      const result = await response.json() as { error?: string; restored?: number };
      if (!response.ok) setError(result.error ?? "Could not restore this version."); else { setDrafts({}); setNotice(`Restored ${result.restored ?? version.file_count} files from “${version.label}”. Safety checkpoint created.`); await loadProject(); setPreviewNonce(value => value + 1); setShowVersions(false); }
    } catch { setError("KODO could not reach version history. Nothing was restored."); }
    finally { setVersionBusy(null); }
  }

  async function rollbackProduction(version: Version) {
    if (versionBusy || !window.confirm(`Roll production back to “${version.label}”? KODO will save the current files, validate this version, and replace the live production deployment.`)) return;
    setVersionBusy(version.id); setError(""); setNotice("");
    try {
      const response = await fetch(`/api/projects/${encodeURIComponent(projectId)}/rollback`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ versionId: version.id }) });
      const result = await response.json() as { error?: string; detail?: string; rollback?: { restored: number }; deployment?: { id: string; status: string; url: string; provider: string }; check?: CheckResult; warning?: string };
      if (!response.ok) {
        setError([result.error, result.detail].filter(Boolean).join(" ") || "Production rollback failed.");
        if (result.check) setCheckOutput([result.check.stdout, result.check.stderr, result.check.error].filter(Boolean).join("\n\n"));
      } else if (result.deployment) {
        setDrafts({});
        setNotice(`Production rolled back to “${version.label}” (${result.rollback?.restored ?? version.file_count} files) on ${result.deployment.provider}.${result.warning ? ` ${result.warning}` : ""}`);
        await loadProject(); setPreviewNonce(value => value + 1); setShowVersions(false);
        if (result.deployment.status === "building") void pollDeployment(result.deployment.id, "Rollback", result.deployment.provider);
      }
    } catch { setError("KODO could not start the production rollback. The live site was not changed."); }
    finally { setVersionBusy(null); }
  }

  async function shareProject() { await navigator.clipboard.writeText(window.location.href); setNotice("Project link copied."); }

  if (loading) return <main className="builder-loading"><LoaderCircle size={24} /> Loading real project files…</main>;

  return (
    <main className="builder-shell">
      <header className="builder-topbar">
        <div><Link className="builder-logo" href="/"><BrandLogo size="compact" /></Link><span className="builder-divider" /><Link className="builder-project-name" href="/projects"><span className="project-glyph violet"><Sparkles size={12} /></span><b>{data?.project.name ?? projectId}</b><ChevronDown size={13} /></Link></div>
        <div className="builder-top-actions"><span className={`save-state ${dirty ? "dirty" : ""}`}>{dirty ? <CircleAlert size={12} /> : <Check size={12} />} {dirty ? "Unsaved" : "Saved"}</span><button onClick={() => void openGitHubDialog()}><GitBranch size={14} /> {data?.project.branch ?? "main"} <ChevronDown size={12} /></button><button className="share-btn" onClick={() => void shareProject()}>Share</button><button className="publish-btn" onClick={() => setPublishOpen(true)}><Globe size={14} /> Publish</button><span className="builder-credits">{Number(data?.workspace?.credits ?? 0).toLocaleString("en-IN")} credits</span></div>
      </header>
      {(error || notice) ? <div className={`builder-toast ${error ? "error" : "success"}`}><span>{error || notice}</span><button onClick={() => { setError(""); setNotice(""); }}><X size={14} /></button></div> : null}
      <div className="builder-body">
        <aside className="agent-panel">
          <div className="agent-panel-head"><div><span className="online-dot" /><b>KODO Agent</b></div><button aria-label="Agent options"><MoreHorizontal size={17} /></button></div>
          <div className="conversation">
            <div className="agent-intro"><span><Sparkles size={16} /></span><h1>Build with KODO</h1><p>Ask for a complete website or a precise edit. Every real file and version stays in this project.</p></div>
            {messages.map(message => <div className={`message ${message.role}`} key={message.id}><span className="message-role">{message.role === "user" ? "You" : <><Sparkles size={11} /> KODO</>}</span><p>{message.text}</p>{message.connectUrl ? <a className="message-connect" href={message.connectUrl}>Open integrations</a> : null}{message.done ? <div className="change-summary"><span><Check size={12} /> Agent run completed{message.credits ? ` · ${message.credits} credits` : ""}</span>{message.steps?.slice(-5).map((step, index) => <div key={`${step.label}-${index}`}><FileCode2 size={13} /><b>{step.label}</b><em>{step.status}</em></div>)}<button onClick={() => setView("code")}>Review real files</button></div> : null}</div>)}
            {running ? <div className="message agent running-message"><span className="message-role"><Sparkles size={11} /> KODO</span><div className="thinking-line"><i /><span>Reading your project and making real changes</span></div><div className="thinking-steps"><span><Check size={11} /> Understanding request</span><span className="current"><i /> Editing project files</span><span>Running checks and saving version</span></div></div> : null}
          </div>
          <div className="agent-composer"><textarea value={prompt} onChange={event => setPrompt(event.target.value)} onKeyDown={event => { if ((event.metaKey || event.ctrlKey) && event.key === "Enter") void runAgent(); }} placeholder="Ask KODO to build, change, or fix…" aria-label="Message KODO" /><input ref={uploadInput} className="hidden-file-input" type="file" onChange={event => void uploadFile(event.target.files?.[0])} /><div><button aria-label="Add context" onClick={() => uploadInput.current?.click()}><Plus size={17} /></button><button className="attach-button" onClick={() => uploadInput.current?.click()}><Paperclip size={14} /> Attach</button><span className="composer-spacer" /><button className="model-button"><Sparkles size={13} /> GPT-5.6 Sol <ChevronDown size={11} /></button><button className="send-button" disabled={!prompt.trim() || running} onClick={() => void runAgent()}><ArrowUp size={16} /></button></div></div>
        </aside>
        <section className="work-panel">
          <header className="work-toolbar"><div className="view-switch"><button className={view === "preview" ? "active" : ""} onClick={() => setView("preview")}><Eye size={14} /> Preview</button><button className={view === "code" ? "active" : ""} onClick={() => setView("code")}><Code2 size={14} /> Code</button></div><div><button aria-label="Refresh preview" onClick={() => setPreviewNonce(value => value + 1)}><RefreshCw size={14} /></button><button onClick={() => setShowFiles(current => !current)}><Folder size={14} /> Files</button><button className={showVersions ? "active" : ""} onClick={() => setShowVersions(current => !current)}><History size={14} /> Versions</button><button onClick={() => void runCheck()} disabled={checking}><Terminal size={14} /> {checking ? "Checking…" : "Build"}</button><button aria-label="Preview settings"><Settings2 size={15} /></button></div></header>
          {view === "preview" ? <div className="live-preview"><div className="preview-browser"><div><button>←</button><button>→</button><button onClick={() => setPreviewNonce(value => value + 1)}>↻</button></div>{latestUrl ? <a href={latestUrl} target="_blank" rel="noreferrer">{latestUrl}<ExternalLink size={11} /></a> : <span>Secure instant preview</span>}<button>•••</button></div><iframe key={previewNonce} title={`${data?.project.name ?? "Project"} preview`} srcDoc={previewDocument} sandbox="allow-scripts allow-forms allow-modals allow-popups" /></div> : <div className="code-workspace">{showFiles ? <aside className="file-tree"><header><p>EXPLORER</p><button onClick={() => void createFile()} aria-label="New file"><Plus size={13} /></button></header>{data?.files.map(file => <button className={file.path === selectedPath ? "active" : ""} onClick={() => setSelectedPath(file.path)} key={file.id}>{file.path.includes("/") ? <Folder size={13} /> : file.language === "asset" ? <File size={13} /> : <FileCode2 size={13} />}<span>{file.path}</span></button>)}</aside> : null}<section className="editor"><div className="editor-tabs"><span><FileCode2 size={12} /> {selectedPath || "No file"}</span><div><button onClick={downloadFile} aria-label="Download file"><Download size={13} /></button><button onClick={() => void deleteFile()} aria-label="Delete file"><Trash2 size={13} /></button><button className="editor-save" disabled={!dirty || saving} onClick={() => void saveFile()}><Save size={13} /> {saving ? "Saving…" : "Save"}</button></div></div><textarea className="code-editor" value={editorValue} onChange={event => setDrafts(current => ({ ...current, [selectedPath]: event.target.value }))} spellCheck={false} aria-label={`Edit ${selectedPath}`} /><div className="editor-status"><span>{selectedFile?.language ?? "text"}</span><span>{editorValue.length.toLocaleString("en-IN")} characters · UTF-8</span></div></section></div>}
          {showVersions ? <aside className="version-panel"><header><div><span>PROJECT HISTORY</span><h2>Versions & rollback</h2></div><button onClick={() => setShowVersions(false)} aria-label="Close version history"><X size={15} /></button></header><div className="version-safety"><Check size={13} /><span><b>Safe restores</b><small>KODO checkpoints current files before every restore or production rollback.</small></span></div><button className="checkpoint-button" disabled={Boolean(versionBusy)} onClick={() => void createCheckpoint()}>{versionBusy === "checkpoint" ? <LoaderCircle size={13} /> : <Plus size={13} />} {versionBusy === "checkpoint" ? "Creating…" : "Create checkpoint"}</button><div>{data?.versions.map(version => {
            const knownGood = version.deployment_environment === "production" && version.deployment_status === "ready";
            const busy = versionBusy === version.id;
            return <article className={knownGood ? "known-good" : ""} key={version.id}><span>{knownGood ? <Check size={13} /> : <History size={13} />}</span><div><b>{version.label}</b><small>{new Date(version.created_at).toLocaleString()} · {version.file_count} files</small>{knownGood ? <em>Known-good production</em> : version.deployment_status ? <em>{version.deployment_environment} · {version.deployment_status}</em> : null}</div><div className="version-actions"><button disabled={Boolean(versionBusy)} onClick={() => void restoreVersion(version)}>{busy ? <LoaderCircle size={13} /> : <RotateCcw size={13} />} Restore</button>{knownGood ? <button className="rollback-live" disabled={Boolean(versionBusy)} onClick={() => void rollbackProduction(version)}><Globe size={13} /> Rollback live</button> : null}</div></article>;
          })}{!data?.versions.length ? <p>No versions yet. Complete an agent run or save a file.</p> : null}</div></aside> : null}
          {checkOutput ? <section className="builder-console"><header><span><Terminal size={13} /> Secure build output</span><button onClick={() => setCheckOutput("")}><X size={13} /></button></header><pre>{checkOutput}</pre></section> : null}
        </section>
      </div>
      {publishOpen ? <div className="publish-layer" role="dialog" aria-modal="true"><button className="publish-scrim" onClick={() => setPublishOpen(false)} aria-label="Close" /><section className="publish-dialog"><button className="dialog-close" onClick={() => setPublishOpen(false)}><X size={18} /></button><span className="publish-icon"><Globe size={22} /></span><h2>Build and deploy</h2><p>KODO will run the production build in Vercel Sandbox, freeze a version and create a real Vercel preview or production URL.</p><div className="publish-checks"><span><Check size={13} /> Real project files</span><span><Check size={13} /> Versioned deployment</span><span><Check size={13} /> Live deployment status</span></div>{latestDeployment ? <div className={`latest-deployment ${latestDeployment.status}`}><span>{latestDeployment.status === "ready" ? <Check size={13} /> : latestDeployment.status === "failed" ? <CircleAlert size={13} /> : <LoaderCircle size={13} />} {latestDeployment.environment} · {latestDeployment.status}</span>{latestDeployment.url ? <a href={latestDeployment.url} target="_blank" rel="noreferrer">Open <ExternalLink size={11} /></a> : null}</div> : null}<button className="confirm-publish" disabled={publishing} onClick={() => void publish("production")}><Play size={14} /> {publishing ? "Building and deploying…" : "Deploy production"}</button><button className="preview-publish" disabled={publishing} onClick={() => void publish("preview")}>Create Vercel preview</button></section></div> : null}
      {githubOpen ? <div className="publish-layer" role="dialog" aria-modal="true">
        <button className="publish-scrim" onClick={() => setGithubOpen(false)} aria-label="Close" />
        <section className="publish-dialog github-dialog">
          <button className="dialog-close" onClick={() => setGithubOpen(false)}><X size={18} /></button>
          <span className="publish-icon"><Github size={22} /></span>
          <h2>Sync to GitHub</h2>
          <p>KODO writes every current text file as one atomic commit. Later syncs also remove files deleted inside this project.</p>
          {latestGitHubSync ? <div className={`latest-github-sync ${latestGitHubSync.status}`}>
            <span>{latestGitHubSync.status === "ready" ? <Check size={13} /> : latestGitHubSync.status === "failed" ? <CircleAlert size={13} /> : <LoaderCircle size={13} />} {latestGitHubSync.repository} · {latestGitHubSync.branch}</span>
            {latestGitHubSync.url ? <a href={latestGitHubSync.url} target="_blank" rel="noreferrer">Commit <ExternalLink size={11} /></a> : <em>{latestGitHubSync.status}</em>}
          </div> : null}
          {githubLoading ? <div className="github-picker-state loading"><LoaderCircle size={15} /> Loading approved repositories…</div>
            : githubLoadError ? <div className="github-picker-state error"><CircleAlert size={15} /><span>{githubLoadError}</span><button onClick={() => void openGitHubDialog()}>Try again</button></div>
              : githubConnected === false ? <div className="github-picker-state">Connect the KODO GitHub App first.</div>
                : githubRepositories.length ? <label>Repository<select aria-label="Repository" value={githubRepository} onChange={event => setGithubRepository(event.target.value)}>{githubRepositories.map(repository => <option value={repository.name} key={repository.name}>{repository.name}{repository.private ? " · Private" : " · Public"}</option>)}</select></label>
                  : <div className="github-picker-state error"><CircleAlert size={15} /> No approved repositories are available.</div>}
          <label>Branch (optional)<input value={githubBranch} onChange={event => setGithubBranch(event.target.value)} placeholder="KODO will create a safe project branch" /></label>
          <button className="confirm-publish" disabled={githubConnected !== true || !githubRepositories.some(repository => repository.name === githubRepository) || githubBusy || githubLoading} onClick={() => void exportToGitHub()}><GitBranch size={14} /> {githubBusy ? "Syncing files…" : "Sync project"}</button>
          <a className="github-connect-link" href={githubConnectUrl}>{githubConnected === false ? "Connect GitHub" : "Update approved repositories"}</a>
        </section>
      </div> : null}
    </main>
  );
}
