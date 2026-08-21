import type { ReactNode } from "react";
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
import { BrandLogo } from "./brand-logo";

const navigation = [
  { href: "/workspace", label: "Home", icon: Home },
  { href: "/projects", label: "Projects", icon: LayoutGrid },
  { href: "/agents", label: "Agents", icon: Bot, badge: "2" },
  { href: "/automations", label: "Automations", icon: Workflow },
  { href: "/repositories", label: "Repositories", icon: FolderGit2 },
];

export function ProductShell({ active, title, context, children, actions }: { active: string; title: string; context?: string; children: ReactNode; actions?: ReactNode }) {
  return (
    <main className="product-shell">
      <header className="product-topbar">
        <a className="product-logo" href="/"><BrandLogo size="compact" /></a>
        <div className="top-project"><span className="mini-avatar">N</span><b>N&apos;s Workspace</b><ChevronDown size={13} /></div>
        <button className="global-search"><Search size={15} /><span>Search projects, agents, and files</span><kbd>⌘ K</kbd></button>
        <div className="product-top-actions"><button aria-label="Notifications"><Bell size={17} /><i /></button><a href="/billing"><Zap size={14} /> 2,840 credits</a><span className="user-avatar">N</span></div>
        <details className="product-mobile-menu"><summary aria-label="Open navigation"><Menu size={19} /></summary><div><div className="mobile-menu-title"><BrandLogo size="compact" /><X size={17} /></div>{navigation.map((item) => <a className={active === item.label.toLowerCase() ? "active" : ""} href={item.href} key={item.href}><item.icon size={16} />{item.label}</a>)}<a href="/settings"><Settings size={16} />Settings</a></div></details>
      </header>

      <aside className="product-sidebar">
        <a className="new-project-link" href="/project/new"><Plus size={16} /> New project <kbd>⌘ N</kbd></a>
        <nav>{navigation.map((item) => <a className={active === item.label.toLowerCase() ? "active" : ""} href={item.href} key={item.href}><item.icon size={16} /><span>{item.label}</span>{item.badge && <em>{item.badge}</em>}</a>)}</nav>
        <p className="sidebar-caption">RECENT PROJECTS</p>
        <div className="recent-project-links"><a href="/project/kodo-web"><span className="project-glyph violet"><Sparkles size={12} /></span><span><b>KODO Web</b><small>Updated now</small></span></a><a href="/project/checkout-flow"><span className="project-glyph green">C</span><span><b>Checkout Flow</b><small>8 minutes ago</small></span></a><a href="/project/api-docs"><span className="project-glyph amber">A</span><span><b>API Docs</b><small>Yesterday</small></span></a></div>
        <div className="sidebar-account"><div className={`credit-card ${active === "billing" ? "active" : ""}`}><span><Zap size={13} /> KODO Pro</span><small>2,840 credits remaining</small><i><b /></i><a href="/billing">Manage plan</a></div><a className={active === "settings" ? "active" : ""} href="/settings"><Settings size={15} /> Settings</a></div>
      </aside>

      <section className="product-content">
        <header className="content-header"><div>{context && <span>{context}</span>}<h1>{title}</h1></div>{actions && <div className="content-actions">{actions}</div>}</header>
        {children}
      </section>
    </main>
  );
}
