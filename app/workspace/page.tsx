import { ArrowRight, CheckCircle2, GitBranch, GitPullRequest, ShieldCheck, Terminal, WandSparkles, Zap } from "lucide-react";
import { all } from "../../lib/db";
import { requireApiUser } from "../../lib/server-auth";
import { ProductShell } from "../components/product-shell";
import { WorkspaceComposer } from "../components/workspace-composer";

type Activity = { id: string; project_id: string; project_name: string; prompt: string; status: string; branch: string; created_at: string };

function relativeTime(value: string) {
  const minutes = Math.max(0, Math.floor((Date.now() - new Date(value).valueOf()) / 60_000));
  if (minutes < 1) return "Now";
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

export default async function WorkspacePage() {
  const auth = await requireApiUser();
  const activity = auth ? await all<Activity>(auth.db.prepare(`
    SELECT g.id, g.project_id, p.name AS project_name, g.prompt, g.status, p.branch, g.created_at
    FROM generations g JOIN projects p ON p.id = g.project_id
    WHERE g.workspace_id = ? ORDER BY g.created_at DESC LIMIT 6
  `).bind(auth.workspaceId)) : [];
  return <ProductShell active="home" title="What should we build?" context="KODO AGENTS" actions={<div className="system-ready"><i /> Systems ready</div>}><p className="workspace-lede">Describe the result. KODO will create the project, build real files, verify them and show the live preview.</p><WorkspaceComposer/><div className="workspace-actions"><a href="#build"><WandSparkles size={16}/><span><b>Build a website</b><small>Turn one prompt into a working project</small></span><ArrowRight size={14}/></a><a href="/projects"><Zap size={16}/><span><b>Edit a project</b><small>Open a project and ask KODO for changes</small></span><ArrowRight size={14}/></a><a href="/agents"><GitPullRequest size={16}/><span><b>Review changes</b><small>Inspect generations, versions and checks</small></span><ArrowRight size={14}/></a></div><section className="workspace-recent"><header><h2>Recent agents</h2><a href="/agents">View all <ArrowRight size={13}/></a></header><div>{activity.map(item=>{const label=item.status==="complete"?"Done":item.status==="error"?"Failed":"Working";return <a href={`/project/${item.project_id}`} key={item.id}><span className={`recent-status ${label.toLowerCase()}`}>{label==="Working"?<i/>:<CheckCircle2 size={14}/>}</span><span><b>{item.prompt}</b><small><GitBranch size={11}/>{item.project_name} · {item.branch}</small></span><em>{label}</em><time>{relativeTime(item.created_at)}</time><ArrowRight size={14}/></a>})}{!activity.length?<div className="workspace-empty-activity"><WandSparkles size={18}/><span><b>Your first real agent run will appear here</b><small>Describe a website above to begin.</small></span></div>:null}</div></section><div className="workspace-info"><article><Terminal size={17}/><div><h3>Real files and preview</h3><p>Every agent change is saved, previewed in isolation and kept in version history.</p></div></article><article><ShieldCheck size={17}/><div><h3>Verified before publishing</h3><p>KODO runs the production build in Vercel Sandbox before a project goes live.</p></div></article></div></ProductShell>;
}
