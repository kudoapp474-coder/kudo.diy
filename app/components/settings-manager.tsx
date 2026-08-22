"use client";

import { FormEvent, useEffect, useState } from "react";
import { CircleAlert } from "lucide-react";

type Workspace = { name: string; slug: string; plan: string; owner_email: string };
type Member = { email: string; name: string };
type Permissions = { runTests: boolean; createCommits: boolean; openPullRequests: boolean; productionDeploys: boolean };

const PERMISSION_ROWS: Array<{ key: keyof Permissions; label: string; hint: string }> = [
  { key: "runTests", label: "Run tests and builds", hint: "Let KODO run the project's checks while it works." },
  { key: "createCommits", label: "Create branches and commits", hint: "Let KODO write commits directly on working branches." },
  { key: "openPullRequests", label: "Open pull requests", hint: "Let KODO open PRs on the linked GitHub repository." },
  { key: "productionDeploys", label: "Production deployments", hint: "Let KODO deploy straight to production without asking." },
];

export function SettingsManager() {
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [member, setMember] = useState<Member | null>(null);
  const [permissions, setPermissions] = useState<Permissions | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");
  const [permissionBusy, setPermissionBusy] = useState("");

  useEffect(() => {
    let active = true;
    fetch("/api/settings", { cache: "no-store" })
      .then(response => response.json() as Promise<{ workspace?: Workspace; member?: Member; permissions?: Permissions; error?: string }>)
      .then(data => {
        if (!active) return;
        if (!data.workspace) { setError(data.error ?? "Could not load settings."); return; }
        setWorkspace(data.workspace);
        setMember(data.member ?? null);
        setPermissions(data.permissions ?? null);
      })
      .catch(() => { if (active) setError("Could not load settings."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  async function saveGeneral(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;
    setSaving(true);
    setFormError("");
    setNotice("");
    const form = new FormData(event.currentTarget);
    const payload = { name: String(form.get("name") ?? ""), slug: String(form.get("slug") ?? "") };
    try {
      const response = await fetch("/api/settings", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
      const data = await response.json() as { workspace?: Workspace; error?: string };
      if (!response.ok || !data.workspace) throw new Error(data.error ?? "Could not save these changes.");
      setWorkspace(data.workspace);
      setNotice("Workspace settings saved.");
    } catch (reason) {
      setFormError(reason instanceof Error ? reason.message : "Could not save these changes.");
    } finally {
      setSaving(false);
    }
  }

  async function togglePermission(key: keyof Permissions) {
    if (!permissions || permissionBusy) return;
    const next = { ...permissions, [key]: !permissions[key] };
    setPermissions(next);
    setPermissionBusy(key);
    setError("");
    try {
      const response = await fetch("/api/settings/permissions", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ permissions: { [key]: next[key] } }) });
      const data = await response.json() as { permissions?: Permissions; error?: string };
      if (!response.ok || !data.permissions) throw new Error(data.error ?? "Could not update this permission.");
      setPermissions(data.permissions);
    } catch (reason) {
      setPermissions(permissions);
      setError(reason instanceof Error ? reason.message : "Could not update this permission.");
    } finally {
      setPermissionBusy("");
    }
  }

  if (loading) return <div className="manager-loading"><i /> Loading settings...</div>;

  return <div className="settings-layout">
    <nav><a className="active" href="#general">General</a><a href="#members">Members</a><a href="#permissions">Agent permissions</a><a href="/integrations">Integrations</a><a href="/launch">Launch readiness</a></nav>
    <section className="settings-sections">
      {error ? <div className="manager-error">{error}</div> : null}
      {notice ? <div className="manager-notice">{notice}</div> : null}
      <div id="general">
        <h2>General</h2>
        <p>Manage your workspace identity and default behavior.</p>
        {workspace ? <form onSubmit={saveGeneral}>
          <label>Workspace name<input name="name" defaultValue={workspace.name} required maxLength={80} /></label>
          <label>Workspace slug<div className="input-prefix"><span>kodo.diy/</span><input name="slug" defaultValue={workspace.slug} required maxLength={50} /></div></label>
          {formError ? <p className="workspace-composer-error" role="alert"><CircleAlert size={12} /> {formError}</p> : null}
          <button className="setting-save" disabled={saving}>{saving ? "Saving..." : "Save changes"}</button>
        </form> : null}
      </div>
      <div id="members">
        <h2>Members</h2>
        <p>Invite people and manage their workspace access.</p>
        {member ? <div className="member-row"><span className="user-avatar">{(member.name || member.email)[0]?.toUpperCase()}</span><span><b>{member.name || member.email}</b><small>{member.email}</small></span><em>Owner</em></div> : null}
        <p className="automation-form-hint">Inviting teammates and role-based access are coming soon.</p>
      </div>
      <div id="permissions">
        <h2>Agent permissions</h2>
        <p>Choose which actions KODO can complete without asking.</p>
        {permissions ? PERMISSION_ROWS.map(row => (
          <div className="permission-row" key={row.key}>
            <span><b>{row.label}</b><small>{row.hint}</small></span>
            <label className="switch">
              <input type="checkbox" checked={permissions[row.key]} disabled={permissionBusy === row.key} onChange={() => togglePermission(row.key)} />
              <i />
            </label>
          </div>
        )) : null}
      </div>
    </section>
  </div>;
}
