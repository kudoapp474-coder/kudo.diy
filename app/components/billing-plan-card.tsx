import { requireApiUser } from "../../lib/server-auth";
import { CheckoutButton } from "./checkout-button";
import { BillingPortalButton } from "./billing-portal-button";
import { BillingCheckoutStatus } from "./billing-checkout-status";
import { hasProAccess, normalizedSubscriptionStatus, requiresBillingPortal } from "../../lib/billing-lifecycle";

type WorkspaceBilling = {
  plan: string;
  credits: number;
};

type SubscriptionBilling = {
  subscription_id: string;
  status: string;
  next_billing_date: string | null;
  cancel_at_next_billing_date: number;
};

export async function BillingPlanCard() {
  const auth = await requireApiUser();
  const billing = auth
    ? await auth.db.prepare("SELECT plan, credits FROM workspaces WHERE id = ?").bind(auth.workspaceId).first<WorkspaceBilling>()
    : null;
  const subscription = auth
    ? await auth.db.prepare("SELECT subscription_id, status, next_billing_date, cancel_at_next_billing_date FROM billing_subscriptions WHERE workspace_id = ?").bind(auth.workspaceId).first<SubscriptionBilling>()
    : null;
  const subscriptionStatus = normalizedSubscriptionStatus(subscription?.status);
  const isPro = hasProAccess(billing?.plan, subscriptionStatus);
  const plan = isPro ? "Pro" : "Free";
  const credits = Number(billing?.credits ?? 500);
  const includedCredits = plan === "Pro" ? 5000 : 500;
  const usagePercent = Math.min(100, Math.max(0, (credits / includedCredits) * 100));
  const lowCredits = credits <= 100;
  const needsPaymentRecovery = subscriptionStatus === "on_hold";
  const paused = subscriptionStatus === "paused";
  const canManageSubscription = isPro || requiresBillingPortal(subscriptionStatus);
  const planDescription = needsPaymentRecovery
    ? "Renewal payment needs attention. Update your payment method to restore Pro."
    : paused
      ? "Your Pro subscription is paused. Resume it from the billing portal."
      : subscription?.cancel_at_next_billing_date && isPro
        ? "Your Pro access remains active until the end of the paid period."
        : isPro
          ? "Your KODO Pro subscription is active."
          : "Upgrade with Dodo Payments when you are ready.";

  return (
    <section className="current-plan">
      <BillingCheckoutStatus isPro={isPro} />
      <header>
        <div>
          <span>CURRENT PLAN</span>
          <h2>{plan}</h2>
          <p>{planDescription}</p>
        </div>
        <strong>{plan === "Pro" ? "₹299" : "₹0"}<small>/month</small></strong>
      </header>
      <div className="usage-meter">
        <div><span>Remaining agent credits</span><b>{credits.toLocaleString("en-IN")} of {includedCredits.toLocaleString("en-IN")}</b></div>
        <i><b style={{ width: `${usagePercent}%` }} /></i>
        <p className={lowCredits ? "low-credit-copy" : ""}>{lowCredits ? "Low balance — at least 20 credits are required to start an agent run." : "Subscription and credit changes are synchronized by signed Dodo webhooks."}</p>
      </div>
      {subscription && <div className="subscription-facts">
        <div><span>Subscription status</span><b>{subscription.cancel_at_next_billing_date ? "Cancels after current period" : subscription.status.replaceAll("_", " ")}</b></div>
        <div><span>{subscription.cancel_at_next_billing_date ? "Access until" : "Next renewal"}</span><b>{subscription.next_billing_date ? new Date(subscription.next_billing_date).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "Managed by Dodo"}</b></div>
        <div><span>Reference</span><b>{subscription.subscription_id.slice(0, 8)}…</b></div>
      </div>}
      <footer>
        {canManageSubscription ? <BillingPortalButton /> : <CheckoutButton label={subscription ? "Restart Pro" : "Upgrade to Pro"} />}
        <a className="billing-integrations-link" href="/integrations">Billing setup</a>
      </footer>
    </section>
  );
}
