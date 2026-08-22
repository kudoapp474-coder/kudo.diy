"use client";

import { FormEvent, useEffect, useState } from "react";
import { CircleAlert, FileCode2, FolderGit2, MoreHorizontal, Plus, ShieldCheck, Workflow, X, Zap } from "lucide-react";

type Automation = {
  id: string;
  project_id: string | null;
  project_name: string | null;
  name: string;
  prompt: string;
  trigger_type: string;
  trigger_config_json: string;
  active: number;
  last_run_at: string | null;
  created_at: string;
};

type Project = { id: string; name: string };

const TRIGGER_TYPES: Record<string, { label: string; icon: typeof Zap }> = {
  ci_failure: { label: "GitHub Actions fails", icon: Zap },
  schedule: { label: "On a schedule", icon: ShieldCheck },
  pull_request_merged: { label: "Pull request merged", icon: FileCode2 },
};

function triggerDetail(automation: Automation) {
  try {
    const config = JSON.parse(automation.trigger_config_json) as { description?: string };
    return config.description?.trim() || "";
  } catch {
    return "";
  }
}

async function loadAutomations() {
  const response = await fetch("/api/automations", { cache: "no-store" });
  const data = await response.json() as { automations?: Automation[]; error?: string };
  if (!response.ok) throw new Error(data.error ?? "Could not load automations.");
  return data.automations ?? [];
}

async function loadProjects() {
  const response = await fetch("/api/projects", { cache: "no-store" });
  const data = await response.json() as { projects?: Project[] };
  return data.projects ?? [];
}

export function AutomationsManager() {
  const [automations, setAutomations] = useState<Automation[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");
  const [triggerType, setTriggerType] = useState("ci_failure");

  async function refresh() {
    setLoading(true);
    try {
      setAutomations(await loadAutomations());
      setError("");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not load automations.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    let active = true;
    Promise.all([loadAutomations(), loadProjects()])
      .then(([loadedAutomations, loadedProjects]) => { if (active) { setAutomations(loadedAutomations); setProjects(loadedProjects); } })
      .catch(reason => { if (active) setError(reason instanceof Error ? reason.message : "Could not load automations."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;
    setSaving(true);
    setFormError("");
    const form = new FormData(event.currentTarget);
    const description = String(form.get("description") ?? "").trim();
    try {
      const response = await fetch("/api/automations", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: form.get("name"),
          prompt: form.get("prompt"),
          triggerType: form.get("triggerType"),
          projectId: form.get("projectId"),
          triggerConfig: description ? { description } : {},
        }),
      });
      const data = await response.json() as { error?: string };
      if (!response.ok) throw new Error(data.error ?? "Could not save this automation.");
      setShowCreate(false);
      await refresh();
    } catch (reason) {
      setFormError(reason instanceof Error ? reason.message : "Could not save this automation.");
    } finally {
      setSaving(false);
    }
  }

  const triggerHelp = triggerType === "schedule"
    ? "Runs at most once per day (the hosting plan's cron limit) rather than at an exact time."
    : "Runs automatically when this happens on the linked project's connected GitHub repository.";

  return <>
    {error ? <div className="manager-error">{error}</div> : null}
    {loading ? <div className="manager-loading"><i /> Loading your automations...</div> : automations.length === 0 ? (
      <div className="automation-cards"><button className="create-automation" onClick={() => setShowCreate(true)}><Plus size={21} /><b>Build an automation</b><span>Describe the workflow in plain language</span></button></div>
    ) : (
      <div className="automation-cards">
        {automations.map(automation => {
          const trigger = TRIGGER_TYPES[automation.trigger_type] ?? { label: automation.trigger_type, icon: Workflow };
          const Icon = trigger.icon;
          const detail = triggerDetail(automation);
          return <article key={automation.id}>
            <header><span><Icon size={17} /></span><button aria-label="Automation options"><MoreHorizontal size={16} /></button></header>
            <h2>{automation.name}</h2>
            <p>{automation.prompt}</p>
            <div className="automation-trigger"><Workflow size={13} /><span><small>TRIGGER</small>{trigger.label}{detail ? ` · ${detail}` : ""}</span></div>
            {automation.project_name ? <div className="automation-project"><FolderGit2 size={11} /> {automation.project_name}</div> : null}
            <footer><span><i /> {automation.active ? "Active" : "Paused"}</span><time>{automation.last_run_at ? `Ran ${new Date(automation.last_run_at).toLocaleString()}` : "Not run yet"}</time></footer>
          </article>;
        })}
        <button className="create-automation" onClick={() => setShowCreate(true)}><Plus size={21} /><b>Build an automation</b><span>Describe the workflow in plain language</span></button>
      </div>
    )}
    {showCreate ? <div className="manager-modal">
      <button className="manager-scrim" onClick={() => setShowCreate(false)} aria-label="Close" />
      <form onSubmit={create}>
        <button type="button" className="manager-close" onClick={() => setShowCreate(false)}><X size={17} /></button>
        <span className="manager-icon"><Workflow size={19} /></span>
        <h2>New automation</h2>
        <p>KODO runs this automation&rsquo;s prompt against the project you choose, using the trigger you pick below.</p>
        <label>Name<input name="name" placeholder="Fix CI failures on main" required autoFocus /></label>
        <label>Project<select name="projectId" required defaultValue="">{!projects.length ? <option value="" disabled>No projects yet</option> : <option value="" disabled>Choose a project</option>}{projects.map(project => <option value={project.id} key={project.id}>{project.name}</option>)}</select></label>
        <label>What should KODO do?<textarea name="prompt" placeholder="Investigate the failure, repair the cause, and open a pull request." required /></label>
        <label>Trigger<select name="triggerType" value={triggerType} onChange={event => setTriggerType(event.target.value)}>{Object.entries(TRIGGER_TYPES).map(([value, config]) => <option value={value} key={value}>{config.label}</option>)}</select></label>
        <p className="automation-form-hint">{triggerHelp}</p>
        <label>Trigger detail (optional)<input name="description" placeholder="Fridays at 5:00 PM" /></label>
        {formError ? <p className="workspace-composer-error" role="alert"><CircleAlert size={12} /> {formError}</p> : null}
        <button className="manager-submit" disabled={saving || !projects.length}>{saving ? "Saving..." : "Save automation"}</button>
      </form>
    </div> : null}
  </>;
}
