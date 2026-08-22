"use client";

import { useEffect, useState } from "react";
import {
  Boxes, Check, CircleAlert, Clock3, Code2, Copy, Database, ExternalLink, GitBranch,
  Globe2, KeyRound, LoaderCircle, Plus, Rocket, Server, ShieldCheck, Trash2, X,
} from "lucide-react";

type Tab = "overview" | "domain" | "resources" | "database" | "secrets";
type Project = { name: string; repository: string | null; branch: string; status: string; preview_url: string | null; production_url: string | null };
type Deployment = { id: string; environment: string; status: string; url: string | null; created_at: string };
type Domain = { name: string; verified?: boolean; status: string; verification?: Array<{ type?: string; domain?: string; value?: string; reason?: string }> };
type Secret = { id: string; key: string; maskedValue: string; targets: string[]; gitBranch: string | null; status: string; updatedAt: string };
type DatabaseConnection = { provider: string; envKey: string; maskedValue: string; targets: string[]; status: string; updatedAt: string };
type Resource = { id: string; name: string; kind: string; status: string; detail: string | null };
type AuditEvent = { id: string; action: string; resource_type: string; resource_id: string | null; created_at: string };
type PublishingData = {
  project: Project;
  overview: { deploymentCount: number; readyDeployments: number; secretCount: number; domainCount: number; databaseConnected: boolean };
  deployments: Deployment[];
  domains: Domain[];
  domainError: string | null;
  secrets: Secret[];
  database: DatabaseConnection | null;
  resources: Resource[];
  audit: AuditEvent[];
  capabilities: { vercel: boolean; encryption: boolean };
};

const tabs: Array<{ id: Tab; label: string; icon: typeof Rocket }> = [
  { id: "overview", label: "Overview", icon: Rocket },
  { id: "domain", label: "Domain", icon: Globe2 },
  { id: "resources", label: "Resources", icon: Boxes },
  { id: "database", label: "Database", icon: Database },
  { id: "secrets", label: "Secrets", icon: KeyRound },
];

const providerLabels: Record<string, string> = { neon: "Neon Postgres", supabase: "Supabase Postgres", mongodb: "MongoDB Atlas", upstash: "Upstash Redis", turso: "Turso" };

