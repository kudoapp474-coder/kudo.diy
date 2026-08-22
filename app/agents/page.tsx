import { ArrowRight, CheckCircle2, CircleAlert, GitBranch, Plus, Sparkles } from "lucide-react";
import { all } from "../../lib/db";
import { requireApiUser } from "../../lib/server-auth";
import { ProductShell } from "../components/product-shell";

type AgentRun = { id: string; project_id: string; project_name: string; repository: string | null; branch: string; prompt: string; status: string; credits_used: number; created_at: string };

function relativeTime(value: string) {
  const minutes = Math.max(0, Math.floor((Date.now() - new Date(value).valueOf()) / 60_000));
  if (minutes < 1) return "Now";
  if (minutes < 60) return `${minutes}m`;
  if (minutes < 1440) return `${Math.floor(minutes / 60)}h`;
  return `${Math.floor(minutes / 1440)}d`;
}

const STATUS_FOR_FILTER: Record<string, string> = { working: "running", done: "complete", failed: "error" };

export default async function AgentsPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const auth = await requireApiUser();
  const agents = auth ? await all<AgentRun>(auth.db.prepare(`
    SELECT g.id, g.project_id, p.name AS project_name, p.repository, p.branch, g.prompt, g.status, g.credits_used, g.created_at
    FROM generations g JOIN projects p ON p.id = g.project_id
    WHERE g.workspace_id = ? ORDER BY g.created_at DESC LIMIT 100
  `).bind(auth.workspaceId)) : [];
  const working = agents.filter(agent => agent.status === "running").length;
  const done = agents.filter(agent => agent.status === "complete").length;
  const failed = agents.filter(agent => agent.status === "error").length;
  const filter = (await searchParams).status ?? "all";
  const visibleAgents = filter === "all" ? agents : agents.filter(agent => agent.status === STATUS_FOR_FILTER[filter]);
  return <ProductShell active="agents" title="Agents" context="REAL RUN HISTORY" actions={<a className="header-primary" href="/workspace#build"><Plus size={15} /> New agent</a>}><div className="segmented-filter"><a className={filter === "all" ? "active" : ""} href="/agents">All <span>{agents.length}</span></a><a className={filter === "working" ? "active" : ""} href="/agents?status=working">Working <span>{working}</span></a><a className={filter === "done" ? "active" : ""} href="/agents?status=done">Done <span>{done}</span></a><a className={filter === "failed" ? "active" : ""} href="/agents?status=failed">Failed <span>{failed}</span></a></div><div className="agent-table"><div className="table-head"><span>Task</span><span>Project</span><span>Status</span><span>Updated</span></div>{visibleAgents.map(agent => {const label=agent.status==="complete"?"Done":agent.status==="error"?"Failed":"Working";const Icon=label==="Done"?CheckCircle2:label==="Failed"?CircleAlert:Sparkles;return <a href={`/project/${agent.project_id}`} className="agent-row" key={agent.id}><span className={`row-icon ${label.toLowerCase()}`}><Icon size={15} /></span><span className="row-main"><b>{agent.prompt}</b><small><GitBranch size={11} /> {agent.branch} · {agent.credits_used} credits</small></span><span className="row-repo">{agent.repository ?? agent.project_name}</span><span className={`row-status ${label.toLowerCase()}`}>{label==="Working"?<i/>:null}{label}</span><time>{relativeTime(agent.created_at)}</time><ArrowRight size={14} /></a>})}{!agents.length?<div className="agents-empty"><Sparkles size={20}/><h2>No agent runs yet</h2><p>Start with one website prompt from the workspace.</p><a href="/workspace#build">Build first project</a></div>:!visibleAgents.length?<div className="agents-empty"><Sparkles size={20}/><h2>No agents match this filter</h2><p>Try a different status.</p></div>:null}</div></ProductShell>;
}
