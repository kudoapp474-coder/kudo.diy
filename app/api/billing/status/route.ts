import { requireApiUser, unauthorized } from "../../../../lib/server-auth";
import { hasProAccess } from "../../../../lib/billing-lifecycle";

type BillingStatusRow = {
  plan: string | null;
  credits: number | null;
  status: string | null;
  next_billing_date: string | null;
  cancel_at_next_billing_date: number | null;
};

export async function GET() {
  const auth = await requireApiUser();
  if (!auth) return unauthorized();

  const billing = await auth.db
    .prepare(
      `SELECT w.plan, w.credits, s.status, s.next_billing_date, s.cancel_at_next_billing_date
       FROM workspaces w
       LEFT JOIN billing_subscriptions s ON s.workspace_id = w.id
       WHERE w.id = ?`,
    )
    .bind(auth.workspaceId)
    .first<BillingStatusRow>();

  const subscriptionStatus = billing?.status?.toLowerCase() ?? null;
  const active = hasProAccess(billing?.plan, subscriptionStatus);

  return Response.json(
    {
      active,
      plan: active ? "pro" : "free",
      credits: Number(billing?.credits ?? 500),
      subscriptionStatus,
      nextBillingDate: billing?.next_billing_date ?? null,
      cancelAtNextBillingDate: Boolean(billing?.cancel_at_next_billing_date),
    },
    { headers: { "cache-control": "no-store" } },
  );
}
