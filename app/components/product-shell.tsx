import type { ReactNode } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import {
  Bell,
  Bot,
  ChevronDown,
  FolderGit2,
  Home,
  LayoutGrid,
  Menu,
  Plus,
  Search,
  ShieldCheck,
  Settings,
  Sparkles,
  Workflow,
  X,
  Zap,
} from "lucide-react";
import { isKodoAdmin } from "../../lib/admin-auth";
import { requireApiUser } from "../../lib/server-auth";
import { AccountMenu } from "./account-menu";
import { BrandLogo } from "./brand-logo";

const navigation = [
  { href: "/workspace", label: "Home", icon: Home },
  { href: "/projects", label: "Projects", icon: LayoutGrid },
  { href: "/agents", label: "Agents", icon: Bot, badge: "2" },
  { href: "/automations", label: "Automations", icon: Workflow },
  { href: "/repositories", label: "Repositories", icon: FolderGit2 },
];

type WorkspaceBilling = {
  name: string;
  plan: string;
  credits: number;
};

type RecentProject = { id: string; name: string; status: string; updated_at: string };

export async function ProductShell({ active, title, context, children, actions }: { active: string; title: string; context?: string; children: ReactNode; actions?: ReactNode }) {
  const auth = await requireApiUser();
  if (!auth) redirect("/login");
  const navigationItems = isKodoAdmin(auth.user.email)
    ? [...navigation, { href: "/admin/billing", label: "Admin", icon: ShieldCheck }]
    : navigation;
  const [billing, recentProjects] = await Promise.all([
    auth.db.prepare("SELECT name, plan, credits FROM workspaces WHERE id = ?").bind(auth.workspaceId).first<WorkspaceBilling>(),
    allRecentProjects(auth),
  ]);
  const workspaceName = billing?.name ?? "My Workspace";
  const plan = billing?.plan === "pro" ? "Pro" : "Free";
  const credits = Number(billing?.credits ?? 500);
  const includedCredits = plan === "Pro" ? 5000 : 500;
  const creditPercent = Math.min(100, Math.max(0, (credits / includedCredits) * 100));
  const lowCredits = credits <= 100;
  const initial = (auth?.user.displayName?.trim().charAt(0) || "U").toUpperCase();
  const clerkEnabled = Boolean(process.env.CLERK_SECRET_KEY && process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY);

  return (
    <main className="product-shell">
      <header className="product-topbar">
        <Link className="product-logo" href="/"><BrandLogo size="compact" /></Link>
        <div className="top-project"><span className="mini-avatar">{initial}</span><b>{workspaceName}</b><ChevronDown size={13} /></div>
        <button className="global-search"><Search size={15} /><span>Search projects, agents, and files</span><kbd>⌘ K</kbd></button>
        <div className="product-top-actions"><button aria-label="Notifications"><Bell size={17} /><i /></button><a href="/billing"><Zap size={14} /> {credits.toLocaleString("en-IN")} credits</a>{clerkEnabled ? <AccountMenu displayName={auth.user.displayName} email={auth.user.email} initial={initial} /> : <span className="user-avatar">{initial}</span>}</div>
        <details className="product-mobile-menu"><summary aria-label="Open navigation"><Menu size={19} /></summary><div><div className="mobile-menu-title"><BrandLogo size="compact" /><X size={17} /></div>{navigationItems.map((item) => <a className={active === item.label.toLowerCase() ? "active" : ""} href={item.href} key={item.href}><item.icon size={16} />{item.label}</a>)}<a href="/settings"><Settings size={16} />Settings</a></div></details>
      </header>

      <aside className="product-sidebar">
        <a className="new-project-link" href="/workspace#build"><Plus size={16} /> New project <kbd>⌘ N</kbd></a>
        <nav>{navigationItems.map((item) => <a className={active === item.label.toLowerCase() ? "active" : ""} href={item.href} key={item.href}><item.icon size={16} /><span>{item.label}</span>{item.badge && <em>{item.badge}</em>}</a>)}</nav>
        <p className="sidebar-caption">RECENT PROJECTS</p>
        <div className="recent-project-links">{recentProjects.map((project, index) => <a href={`/project/${project.id}`} key={project.id}><span className={`project-glyph ${["violet","green","amber"][index % 3]}`}><Sparkles size={12} /></span><span><b>{project.name}</b><small>{project.status} · {new Date(project.updated_at).toLocaleDateString("en-IN")}</small></span></a>)}{!recentProjects.length ? <a href="/workspace#build"><span className="project-glyph violet"><Plus size={12} /></span><span><b>Build first project</b><small>Start from one prompt</small></span></a> : null}</div>
        <div className="sidebar-account"><div className={`credit-card ${active === "billing" ? "active" : ""} ${lowCredits ? "low" : ""}`}><span><Zap size={13} /> KODO {plan}</span><small>{credits.toLocaleString("en-IN")} credits remaining{lowCredits ? " · Low balance" : ""}</small><i><b style={{ width: `${creditPercent}%` }} /></i><a href="/billing">Manage plan</a></div><a className={active === "settings" ? "active" : ""} href="/settings"><Settings size={15} /> Settings</a></div>
      </aside>

      <section className="product-content">
        <header className="content-header"><div>{context && <span>{context}</span>}<h1>{title}</h1></div>{actions && <div className="content-actions">{actions}</div>}</header>
        {children}
      </section>
    </main>
  );
}

async function allRecentProjects(auth: NonNullable<Awaited<ReturnType<typeof requireApiUser>>>) {
  const result = await auth.db.prepare("SELECT id, name, status, updated_at FROM projects WHERE workspace_id = ? ORDER BY updated_at DESC LIMIT 3").bind(auth.workspaceId).all<RecentProject>();
  return result.results ?? [];
}
