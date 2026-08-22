import {
  Plus,
  Users,
} from "lucide-react";
import { ProductShell } from "./product-shell";
import { BillingPlanCard } from "./billing-plan-card";
import { BillingSpendCenter } from "./billing-spend-center";
import { BillingUsage } from "./billing-usage";
import { RepositoriesManager } from "./repositories-manager";
import { AutomationsManager } from "./automations-manager";

export function AutomationsView() {
  return <ProductShell active="automations" title="Automations" context="ALWAYS-ON WORK"><AutomationsManager /></ProductShell>;
}

export function RepositoriesView() {
  return <ProductShell active="repositories" title="Repositories" context="PROJECT CONTEXT" actions={<a className="header-primary" href="/api/github/connect?returnTo=/repositories"><Plus size={15}/> Connect GitHub</a>}><RepositoriesManager/></ProductShell>;
}

export function SettingsView() {
  return <ProductShell active="settings" title="Settings" context="WORKSPACE"><div className="settings-layout"><nav><a className="active" href="#general">General</a><a href="#members">Members</a><a href="#permissions">Agent permissions</a><a href="/integrations">Integrations</a><a href="/launch">Launch readiness</a></nav><section className="settings-sections"><div id="general"><h2>General</h2><p>Manage your workspace identity and default behavior.</p><label>Workspace name<input defaultValue="N's Workspace" /></label><label>Workspace slug<div className="input-prefix"><span>kodo.diy/</span><input defaultValue="n-workspace" /></div></label><button className="setting-save">Save changes</button></div><div id="members"><h2>Members</h2><p>Invite people and manage their workspace access.</p><div className="member-row"><span className="user-avatar">N</span><span><b>You</b><small>Authenticated with ChatGPT</small></span><em>Owner</em></div><button className="setting-outline"><Users size={14} /> Invite member</button></div><div id="permissions"><h2>Agent permissions</h2><p>Choose which actions KODO can complete without asking.</p>{[["Run tests and builds","Always allowed"],["Create branches and commits","Always allowed"],["Open pull requests","Ask before action"],["Production deployments","Always ask"]].map(([name,value]) => <div className="permission-row" key={name}><span><b>{name}</b><small>{value}</small></span><label className="switch"><input type="checkbox" defaultChecked={value === "Always allowed"} /><i /></label></div>)}</div></section></div></ProductShell>;
}

export function BillingView() {
  return <ProductShell active="billing" title="Plans & billing" context="KODO CREDITS"><div className="billing-grid"><BillingPlanCard/><section className="billing-details"><h2>Billing system</h2><div><span>Checkout</span><b>Dodo Payments hosted checkout</b><button>Secure</button></div><div><span>Credits</span><b>Refilled by signed Dodo webhook</b><button>Verified</button></div><div><span>Invoices</span><b>Managed by Dodo Payments</b><button>External</button></div></section></div><BillingSpendCenter /><BillingUsage /></ProductShell>;
}
