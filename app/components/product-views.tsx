import {
  Plus,
} from "lucide-react";
import { ProductShell } from "./product-shell";
import { BillingPlanCard } from "./billing-plan-card";
import { BillingSpendCenter } from "./billing-spend-center";
import { BillingUsage } from "./billing-usage";
import { RepositoriesManager } from "./repositories-manager";
import { AutomationsManager } from "./automations-manager";
import { SettingsManager } from "./settings-manager";

export function AutomationsView() {
  return <ProductShell active="automations" title="Automations" context="ALWAYS-ON WORK"><AutomationsManager /></ProductShell>;
}

export function RepositoriesView() {
  return <ProductShell active="repositories" title="Repositories" context="PROJECT CONTEXT" actions={<a className="header-primary" href="/api/github/connect?returnTo=/repositories"><Plus size={15}/> Connect GitHub</a>}><RepositoriesManager/></ProductShell>;
}

export function SettingsView() {
  return <ProductShell active="settings" title="Settings" context="WORKSPACE"><SettingsManager /></ProductShell>;
}

export function BillingView() {
  return <ProductShell active="billing" title="Plans & billing" context="KODO CREDITS"><div className="billing-grid"><BillingPlanCard/><section className="billing-details"><h2>Billing system</h2><div><span>Checkout</span><b>Dodo Payments hosted checkout</b><button>Secure</button></div><div><span>Credits</span><b>Refilled by signed Dodo webhook</b><button>Verified</button></div><div><span>Invoices</span><b>Managed by Dodo Payments</b><button>External</button></div></section></div><BillingSpendCenter /><BillingUsage /></ProductShell>;
}