export function PublishingManager({ projectId, publishing, onPublish, onClose }: { projectId: string; publishing: boolean; onPublish: (target: "preview" | "production") => Promise<void>; onClose: () => void }) {
  const [tab, setTab] = useState<Tab>("overview");
  const [data, setData] = useState<PublishingData | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [domain, setDomain] = useState("");
  const [secretKey, setSecretKey] = useState("");
  const [secretValue, setSecretValue] = useState("");
  const [secretTargets, setSecretTargets] = useState<string[]>(["preview", "production"]);
  const [secretBranch, setSecretBranch] = useState("");
  const [databaseProvider, setDatabaseProvider] = useState("neon");
  const [databaseValue, setDatabaseValue] = useState("");
  const [databaseTargets, setDatabaseTargets] = useState<string[]>(["preview", "production"]);

  async function load() {
    setLoading(true);
    try {
      const response = await fetch(`/api/projects/${encodeURIComponent(projectId)}/publishing`, { cache: "no-store" });
      const result = await response.json() as PublishingData & { error?: string };
      if (!response.ok) throw new Error(result.error ?? "Could not load publishing settings.");
      setData(result);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not load publishing settings."); }
    finally { setLoading(false); }
  }

  useEffect(() => {
    let active = true;
    fetch(`/api/projects/${encodeURIComponent(projectId)}/publishing`, { cache: "no-store" })
      .then(async response => {
        const result = await response.json() as PublishingData & { error?: string };
        if (!response.ok) throw new Error(result.error ?? "Could not load publishing settings.");
        return result;
      })
      .then(result => { if (active) setData(result); })
      .catch(reason => { if (active) setError(reason instanceof Error ? reason.message : "Could not load publishing settings."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [projectId]);

  function toggleTarget(targets: string[], setTargets: (value: string[]) => void, target: string) {
    setTargets(targets.includes(target) ? targets.filter(item => item !== target) : [...targets, target]);
  }

  async function request(method: "POST" | "DELETE", body: Record<string, unknown>, busyKey: string, success: string) {
    if (busy) return false;
    setBusy(busyKey); setError(""); setNotice("");
    try {
      const response = await fetch(`/api/projects/${encodeURIComponent(projectId)}/publishing`, { method, headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error ?? "Publishing setting could not be saved.");
      setNotice(success); await load(); return true;
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Publishing setting could not be saved."); return false; }
    finally { setBusy(""); }
  }

  async function addDomain() {
    if (!domain.trim()) return;
    if (await request("POST", { action: "add-domain", domain }, "domain", "Domain attached. Complete any DNS verification shown below.")) setDomain("");
  }

  async function saveSecret() {
    if (!secretKey.trim() || !secretValue) return;
    if (await request("POST", { action: "upsert-secret", key: secretKey, value: secretValue, targets: secretTargets, gitBranch: secretBranch }, "secret", "Secret encrypted and saved. Redeploy to apply the new runtime value.")) {
      setSecretKey(""); setSecretValue(""); setSecretBranch("");
    }
  }

  async function connectDatabase() {
    if (!databaseValue.trim()) return;
    if (await request("POST", { action: "connect-database", provider: databaseProvider, value: databaseValue, targets: databaseTargets }, "database", "Database credential encrypted and synced. Redeploy to activate it.")) setDatabaseValue("");
  }

  const project = data?.project;
  return <div className="publishing-layer" role="dialog" aria-modal="true" aria-label="Manage publishing">
    <button className="publishing-scrim" onClick={onClose} aria-label="Close publishing" />
    <section className="publishing-manager">
      <header><div><span className="publishing-logo"><Rocket size={17} /></span><div><b>Manage publishing</b><small>{project?.name ?? "Project"} · Real deployment configuration</small></div></div><button onClick={onClose} aria-label="Close"><X size={17} /></button></header>
      <nav>{tabs.map(item => { const Icon = item.icon; return <button key={item.id} className={tab === item.id ? "active" : ""} onClick={() => { setTab(item.id); setError(""); setNotice(""); }}><Icon size={14} /> {item.label}</button>; })}</nav>
      <div className="publishing-body">
        {(error || notice) ? <div className={`publishing-message ${error ? "error" : "success"}`}>{error ? <CircleAlert size={14} /> : <Check size={14} />}<span>{error || notice}</span><button onClick={() => { setError(""); setNotice(""); }}><X size={12} /></button></div> : null}
        {loading ? <div className="publishing-loading"><LoaderCircle size={22} /> Loading live publishing state…</div> : null}

        {!loading && data && tab === "overview" ? <section className="publishing-tab overview-tab">
          <div className="publishing-heading"><div><span>PROJECT DELIVERY</span><h2>Overview</h2><p>Build, preview, publish and monitor the current project from one place.</p></div><span className={`publishing-status ${project?.status ?? "draft"}`}><i /> {project?.status ?? "draft"}</span></div>
          <div className="overview-metrics"><article><Rocket size={16} /><span><b>{data.overview.readyDeployments}</b><small>Ready deployments</small></span></article><article><Globe2 size={16} /><span><b>{data.overview.domainCount}</b><small>Custom domains</small></span></article><article><KeyRound size={16} /><span><b>{data.overview.secretCount}</b><small>Encrypted secrets</small></span></article><article><Database size={16} /><span><b>{data.overview.databaseConnected ? "Ready" : "None"}</b><small>Database</small></span></article></div>
          <div className="publish-actions"><article><span><Code2 size={18} /></span><div><b>Preview deployment</b><small>Isolated URL for review before launch.</small></div><button disabled={publishing} onClick={() => void onPublish("preview")}>{publishing ? <LoaderCircle size={13} /> : <Rocket size={13} />} Deploy preview</button></article><article><span><Globe2 size={18} /></span><div><b>Production deployment</b><small>Build-validated live release. First deploy policy remains unchanged.</small></div><button className="primary" disabled={publishing} onClick={() => void onPublish("production")}>{publishing ? <LoaderCircle size={13} /> : <Rocket size={13} />} Deploy production</button></article></div>
          <div className="publishing-list"><header><b>Recent deployments</b><small>{data.deployments.length} recorded</small></header>{data.deployments.slice(0, 5).map(item => <article key={item.id}><span className={`resource-state ${item.status}`}><i /></span><div><b>{item.environment}</b><small>{new Date(item.created_at).toLocaleString()} · {item.status}</small></div>{item.url ? <a href={item.url} target="_blank" rel="noreferrer">Open <ExternalLink size={11} /></a> : null}</article>)}{!data.deployments.length ? <div className="honest-empty"><Rocket size={18} /><b>No deployments yet</b><span>Create a preview when the project is ready.</span></div> : null}</div>
        </section> : null}

        {!loading && data && tab === "domain" ? <section className="publishing-tab">
          <div className="publishing-heading"><div><span>DELIVERY</span><h2>Custom domain</h2><p>Attach a real domain to the Vercel project generated for this KODO project.</p></div></div>
          <div className="inline-form"><label><span>Domain</span><input value={domain} onChange={event => setDomain(event.target.value)} placeholder="www.example.com" /></label><button disabled={busy === "domain" || !domain.trim() || !data.capabilities.vercel} onClick={() => void addDomain()}>{busy === "domain" ? <LoaderCircle size={13} /> : <Plus size={13} />} Add domain</button></div>
          {!data.capabilities.vercel ? <div className="setup-warning"><CircleAlert size={14} /> Connect Vercel publishing before attaching domains.</div> : null}
          {data.domainError ? <div className="setup-warning"><CircleAlert size={14} /> {data.domainError}</div> : null}
          <div className="publishing-list domain-list"><header><b>Attached domains</b><small>DNS state refreshes from Vercel</small></header>{data.domains.map(item => <article key={item.name}><span className={`resource-state ${item.verified ? "connected" : "pending"}`}><Globe2 size={13} /></span><div><b>{item.name}</b><small>{item.verified ? "Verified and ready" : "DNS verification required"}</small></div><button className="danger-icon" disabled={Boolean(busy)} onClick={() => { if (window.confirm(`Remove ${item.name} from this project?`)) void request("DELETE", { action: "remove-domain", domain: item.name }, `domain-${item.name}`, "Domain removed."); }}><Trash2 size={13} /></button>{!item.verified && item.verification?.map((record, index) => <div className="dns-record" key={`${record.type}-${index}`}><span>{record.type || "DNS"}</span><code>{record.domain || item.name}</code><button onClick={() => void navigator.clipboard.writeText(record.value || "")}><Copy size={11} /> {record.value || record.reason || "View in Vercel"}</button></div>)}</article>)}{!data.domains.length ? <div className="honest-empty"><Globe2 size={18} /><b>No custom domain</b><span>Your existing Vercel URL continues to work.</span></div> : null}</div>
        </section> : null}

        {!loading && data && tab === "resources" ? <section className="publishing-tab">
          <div className="publishing-heading"><div><span>LIVE CONNECTIONS</span><h2>Resources</h2><p>Only integrations actually connected to this workspace or project are shown as connected.</p></div></div>
          <div className="resource-grid">{data.resources.map(item => <article key={item.id}><span className={`resource-icon ${item.status}`}>{item.id === "vercel" ? <Globe2 size={17} /> : item.id === "github" ? <GitBranch size={17} /> : item.id === "database" ? <Database size={17} /> : <Server size={17} />}</span><div><b>{item.name}</b><small>{item.detail || "Not connected"}</small></div><em className={item.status}><i /> {item.status}</em></article>)}</div>
          <div className="resource-note"><ShieldCheck size={15} /><span><b>No fake integrations</b><small>Marketplace databases and services appear only after a real credential or connection is saved.</small></span></div>
        </section> : null}

        {!loading && data && tab === "database" ? <section className="publishing-tab">
          <div className="publishing-heading"><div><span>DATA</span><h2>Database</h2><p>Store one primary database credential encrypted on the server and scope it per deployment environment.</p></div></div>
          {data.database ? <div className="connected-database"><span><Database size={19} /></span><div><b>{providerLabels[data.database.provider] || data.database.provider}</b><small>{data.database.envKey} · {data.database.maskedValue} · {data.database.targets.join(", ")}</small></div><em className={data.database.status}><i /> {data.database.status}</em><button disabled={Boolean(busy)} onClick={() => { if (window.confirm("Disconnect this database and remove its Vercel environment variable?")) void request("DELETE", { action: "disconnect-database" }, "database-delete", "Database disconnected."); }}><Trash2 size={13} /> Disconnect</button></div> : <div className="honest-empty database-empty"><Database size={19} /><b>No database connected</b><span>Add a real provider connection below. KODO does not create sample data.</span></div>}
          <div className="credential-form"><label><span>Provider</span><select value={databaseProvider} onChange={event => setDatabaseProvider(event.target.value)}>{Object.entries(providerLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><label><span>Connection URL</span><input type="password" autoComplete="new-password" value={databaseValue} onChange={event => setDatabaseValue(event.target.value)} placeholder="Paste provider connection URL" /></label><fieldset><legend>Environments</legend>{["development", "preview", "production"].map(target => <label key={target}><input type="checkbox" checked={databaseTargets.includes(target)} onChange={() => toggleTarget(databaseTargets, setDatabaseTargets, target)} /> {target}</label>)}</fieldset><button className="save-credential" disabled={Boolean(busy) || !databaseValue.trim() || !databaseTargets.length || !data.capabilities.encryption} onClick={() => void connectDatabase()}>{busy === "database" ? <LoaderCircle size={13} /> : <ShieldCheck size={13} />} {data.database ? "Replace connection" : "Connect database"}</button></div>
          {!data.capabilities.encryption ? <div className="setup-warning"><CircleAlert size={14} /> KODO server encryption must be configured before saving credentials.</div> : null}
        </section> : null}

        {!loading && data && tab === "secrets" ? <section className="publishing-tab">
          <div className="publishing-heading"><div><span>SECURE CONFIGURATION</span><h2>Secrets</h2><p>Values are encrypted server-side, masked here, and never returned to the browser or audit history.</p></div><span className="security-badge"><ShieldCheck size={13} /> Server-only</span></div>
          <div className="credential-form secret-form"><label><span>Key</span><input value={secretKey} onChange={event => setSecretKey(event.target.value.toUpperCase())} placeholder="OPENAI_API_KEY" /></label><label><span>Secret value</span><input type="password" autoComplete="new-password" value={secretValue} onChange={event => setSecretValue(event.target.value)} placeholder="Value is never shown again" /></label><fieldset><legend>Environments</legend>{["development", "preview", "production"].map(target => <label key={target}><input type="checkbox" checked={secretTargets.includes(target)} onChange={() => toggleTarget(secretTargets, setSecretTargets, target)} /> {target}</label>)}</fieldset>{secretTargets.includes("preview") ? <label><span>Preview branch override (optional)</span><input value={secretBranch} onChange={event => setSecretBranch(event.target.value)} placeholder="staging" /></label> : null}<button className="save-credential" disabled={Boolean(busy) || !secretKey.trim() || !secretValue || !secretTargets.length || !data.capabilities.encryption} onClick={() => void saveSecret()}>{busy === "secret" ? <LoaderCircle size={13} /> : <ShieldCheck size={13} />} Encrypt and save</button></div>
          <div className="publishing-list secret-list"><header><b>Saved secrets</b><small>{data.secrets.length} encrypted</small></header>{data.secrets.map(item => <article key={item.id}><span className={`resource-state ${item.status}`}><KeyRound size={13} /></span><div><b>{item.key}</b><small>{item.maskedValue} · {item.targets.join(", ")}{item.gitBranch ? ` · ${item.gitBranch}` : ""}</small></div><em className={item.status}><i /> {item.status}</em><button className="danger-icon" disabled={Boolean(busy)} onClick={() => { if (window.confirm(`Delete ${item.key}? It will also be removed from the generated Vercel project.`)) void request("DELETE", { action: "remove-secret", id: item.id }, `secret-${item.id}`, "Secret deleted."); }}><Trash2 size={13} /></button></article>)}{!data.secrets.length ? <div className="honest-empty"><KeyRound size={18} /><b>No secrets saved</b><span>Add only credentials required by this project.</span></div> : null}</div>
        </section> : null}
      </div>
      <footer><span><Clock3 size={12} /> {data?.audit[0] ? `Last change ${new Date(data.audit[0].created_at).toLocaleString()}` : "No publishing changes recorded"}</span><span><ShieldCheck size={12} /> Audited server actions</span></footer>
    </section>
  </div>;
}
