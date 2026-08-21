import type { ReactNode } from "react";
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
  Settings,
  Sparkles,
  Workflow,
  X,
  Zap,
} from "lucide-react";
import { requireApiUser } from "../../lib/server-auth";
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

export async function ProductShell({ active, title, context, children, actions }: { active: string; title: string; context?: string; children: ReactNode; actions?: ReactNode }) {
  const auth = await requireApiUser();
  if (!auth) redirect("/login");
  const billing = auth
    ? await auth.db.prepare("SELECT name, plan, credits FROM workspaces WHERE id = ?").bind(auth.workspaceId).first<WorkspaceBilling>()
    : null;
  const workspaceName = billing?.name ?? "My Workspace";
  const plan = billing?.plan === "pro" ? "Pro" : "Free";
  const credits = Number(billing?.credits ?? 500);
  const includedCredits = plan === "Pro" ? 5000 : 500;
  const creditPercent = Math.min(100, Math.max(0, (credits / includedCredits) * 100));
  const lowCredits = credits <= 100;
  const initial = (auth?.user.displayName?.trim().charAt(0) || "U").toUpperCase();

  return (
    <main className="product-shell">
      <header className="product-topbar">
        <a className="product-logo" href="/"><BrandLogo size="compact" /></a>
        <div className="top-project"><span className="mini-avatar">{initial}</span><b>{workspaceName}</b><ChevronDown size={13} /></div>
        <button className="global-search"><Search size={15} /><span>Search projects, agents, and files</span><kbd>⌘ K</kbd></button>
        <div className="product-top-actions"><button aria-label="Notifications"><Bell size={17} /><i /></button><a href="/billing"><Zap size={14} /> {credits.toLocaleString("en-IN")} credits</a><span className="user-avatar">{initial}</span></div>
        <details className="product-mobile-menu"><summary aria-label="Open navigation"><Menu size={19} /></summary><div><div className="mobile-menu-title"><BrandLogo size="compact" /><X size={17} /></div>{navigation.map((item) => <a className={active === item.label.toLowerCase() ? "active" : ""} href={item.href} key={item.href}><item.icon size={16} />{item.label}</a>)}<a href="/settings"><Settings size={16} />Settings</a></div></details>
      </header>

      <aside className="product-sidebar">
        <a className="new-project-link" href="/project/new"><Plus size={16} /> New project <kbd>⌘ N</kbd></a>
        <nav>{navigation.map((item) => <a className={active === item.label.toLowerCase() ? "active" : ""} href={item.href} key={item.href}><item.icon size={16} /><span>{item.label}</span>{item.badge && <em>{item.badge}</em>}</a>)}</nav>
        <p className="sidebar-caption">RECENT PROJECTS</p>
        <div className="recent-project-links"><a href="/project/kodo-web"><span className="project-glyph violet"><Sparkles size={12} /></span><span><b>KODO Web</b><small>Updated now</small></span></a><a href="/project/checkout-flow"><span className="project-glyph green">C</span><span><b>Checkout Flow</b><small>8 minutes ago</small></span></a><a href="/project/api-docs"><span className="project-glyph amber">A</span><span><b>API Docs</b><small>Yesterday</small></span></a></div>
        <div className="sidebar-account"><div className={`credit-card ${active === "billing" ? "active" : ""} ${lowCredits ? "low" : ""}`}><span><Zap size={13} /> KODO {plan}</span><small>{credits.toLocaleString("en-IN")} credits remaining{lowCredits ? " · Low balance" : ""}</small><i><b style={{ width: `${creditPercent}%` }} /></i><a href="/billing">Manage plan</a></div><a className={active === "settings" ? "active" : ""} href="/settings"><Settings size={15} /> Settings</a></div>
      </aside>

      <section className="product-content">
        <header className="content-header"><div>{context && <span>{context}</span>}<h1>{title}</h1></div>{actions && <div className="content-actions">{actions}</div>}</header>
        {children}
      </section>
    </main>
  );
}
