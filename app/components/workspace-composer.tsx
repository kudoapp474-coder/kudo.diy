"use client";

import { ChangeEvent, FormEvent, useRef, useState } from "react";
import { ArrowRight, FileText, GitBranch, Plus, Sparkles, X } from "lucide-react";

const MAX_CONTEXT_FILES = 5;
const MAX_CONTEXT_FILE_BYTES = 10 * 1024 * 1024;

function projectNameFromTask(task: string) {
  const words = task.replace(/[^a-zA-Z0-9\s-]/g, " ").trim().split(/\s+/).filter(Boolean);
  return words.slice(0, 6).join(" ").slice(0, 72) || "Untitled project";
}

function fileKey(file: File) {
  return `${file.name}:${file.size}:${file.lastModified}`;
}

export function WorkspaceComposer() {
  const [task, setTask] = useState("");
  const [attachments, setAttachments] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const contextInput = useRef<HTMLInputElement>(null);

  function selectContextFiles(event: ChangeEvent<HTMLInputElement>) {
    const incoming = Array.from(event.target.files ?? []);
    event.target.value = "";
    const oversized = incoming.find(file => file.size > MAX_CONTEXT_FILE_BYTES);
    if (oversized) {
      setError(`${oversized.name} is larger than 10 MB.`);
      return;
    }
    setAttachments(current => {
      const unique = new Map(current.map(file => [fileKey(file), file]));
      incoming.forEach(file => unique.set(fileKey(file), file));
      const next = Array.from(unique.values());
      if (next.length > MAX_CONTEXT_FILES) setError(`You can attach up to ${MAX_CONTEXT_FILES} context files.`);
      else setError("");
      return next.slice(0, MAX_CONTEXT_FILES);
    });
  }

  function removeContextFile(key: string) {
    setAttachments(current => current.filter(file => fileKey(file) !== key));
    setError("");
  }

  async function createProject(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const prompt = task.trim();
    if (!prompt || busy) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/projects", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: projectNameFromTask(prompt), description: prompt.slice(0, 500), prompt }),
      });
      const data = await response.json() as { project?: { id: string }; error?: string; upgradeUrl?: string };
      if (!response.ok || !data.project) {
        setError(data.error ?? "KODO could not create the project.");
        return;
      }

      const uploadResults = await Promise.all(attachments.map(async file => {
        const form = new FormData();
        form.set("projectId", data.project!.id);
        form.set("file", file);
        const upload = await fetch("/api/uploads", { method: "POST", body: form });
        return { ok: upload.ok, name: file.name };
      }));
      const failedUploads = uploadResults.filter(result => !result.ok);
      const query = new URLSearchParams({ task: prompt });
      if (failedUploads.length) {
        query.set("notice", `${failedUploads.length} context file${failedUploads.length === 1 ? "" : "s"} could not be uploaded. Add them again, then run KODO.`);
      } else {
        query.set("autorun", "1");
      }
      window.location.assign(`/project/${data.project.id}?${query.toString()}`);
    } catch {
      setError("KODO could not reach the project service. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form id="build" className="workspace-composer" onSubmit={createProject}>
      <textarea value={task} onChange={event => setTask(event.target.value)} placeholder="Describe the website or app you want KODO to build" aria-label="Give KODO a task" />
      <input ref={contextInput} className="hidden-file-input" type="file" multiple accept="image/*,.pdf,.txt,.md,.csv,.json,.html,.css,.js,.mjs,.ts,.tsx" onChange={selectContextFiles} />
      {attachments.length ? <ul className="composer-context-files" aria-label="Attached project context">{attachments.map(file => <li key={fileKey(file)}><FileText size={12}/><span title={file.name}>{file.name}</span><small>{Math.max(1, Math.ceil(file.size / 1024))} KB</small><button type="button" onClick={() => removeContextFile(fileKey(file))} aria-label={`Remove ${file.name}`}><X size={11}/></button></li>)}</ul> : null}
      <div>
        <button type="button" className="composer-plus" aria-label="Add project context" title="Attach up to 5 files" onClick={() => contextInput.current?.click()}><Plus size={16} /></button>
        <button type="button" className="composer-repo" aria-label="Blank project template"><GitBranch size={14} /> Blank project</button>
        <span />
        <button type="button" className="composer-model" aria-label="Selected AI model"><Sparkles size={13} /> GPT-5.6 Sol</button>
        <button className="composer-submit" disabled={!task.trim() || busy} aria-label="Create project and run KODO"><ArrowRight size={16} /></button>
      </div>
      <footer><span>@ context</span><span>/ commands</span><span>{busy ? attachments.length ? "Uploading context…" : "Creating project…" : "⌘ ↵ run"}</span></footer>
      {error ? <p className="workspace-composer-error" role="alert">{error}</p> : null}
    </form>
  );
}
