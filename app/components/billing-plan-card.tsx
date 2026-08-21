import { requireApiUser } from "../../lib/server-auth";
import { CheckoutButton } from "./checkout-button";

type WorkspaceBilling = {
  plan: string;
  credits: number;
};

export async function BillingPlanCard() {
  const auth = await requireApiUser();
  const billing = auth
    ? await auth.db.prepare("SELECT plan, credits FROM workspaces WHERE id = ?").bind(auth.workspaceId).first<WorkspaceBilling>()
    : null;
  const plan = billing?.plan === "pro" ? "Pro" : "Free";
  const credits = Number(billing?.credits ?? 500);
  const includedCredits = plan === "Pro" ? 5000 : 500;
  const usagePercent = Math.min(100, Math.max(0, (credits / includedCredits) * 100));
  const lowCredits = credits <= 100;

  return (
    <section className="current-plan">
      <header>
        <div>
          <span>CURRENT PLAN</span>
          <h2>{plan}</h2>
          <p>{plan === "Pro" ? "Your KODO Pro subscription is active." : "Upgrade with Dodo Payments when you are ready."}</p>
        </div>
        <strong>{plan === "Pro" ? "₹299" : "₹0"}<small>/month</small></strong>
      </header>
      <div className="usage-meter">
        <div><span>Remaining agent credits</span><b>{credits.toLocaleString("en-IN")} of {includedCredits.toLocaleString("en-IN")}</b></div>
        <i><b style={{ width: `${usagePercent}%` }} /></i>
        <p className={lowCredits ? "low-credit-copy" : ""}>{lowCredits ? "Low balance — at least 20 credits are required to start an agent run." : "Subscription and credit changes are synchronized by signed Dodo webhooks."}</p>
      </div>
      <footer>
        {plan === "Pro" ? <a className="billing-integrations-link" href="/settings">Manage workspace</a> : <CheckoutButton />}
        <a className="billing-integrations-link" href="/integrations">Billing setup</a>
      </footer>
    </section>
  );
}
