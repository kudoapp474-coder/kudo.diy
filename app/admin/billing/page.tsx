import { redirect } from "next/navigation";
import { all } from "../../../lib/db";
import { isKodoAdmin } from "../../../lib/admin-auth";
import { requireApiUser } from "../../../lib/server-auth";
import { AdminCreditAdjustment } from "../../components/admin-credit-adjustment";
import { ProductShell } from "../../components/product-shell";

type WorkspaceRow = {
  id: string;
  owner_email: string;
  name: string;
  plan: string;
  credits: number;
  created_at: string;
  subscription_status: string | null;
  next_billing_date: string | null;
  cancel_at_next_billing_date: number | null;
};

type SummaryRow = {
  total_workspaces: number;
  pro_workspaces: number;
  total_credits: number;
};

type BillingEventRow = {
  event_id: string;
  provider: string;
  event_type: string;
  workspace_id: string | null;
  processed_at: string;
};

type AdjustmentRow = {
  id: string;
  workspace_id: string;
  admin_email: string;
  delta: number;
  reason: string;
  previous_balance: number;
  new_balance: number;
  status: string;
  created_at: string;
};

function formatDate(value: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) return value;
  return new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Kolkata" }).format(date);
}

function statusLabel(row: WorkspaceRow) {
  if (row.subscription_status) return row.subscription_status.replaceAll("_", " ");
  return row.plan === "pro" ? "active" : "free";
}

export default async function AdminBillingPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const auth = await requireApiUser();
  if (!auth) redirect("/login");
  if (!isKodoAdmin(auth.user.email)) redirect("/workspace");

  const query = (await searchParams).q?.trim().slice(0, 120) ?? "";
  const like = `%${query.toLowerCase()}%`;
  const workspaceSql = `
    SELECT
      w.id,
      w.owner_email,
      w.name,
      w.plan,
      w.credits,
      w.created_at,
      s.status AS subscription_status,
      s.next_billing_date,
      s.cancel_at_next_billing_date
    FROM workspaces w
    LEFT JOIN billing_subscriptions s ON s.workspace_id = w.id
    ${query ? "WHERE LOWER(w.owner_email) LIKE ? OR LOWER(w.name) LIKE ? OR LOWER(w.id) LIKE ?" : ""}
    ORDER BY w.created_at DESC
    LIMIT 50
  `;

  const workspaceStatement = auth.db.prepare(workspaceSql);
  const [workspaces, summary, billingEvents, adjustments] = await Promise.all([
    all<WorkspaceRow>(query ? workspaceStatement.bind(like, like, like) : workspaceStatement),
    auth.db.prepare(`
      SELECT
        COUNT(*) AS total_workspaces,
        SUM(CASE WHEN w.plan = 'pro' OR s.status IN ('active', 'renewed') THEN 1 ELSE 0 END) AS pro_workspaces,
        COALESCE(SUM(w.credits), 0) AS total_credits
      FROM workspaces w
      LEFT JOIN billing_subscriptions s ON s.workspace_id = w.id
    `).first<SummaryRow>(),
    all<BillingEventRow>(auth.db.prepare(
      "SELECT event_id, provider, event_type, workspace_id, processed_at FROM billing_events ORDER BY processed_at DESC LIMIT 30",
    )),
    all<AdjustmentRow>(auth.db.prepare(
      "SELECT id, workspace_id, admin_email, delta, reason, previous_balance, new_balance, status, created_at FROM credit_adjustments ORDER BY created_at DESC LIMIT 30",
    )),
  ]);

  return (
    <ProductShell active="admin" title="Billing admin" context="Operations">
      <div className="admin-dashboard">
        <section className="admin-overview" aria-label="Billing overview">
          <article><span>Total workspaces</span><strong>{Number(summary?.total_workspaces ?? 0).toLocaleString("en-IN")}</strong></article>
          <article><span>Pro workspaces</span><strong>{Number(summary?.pro_workspaces ?? 0).toLocaleString("en-IN")}</strong></article>
          <article><span>Credits in circulation</span><strong>{Number(summary?.total_credits ?? 0).toLocaleString("en-IN")}</strong></article>
          <article><span>Recent billing events</span><strong>{billingEvents.length.toLocaleString("en-IN")}</strong></article>
        </section>

        <section className="admin-panel">
          <header>
            <div><span>Support operations</span><h2>Workspaces and subscriptions</h2></div>
            <form className="admin-search">
              <input defaultValue={query} name="q" placeholder="Search email, workspace or ID" />
              <button type="submit">Search</button>
              {query && <a href="/admin/billing">Clear</a>}
            </form>
          </header>
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead><tr><th>Workspace</th><th>Plan</th><th>Credits</th><th>Renewal</th><th>Support action</th></tr></thead>
              <tbody>
                {workspaces.map(workspace => (
                  <tr key={workspace.id}>
                    <td><b>{workspace.name}</b><small>{workspace.owner_email}</small><code>{workspace.id}</code></td>
                    <td><span className={`admin-status ${statusLabel(workspace)}`}>{statusLabel(workspace)}</span>{Boolean(workspace.cancel_at_next_billing_date) && <small>Cancels next cycle</small>}</td>
                    <td><strong>{Number(workspace.credits).toLocaleString("en-IN")}</strong></td>
                    <td>{formatDate(workspace.next_billing_date)}</td>
                    <td><AdminCreditAdjustment workspaceId={workspace.id} ownerEmail={workspace.owner_email} /></td>
                  </tr>
                ))}
                {!workspaces.length && <tr><td colSpan={5} className="admin-empty">No matching workspaces found.</td></tr>}
              </tbody>
            </table>
          </div>
        </section>

        <div className="admin-columns">
          <section className="admin-panel">
            <header><div><span>Provider history</span><h2>Recent billing events</h2></div></header>
            <div className="admin-feed">
              {billingEvents.map(event => (
                <article key={event.event_id}>
                  <span className="admin-event-dot" />
                  <div><b>{event.event_type.replaceAll(".", " · ")}</b><small>{event.workspace_id ?? "Unmatched workspace"} · {event.provider}</small></div>
                  <time>{formatDate(event.processed_at)}</time>
                </article>
              ))}
              {!billingEvents.length && <p className="admin-empty">No billing events recorded yet.</p>}
            </div>
          </section>

          <section className="admin-panel">
            <header><div><span>Immutable support log</span><h2>Credit adjustments</h2></div></header>
            <div className="admin-feed">
              {adjustments.map(adjustment => (
                <article key={adjustment.id}>
                  <span className={`admin-delta ${adjustment.delta > 0 ? "positive" : "negative"}`}>{adjustment.delta > 0 ? "+" : ""}{Number(adjustment.delta).toLocaleString("en-IN")}</span>
                  <div><b>{adjustment.reason}</b><small>{adjustment.workspace_id} · {adjustment.admin_email}</small></div>
                  <time>{formatDate(adjustment.created_at)}<small>{adjustment.previous_balance.toLocaleString("en-IN")} → {adjustment.new_balance.toLocaleString("en-IN")}</small></time>
                </article>
              ))}
              {!adjustments.length && <p className="admin-empty">No manual adjustments have been made.</p>}
            </div>
          </section>
        </div>
      </div>
    </ProductShell>
  );
}
