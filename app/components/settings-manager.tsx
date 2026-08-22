"use client";

import { FormEvent, useEffect, useState } from "react";
import { CheckCircle2, CircleAlert, Copy, LoaderCircle, Plus, Trash2, X } from "lucide-react";

type Workspace = { name: string; slug: string; plan: string; owner_email: string };
type Member = { email: string; name: string };
type Role = "owner" | "admin" | "member";
type Permissions = { runTests: boolean; createCommits: boolean; openPullRequests: boolean; productionDeploys: boolean };
type TeamMember = { id: string; email: string; role: Role; status: "invited" | "active"; invite_token: string | null; created_at: string; joined_at: string | null };
type TeamWorkspace = { id: string; name: string; slug: string; plan: string; role: Role; current: boolean };

const PERMISSION_ROWS: Array<{ key: keyof Permissions; label: string; hint: string }> = [
  { key: "runTests", label: "Run tests and builds", hint: "Let KODO run the project's checks while it works." },
  { key: "createCommits", label: "Create branches and commits", hint: "Let KODO write commits directly on working branches." },
  { key: "openPullRequests", label: "Open pull requests", hint: "Reserved for the upcoming GitHub PR workflow — KODO doesn't open PRs yet." },
  { key: "productionDeploys", label: "Production deployments", hint: "Reserved for automatic deploys — publishing is always a manual action today." },
];

function canManage(role: Role | null) {
  return role === "owner" || role === "admin";
}

function inviteLink(token: string) {
  return typeof window === "undefined" ? "" : `${window.location.origin}/invite?token=${token}`;
}

