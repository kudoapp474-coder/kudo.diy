import {
  Activity,
  ArrowRight,
  Bot,
  Check,
  CheckCircle2,
  Clock3,
  Code2,
  FileCode2,
  FolderGit2,
  GitBranch,
  GitPullRequest,
  Globe,
  KeyRound,
  MoreHorizontal,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
  Sparkles,
  Terminal,
  Users,
  Webhook,
  Workflow,
  Zap,
} from "lucide-react";
import { ProductShell } from "./product-shell";
import { BillingPlanCard } from "./billing-plan-card";

const agents = [
  { name: "Build onboarding flow", repo: "kodo/web", branch: "feat/onboarding", status: "Working", time: "6m", icon: Sparkles },
  { name: "Fix mobile navigation", repo: "kodo/web", branch: "fix/mobile-nav", status: "Ready for review", time: "14m", icon: GitPullRequest },
  { name: "Add rate limits", repo: "kodo/api", branch: "feat/rate-limits", status: "Working", time: "22m", icon: Sparkles },
  { name: "Implement usage alerts", repo: "kodo/dashboard", branch: "feat/usage-alerts", status: "Done", time: "Yesterday", icon: CheckCircle2 },
  { name: "Polish empty states", repo: "kodo/web", branch: "ui/empty-states", status: "Ready for review", time: "Yesterday", icon: GitPullRequest },
];

export function AgentsView() {
  return <ProductShell active="agents" title="Agents" context="WORK IN PROGRESS" actions={<a className="header-primary" href="/project/new"><Plus size={15} /> New agent</a>}><div className="segmented-filter"><button className="active">All <span>5</span></button><button>Working <span>2</span></button><button>Ready for review <span>2</span></button><button>Done <span>1</span></button></div><div className="agent-table"><div className="table-head"><span>Task</span><span>Repository</span><span>Status</span><span>Updated</span></div>{agents.map((agent) => <a href="/project/kodo-web" className="agent-row" key={agent.name}><span className={`row-icon ${agent.status.toLowerCase().replaceAll(" ", "-")}`}><agent.icon size={15} /></span><span className="row-main"><b>{agent.name}</b><small><GitBranch size={11} /> {agent.branch}</small></span><span className="row-repo">{agent.repo}</span><span className={`row-status ${agent.status.toLowerCase().replaceAll(" ", "-")}`}>{agent.status === "Working" && <i />}{agent.status}</span><time>{agent.time}</time><ArrowRight size={14} /></a>)}</div></ProductShell>;
}

const automations = [
  { title: "Fix CI failures on main", desc: "Investigate failures, repair the cause, and open a pull request.", trigger: "GitHub Actions fails", ran: "3h ago", icon: Zap },
  { title: "Weekly security review", desc: "Review dependencies and high-risk code changes every Friday.", trigger: "Fridays at 5:00 PM", ran: "4d ago", icon: ShieldCheck },
  { title: "Keep documentation current", desc: "Update API docs whenever public routes change.", trigger: "Pull request merged", ran: "Yesterday", icon: FileCode2 },
];

export function AutomationsView() {
  return <ProductShell active="automations" title="Automations" context="ALWAYS-ON WORK" actions={<button className="header-primary"><Plus size={15} /> New automation</button>}><div className="automation-cards">{automations.map((automation) => <article key={automation.title}><header><span><automation.icon size={17} /></span><button><MoreHorizontal size={16} /></button></header><h2>{automation.title}</h2><p>{automation.desc}</p><div className="automation-trigger"><Workflow size={13} /><span><small>TRIGGER</small>{automation.trigger}</span></div><footer><span><i /> Active</span><time>Ran {automation.ran}</time></footer></article>)}<button className="create-automation"><Plus size={21} /><b>Build an automation</b><span>Describe the workflow in plain language</span></button></div></ProductShell>;
}

