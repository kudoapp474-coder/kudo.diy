"use client";

import { FormEvent, useState } from "react";
import { ArrowRight, GitBranch, Plus, Sparkles } from "lucide-react";

function projectNameFromTask(task: string) {
  const words = task.replace(/[^a-zA-Z0-9\s-]/g, " ").trim().split(/\s+/).filter(Boolean);
  return words.slice(0, 6).join(" ").slice(0, 72) || "Untitled project";
}

export function WorkspaceComposer() {
  const [task, setTask] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

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
      const query = new URLSearchParams({ task: prompt, autorun: "1" });
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
      <div>
        <button type="button" className="composer-plus" aria-label="Add project context"><Plus size={16} /></button>
        <button type="button" className="composer-repo"><GitBranch size={14} /> Blank project <span>⌄</span></button>
        <span />
        <button type="button" className="composer-model"><Sparkles size={13} /> GPT-5.6 Sol</button>
        <button className="composer-submit" disabled={!task.trim() || busy} aria-label="Create project and run KODO"><ArrowRight size={16} /></button>
      </div>
      <footer><span>@ context</span><span>/ commands</span><span>{busy ? "Creating project…" : "⌘ ↵ run"}</span></footer>
      {error ? <p className="workspace-composer-error" role="alert">{error}</p> : null}
    </form>
  );
}