export function SettingsManager() {
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [member, setMember] = useState<Member | null>(null);
  const [role, setRole] = useState<Role | null>(null);
  const [permissions, setPermissions] = useState<Permissions | null>(null);
  const [team, setTeam] = useState<TeamMember[]>([]);
  const [workspaces, setWorkspaces] = useState<TeamWorkspace[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");
  const [permissionBusy, setPermissionBusy] = useState("");
  const [showInvite, setShowInvite] = useState(false);
  const [inviteError, setInviteError] = useState("");
  const [inviteBusy, setInviteBusy] = useState(false);
  const [memberBusy, setMemberBusy] = useState("");
  const [switchingId, setSwitchingId] = useState("");

  async function loadTeam() {
    const response = await fetch("/api/team/members", { cache: "no-store" });
    const data = await response.json() as { members?: TeamMember[]; error?: string };
    if (response.ok) setTeam(data.members ?? []);
  }

  useEffect(() => {
    let active = true;
    Promise.all([
      fetch("/api/settings", { cache: "no-store" }).then(response => response.json() as Promise<{ workspace?: Workspace; member?: Member; role?: Role; permissions?: Permissions; error?: string }>),
      fetch("/api/team/members", { cache: "no-store" }).then(response => response.json() as Promise<{ members?: TeamMember[] }>),
      fetch("/api/team/workspaces", { cache: "no-store" }).then(response => response.json() as Promise<{ workspaces?: TeamWorkspace[] }>),
    ])
      .then(([settings, members, teamWorkspaces]) => {
        if (!active) return;
        if (!settings.workspace) { setError(settings.error ?? "Could not load settings."); return; }
        setWorkspace(settings.workspace);
        setMember(settings.member ?? null);
        setRole(settings.role ?? null);
        setPermissions(settings.permissions ?? null);
        setTeam(members.members ?? []);
        setWorkspaces(teamWorkspaces.workspaces ?? []);
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

  async function invite(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (inviteBusy) return;
    setInviteBusy(true);
    setInviteError("");
    const form = new FormData(event.currentTarget);
    const payload = { email: String(form.get("email") ?? ""), role: String(form.get("role") ?? "member") };
    try {
      const response = await fetch("/api/team/members", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
      const data = await response.json() as { error?: string };
      if (!response.ok) throw new Error(data.error ?? "Could not send this invite.");
      setShowInvite(false);
      setNotice("Invite created. Share the link from their row below.");
      await loadTeam();
    } catch (reason) {
      setInviteError(reason instanceof Error ? reason.message : "Could not send this invite.");
    } finally {
      setInviteBusy(false);
    }
  }

  async function changeRole(memberId: string, nextRole: Role) {
    if (memberBusy) return;
    setMemberBusy(memberId);
    setError("");
    try {
      const response = await fetch(`/api/team/members/${encodeURIComponent(memberId)}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ role: nextRole }) });
      const data = await response.json() as { error?: string };
      if (!response.ok) throw new Error(data.error ?? "Could not update this member's role.");
      await loadTeam();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not update this member's role.");
    } finally {
      setMemberBusy("");
    }
  }

  async function removeMember(row: TeamMember) {
    if (memberBusy || !window.confirm(`Remove ${row.email} from this workspace?`)) return;
    setMemberBusy(row.id);
    setError("");
    try {
      const response = await fetch(`/api/team/members/${encodeURIComponent(row.id)}`, { method: "DELETE" });
      const data = await response.json() as { error?: string };
      if (!response.ok) throw new Error(data.error ?? "Could not remove this member.");
      setNotice(`${row.email} removed.`);
      await loadTeam();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not remove this member.");
    } finally {
      setMemberBusy("");
    }
  }

  async function copyInvite(token: string) {
    try {
      await navigator.clipboard.writeText(inviteLink(token));
      setNotice("Invite link copied.");
    } catch {
      setNotice(inviteLink(token));
    }
  }

  async function switchWorkspace(workspaceId: string) {
    if (switchingId) return;
    setSwitchingId(workspaceId);
    setError("");
    try {
      const response = await fetch("/api/team/switch", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ workspaceId }) });
      const data = await response.json() as { error?: string };
      if (!response.ok) throw new Error(data.error ?? "Could not switch workspaces.");
      window.location.reload();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not switch workspaces.");
      setSwitchingId("");
    }
  }

  if (loading) return <div className="manager-loading"><i /> Loading settings...</div>;
  const manage = canManage(role);

  return <div className="settings-layout">
    <nav><a className="active" href="#general">General</a><a href="#members">Members</a><a href="#permissions">Agent permissions</a><a href="#workspaces">Workspaces</a><a href="/integrations">Integrations</a><a href="/launch">Launch readiness</a></nav>
    <section className="settings-sections">
      {error ? <div className="manager-error">{error}</div> : null}
      {notice ? <div className="manager-notice">{notice}</div> : null}
      <div id="general">
        <h2>General</h2>
        <p>Manage your workspace identity and default behavior.</p>
        {workspace ? <form onSubmit={saveGeneral}>
          <label>Workspace name<input name="name" defaultValue={workspace.name} required maxLength={80} readOnly={!manage} /></label>
          <label>Workspace slug<div className="input-prefix"><span>kodo.diy/</span><input name="slug" defaultValue={workspace.slug} required maxLength={50} readOnly={!manage} /></div></label>
          {formError ? <p className="workspace-composer-error" role="alert"><CircleAlert size={12} /> {formError}</p> : null}
          {manage ? <button className="setting-save" disabled={saving}>{saving ? "Saving..." : "Save changes"}</button> : <p className="automation-form-hint">Only the owner or an admin can change these settings.</p>}
        </form> : null}
      </div>
      <div id="members">
        <h2>Members</h2>
        <p>Invite people and manage their workspace access.</p>
        {team.map(row => {
          const isYou = member && row.email === member.email.toLowerCase();
          const busy = memberBusy === row.id;
          return <div className="member-row" key={row.id}>
            <span className="user-avatar">{row.email[0]?.toUpperCase()}</span>
            <span><b>{row.email}{isYou ? " (you)" : ""}</b><small>{row.status === "active" ? `Joined ${new Date(row.joined_at ?? row.created_at).toLocaleDateString()}` : "Invite pending"}</small></span>
            <div className="member-row-actions">
              {row.status === "invited" && row.invite_token ? <button type="button" onClick={() => void copyInvite(row.invite_token!)}><Copy size={12} /> Copy link</button> : null}
              {manage && row.role !== "owner" ? (
                <select className="member-role-select" value={row.role} disabled={busy} onChange={event => void changeRole(row.id, event.target.value as Role)}>
                  <option value="admin">Admin</option>
                  <option value="member">Member</option>
                </select>
              ) : <em>{row.role === "owner" ? "Owner" : row.role === "admin" ? "Admin" : "Member"}</em>}
              {row.role !== "owner" && (manage || isYou) ? <button type="button" className="danger" disabled={busy} onClick={() => void removeMember(row)}>{busy ? <LoaderCircle size={12} /> : <Trash2 size={12} />}</button> : null}
            </div>
          </div>;
        })}
        {manage ? <button className="setting-outline" onClick={() => { setShowInvite(true); setInviteError(""); }}><Plus size={14} /> Invite member</button> : null}
      </div>
      <div id="permissions">
        <h2>Agent permissions</h2>
        <p>Choose which actions KODO can complete without asking.</p>
        {permissions ? PERMISSION_ROWS.map(row => (
          <div className="permission-row" key={row.key}>
            <span><b>{row.label}</b><small>{row.hint}</small></span>
            <label className="switch">
              <input type="checkbox" checked={permissions[row.key]} disabled={!manage || permissionBusy === row.key} onChange={() => togglePermission(row.key)} />
              <i />
            </label>
          </div>
        )) : null}
      </div>
      <div id="workspaces">
        <h2>Workspaces</h2>
        <p>Switch between workspaces you belong to.</p>
        {workspaces.map(item => (
          <div className="member-row" key={item.id}>
            <span className="user-avatar">{item.name[0]?.toUpperCase()}</span>
            <span><b>{item.name}</b><small>kodo.diy/{item.slug} · {item.role}</small></span>
            {item.current ? <em><CheckCircle2 size={12} /> Current</em> : <button type="button" className="setting-outline" disabled={switchingId === item.id} onClick={() => void switchWorkspace(item.id)}>{switchingId === item.id ? "Switching..." : "Switch"}</button>}
          </div>
        ))}
      </div>
    </section>
    {showInvite ? <div className="manager-modal">
      <button className="manager-scrim" onClick={() => setShowInvite(false)} aria-label="Close" />
      <form onSubmit={invite}>
        <button type="button" className="manager-close" onClick={() => setShowInvite(false)}><X size={17} /></button>
        <span className="manager-icon"><Plus size={19} /></span>
        <h2>Invite a member</h2>
        <p>They&rsquo;ll get a link to accept once you share it &mdash; email delivery isn&rsquo;t wired up yet.</p>
        <label>Email<input name="email" type="email" placeholder="teammate@company.com" required autoFocus /></label>
        <label>Role<select name="role" defaultValue="member"><option value="member">Member</option><option value="admin">Admin</option></select></label>
        {inviteError ? <p className="workspace-composer-error" role="alert"><CircleAlert size={12} /> {inviteError}</p> : null}
        <button className="manager-submit" disabled={inviteBusy}>{inviteBusy ? "Sending..." : "Create invite"}</button>
      </form>
    </div> : null}
  </div>;
}