const repos = [
  { name: "kodo/web", language: "TypeScript", branch: "main", updated: "2 min ago", status: "Ready", color: "#5b8def" },
  { name: "kodo/api", language: "TypeScript", branch: "main", updated: "18 min ago", status: "Ready", color: "#5b8def" },
  { name: "kodo/dashboard", language: "React", branch: "production", updated: "Yesterday", status: "Indexing", color: "#4da67c" },
  { name: "kodo/docs", language: "MDX", branch: "main", updated: "2 days ago", status: "Ready", color: "#b78b52" },
];

export function RepositoriesView() {
  return <ProductShell active="repositories" title="Repositories" context="PROJECT CONTEXT" actions={<button className="header-primary"><Plus size={15} /> Connect repository</button>}><div className="repo-summary"><article><FolderGit2 size={17} /><span><b>4 repositories</b><small>Connected to this workspace</small></span></article><article><RefreshCw size={17} /><span><b>Indexing automatically</b><small>Last sync 2 minutes ago</small></span></article><article><ShieldCheck size={17} /><span><b>Private by default</b><small>Scoped GitHub permissions</small></span></article></div><div className="repo-list"><div className="repo-list-head"><span>Repository</span><span>Language</span><span>Default branch</span><span>Last indexed</span><span>Status</span></div>{repos.map((repo) => <button key={repo.name}><span className="repo-name"><i><FolderGit2 size={16} /></i><b>{repo.name}</b></span><span><i className="language-dot" style={{background:repo.color}} />{repo.language}</span><span><GitBranch size={12} />{repo.branch}</span><span>{repo.updated}</span><span className={repo.status.toLowerCase()}>{repo.status === "Ready" && <Check size={12} />}{repo.status === "Indexing" && <i />}{repo.status}</span><MoreHorizontal size={15} /></button>)}</div></ProductShell>;
}

export function SettingsView() {
  return <ProductShell active="settings" title="Settings" context="WORKSPACE"><div className="settings-layout"><nav><a className="active" href="#general">General</a><a href="#members">Members</a><a href="#permissions">Agent permissions</a><a href="/integrations">Integrations</a><a href="/launch">Launch readiness</a></nav><section className="settings-sections"><div id="general"><h2>General</h2><p>Manage your workspace identity and default behavior.</p><label>Workspace name<input defaultValue="N's Workspace" /></label><label>Workspace slug<div className="input-prefix"><span>kodo.diy/</span><input defaultValue="n-workspace" /></div></label><button className="setting-save">Save changes</button></div><div id="members"><h2>Members</h2><p>Invite people and manage their workspace access.</p><div className="member-row"><span className="user-avatar">N</span><span><b>You</b><small>Authenticated with ChatGPT</small></span><em>Owner</em></div><button className="setting-outline"><Users size={14} /> Invite member</button></div><div id="permissions"><h2>Agent permissions</h2><p>Choose which actions KODO can complete without asking.</p>{[["Run tests and builds","Always allowed"],["Create branches and commits","Always allowed"],["Open pull requests","Ask before action"],["Production deployments","Always ask"]].map(([name,value]) => <div className="permission-row" key={name}><span><b>{name}</b><small>{value}</small></span><label className="switch"><input type="checkbox" defaultChecked={value === "Always allowed"} /><i /></label></div>)}</div></section></div></ProductShell>;
}

export function BillingView() {
  return <ProductShell active="billing" title="Plans & billing" context="KODO CREDITS"><div className="billing-grid"><BillingPlanCard/><section className="billing-details"><h2>Billing system</h2><div><span>Checkout</span><b>Dodo Payments hosted checkout</b><button>Secure</button></div><div><span>Credits</span><b>Refilled by signed Dodo webhook</b><button>Verified</button></div><div><span>Invoices</span><b>Managed by Dodo Payments</b><button>External</button></div></section></div><section className="usage-breakdown"><header><div><h2>Usage this month</h2><p>Credits are used when KODO plans, edits, and verifies code.</p></div><select><option>August 2026</option></select></header><div className="usage-chart"><div className="chart-y"><span>200</span><span>150</span><span>100</span><span>50</span><span>0</span></div><div className="bars">{[34,52,45,77,61,84,56,91,68,73,88,48,65,82,94,71].map((height,index) => <i key={index} style={{height:`${height}%`}} />)}</div></div></section></ProductShell>;
}
