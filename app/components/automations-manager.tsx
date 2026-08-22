"use client";

import { FormEvent, useEffect, useState } from "react";
import { CircleAlert, Clock3, FileCode2, FolderGit2, History, LoaderCircle, MoreHorizontal, Pause, Pencil, Play, Plus, ShieldCheck, Trash2, Workflow, X, Zap } from "lucide-react";

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
  last_status: string | null;
  last_error: string | null;
  created_at: string;
};

type AutomationRun = { id: string; trigger: string; status: string; error: string | null; generation_id: string | null; created_at: string; updated_at: string };
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
  const [notice, setNotice] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [editing, setEditing] = useState<Automation | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");
  const [triggerType, setTriggerType] = useState("ci_failure");
  const [busyId, setBusyId] = useState("");
  const [historyId, setHistoryId] = useState("");
  const [historyRuns, setHistoryRuns] = useState<AutomationRun[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

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

  function openCreate() {
    setEditing(null);
    setTriggerType("ci_failure");
    setFormError("");
    setShowCreate(true);
  }

  function openEdit(automation: Automation) {
    setEditing(automation);
    setTriggerType(automation.trigger_type);
    setFormError("");
    setShowCreate(true);
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;
    setSaving(true);
    setFormError("");
    const form = new FormData(event.currentTarget);
    const description = String(form.get("description") ?? "").trim();
    const payload = {
      name: form.get("name"),
      prompt: form.get("prompt"),
      triggerType: form.get("triggerType"),
      projectId: form.get("projectId"),
      triggerConfig: description ? { description } : {},
    };
    try {
      const response = editing
        ? await fetch(`/api/automations/${encodeURIComponent(editing.id)}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) })
        : await fetch("/api/automations", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
      const data = await response.json() as { error?: string };
      if (!response.ok) throw new Error(data.error ?? "Could not save this automation.");
      setShowCreate(false);
      setEditing(null);
      setNotice(editing ? "Automation updated." : "Automation created.");
      await refresh();
    } catch (reason) {
      setFormError(reason instanceof Error ? reason.message : "Could not save this automation.");
    } finally {
      setSaving(false);
    }
  }

  async function runNow(automation: Automation) {
    if (busyId) return;
    setBusyId(automation.id);
    setError(""); setNotice("");
    try {
      const response = await fetch(`/api/automations/${encodeURIComponent(automation.id)}/run`, { method: "POST" });
      const data = await response.json() as { error?: string; status?: string };
      if (!response.ok) throw new Error(data.error ?? "This run could not be started.");
      setNotice(data.status === "complete" ? `${automation.name} ran successfully.` : `${automation.name} finished with an issue. Check its history.`);
      await refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "This run could not be started.");
    } finally {
      setBusyId("");
    }
  }

  async function toggleActive(automation: Automation) {
    if (busyId) return;
    setBusyId(automation.id);
    try {
      const response = await fetch(`/api/automations/${encodeURIComponent(automation.id)}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ active: !automation.active }) });
      const data = await response.json() as { error?: string };
      if (!response.ok) throw new Error(data.error ?? "Could not update this automation.");
      await refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not update this automation.");
    } finally {
      setBusyId("");
    }
  }

  async function remove(automation: Automation) {
    if (busyId || !window.confirm(`Delete "${automation.name}"? This also removes its run history.`)) return;
    setBusyId(automation.id);
    try {
      const response = await fetch(`/api/automations/${encodeURIComponent(automation.id)}`, { method: "DELETE" });
      const data = await response.json() as { error?: string };
      if (!response.ok) throw new Error(data.error ?? "Could not delete this automation.");
      if (historyId === automation.id) setHistoryId("");
      setNotice(`${automation.name} deleted.`);
      await refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not delete this automation.");
    } finally {
      setBusyId("");
    }
  }

  async function toggleHistory(automation: Automation) {
    if (historyId === automation.id) { setHistoryId(""); return; }
    setHistoryId(automation.id);
    setHistoryLoading(true);
    try {
      const response = await fetch(`/api/automations/${encodeURIComponent(automation.id)}/runs`, { cache: "no-store" });
      const data = await response.json() as { runs?: AutomationRun[]; error?: string };
      if (!response.ok) throw new Error(data.error ?? "Could not load run history.");
      setHistoryRuns(data.runs ?? []);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not load run history.");
      setHistoryId("");
    } finally {
      setHistoryLoading(false);
    }
  }

  const triggerHelp = triggerType === "schedule"
    ? "Runs at most once per day (the hosting plan's cron limit) rather than at an exact time."
    : "Runs automatically when this happens on the linked project's connected GitHub repository.";

  return <>
    {error ? <div className="manager-error">{error}</div> : null}
    {notice ? <div className="manager-notice">{notice}</div> : null}
    {loading ? <div className="manager-loading"><i /> Loading your automations...</div> : automations.length === 0 ? (
      <div className="automation-cards"><button className="create-automation" onClick={openCreate}><Plus size={21} /><b>Build an automation</b><span>Describe the workflow in plain language</span></button></div>
    ) : (
      <div className="automation-cards">
        {automations.map(automation => {
          const trigger = TRIGGER_TYPES[automation.trigger_type] ?? { label: automation.trigger_type, icon: Workflow };
          const Icon = trigger.icon;
          const detail = triggerDetail(automation);
          const busy = busyId === automation.id;
          const showingHistory = historyId === automation.id;
          return <article key={automation.id}>
            <header>
              <span><Icon size={17} /></span>
              <details className="automation-menu">
                <summary aria-label="Automation options"><MoreHorizontal size={16} /></summary>
                <div className="automation-menu-popover">
                  <button onClick={() => void runNow(automation)} disabled={busy}>{busy ? <LoaderCircle size={13} /> : <Play size={13} />} Run now</button>
                  <button onClick={() => void toggleActive(automation)} disabled={busy}>{automation.active ? <Pause size={13} /> : <Play size={13} />} {automation.active ? "Pause" : "Resume"}</button>
                  <button onClick={() => openEdit(automation)}><Pencil size={13} /> Edit</button>
                  <button onClick={() => void toggleHistory(automation)}><History size={13} /> {showingHistory ? "Hide history" : "View history"}</button>
                  <button className="danger" onClick={() => void remove(automation)} disabled={busy}><Trash2 size={13} /> Delete</button>
                </div>
              </details>
            </header>
            <h2>{automation.name}</h2>
            <p>{automation.prompt}</p>
            <div className="automation-trigger"><Workflow size={13} /><span><small>TRIGGER</small>{trigger.label}{detail ? ` · ${detail}` : ""}</span></div>
            {automation.project_name ? <div className="automation-project"><FolderGit2 size={11} /> {automation.project_name}</div> : null}
            <footer>
              <span><i className={automation.active ? "" : "paused"} /> {automation.active ? "Active" : "Paused"}</span>
              <time>{automation.last_run_at ? `Ran ${new Date(automation.last_run_at).toLocaleString()}` : "Not run yet"}</time>
            </footer>
            {automation.last_status === "error" && automation.last_error ? <div className="automation-last-error"><CircleAlert size={12} /> {automation.last_error}</div> : null}
            {showingHistory ? <div className="automation-history">
              {historyLoading ? <span className="automation-history-empty"><LoaderCircle size={12} /> Loading history…</span> : historyRuns.length ? historyRuns.map(run => (
                <div className="automation-history-row" key={run.id}>
                  <em className={run.status}>{run.status}</em>
                  <span>{run.trigger}</span>
                  <small><Clock3 size={9} /> {new Date(run.created_at).toLocaleString()}</small>
                  {run.error ? <small className="automation-history-error">{run.error}</small> : null}
                </div>
              )) : <span className="automation-history-empty">No runs recorded yet.</span>}
            </div> : null}
          </article>;
        })}
        <button className="create-automation" onClick={openCreate}><Plus size={21} /><b>Build an automation</b><span>Describe the workflow in plain language</span></button>
      </div>
    )}
    {showCreate ? <div className="manager-modal">
      <button className="manager-scrim" onClick={() => setShowCreate(false)} aria-label="Close" />
      <form onSubmit={save}>
        <button type="button" className="manager-close" onClick={() => setShowCreate(false)}><X size={17} /></button>
        <span className="manager-icon"><Workflow size={19} /></span>
        <h2>{editing ? "Edit automation" : "New automation"}</h2>
        <p>KODO runs this automation&rsquo;s prompt against the project you choose, using the trigger you pick below.</p>
        <label>Name<input name="name" placeholder="Fix CI failures on main" required autoFocus defaultValue={editing?.name ?? ""} /></label>
        <label>Project<select name="projectId" required defaultValue={editing?.project_id ?? ""}>{!projects.length ? <option value="" disabled>No projects yet</option> : <option value="" disabled>Choose a project</option>}{projects.map(project => <option value={project.id} key={project.id}>{project.name}</option>)}</select></label>
        <label>What should KODO do?<textarea name="prompt" placeholder="Investigate the failure, repair the cause, and open a pull request." required defaultValue={editing?.prompt ?? ""} /></label>
        <label>Trigger<select name="triggerType" value={triggerType} onChange={event => setTriggerType(event.target.value)}>{Object.entries(TRIGGER_TYPES).map(([value, config]) => <option value={value} key={value}>{config.label}</option>)}</select></label>
        <p className="automation-form-hint">{triggerHelp}</p>
        <label>Trigger detail (optional)<input name="description" placeholder="Fridays at 5:00 PM" defaultValue={editing ? triggerDetail(editing) : ""} /></label>
        {formError ? <p className="workspace-composer-error" role="alert"><CircleAlert size={12} /> {formError}</p> : null}
        <button className="manager-submit" disabled={saving || !projects.length}>{saving ? "Saving..." : editing ? "Save changes" : "Save automation"}</button>
      </form>
    </div> : null}
  </>;
}
