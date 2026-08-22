import { redirect } from "next/navigation";
import { all } from "../../../lib/db";
import { isKodoAdmin } from "../../../lib/admin-auth";
import { AGENT_RUN_RESERVATION_CREDITS, agentModelLabel, estimateAgentCostUsd } from "../../../lib/agent-models";
import { agentSpendAlert, dailyAgentCreditLimit } from "../../../lib/agent-spend";
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

type BuilderSummaryRow = { total_generations: number; completed_generations: number; failed_generations: number; total_deployments: number };
type GenerationRow = { id: string; project_id: string; project_name: string; prompt: string; status: string; model: string; credits_used: number; created_at: string };
type DeploymentRow = { id: string; project_id: string; project_name: string; environment: string; status: string; url: string | null; created_at: string };
type ModelUsageRow = { model: string; total_generations: number; completed_generations: number; input_tokens: number; output_tokens: number; credits_used: number };
type WorkspaceSpendRow = { id: string; owner_email: string; name: string; plan: string; credits_24h: number | string; runs_24h: number | string };

function formatDate(value: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) return value;
  return new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Kolkata" }).format(date);
}

function formatUsd(value: number | null) {
  if (value === null) return "—";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: value < 1 ? 4 : 2, maximumFractionDigits: value < 1 ? 4 : 2 }).format(value);
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
  const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
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
  const [workspaces, summary, billingEvents, adjustments, builderSummary, generations, deployments, modelUsage, workspaceSpend] = await Promise.all([
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
    auth.db.prepare(`SELECT
      COUNT(*) AS total_generations,
      SUM(CASE WHEN status = 'complete' THEN 1 ELSE 0 END) AS completed_generations,
      SUM(CASE WHEN status = 'error' THEN 1 ELSE 0 END) AS failed_generations,
      (SELECT COUNT(*) FROM deployments) AS total_deployments
      FROM generations`).first<BuilderSummaryRow>(),
    all<GenerationRow>(auth.db.prepare(`SELECT g.id, g.project_id, p.name AS project_name, g.prompt, g.status, g.model, g.credits_used, g.created_at
      FROM generations g JOIN projects p ON p.id = g.project_id ORDER BY g.created_at DESC LIMIT 30`)),
    all<DeploymentRow>(auth.db.prepare(`SELECT d.id, d.project_id, p.name AS project_name, d.environment, d.status, d.url, d.created_at
      FROM deployments d JOIN projects p ON p.id = d.project_id ORDER BY d.created_at DESC LIMIT 30`)),
    all<ModelUsageRow>(auth.db.prepare(`SELECT
      model,
      COUNT(*) AS total_generations,
      SUM(CASE WHEN status = 'complete' THEN 1 ELSE 0 END) AS completed_generations,
      COALESCE(SUM(input_tokens), 0) AS input_tokens,
      COALESCE(SUM(output_tokens), 0) AS output_tokens,
      COALESCE(SUM(credits_used), 0) AS credits_used
      FROM generations
      GROUP BY model
      ORDER BY credits_used DESC`)),
    all<WorkspaceSpendRow>(auth.db.prepare(`SELECT
      w.id,
      w.owner_email,
      w.name,
      w.plan,
      COALESCE(SUM(CASE
        WHEN g.created_at > ? AND g.status = 'running' THEN ${AGENT_RUN_RESERVATION_CREDITS}
        WHEN g.created_at > ? AND g.status = 'complete' THEN g.credits_used
        ELSE 0
      END), 0) AS credits_24h,
      COALESCE(SUM(CASE WHEN g.created_at > ? AND g.status IN ('running', 'complete') THEN 1 ELSE 0 END), 0) AS runs_24h
      FROM workspaces w
      LEFT JOIN generations g ON g.workspace_id = w.id
      GROUP BY w.id, w.owner_email, w.name, w.plan
      ORDER BY credits_24h DESC
      LIMIT 20`).bind(since24h, since24h, since24h)),
  ]);

  const activeSpendRows = workspaceSpend.filter(row => Number(row.credits_24h ?? 0) > 0);

  return (
    <ProductShell active="admin" title="Billing admin" context="Operations">
      <div className="admin-dashboard">
        <section className="admin-overview" aria-label="Billing overview">
          <article><span>Total workspaces</span><strong>{Number(summary?.total_workspaces ?? 0).toLocaleString("en-IN")}</strong></article>
          <article><span>Pro workspaces</span><strong>{Number(summary?.pro_workspaces ?? 0).toLocaleString("en-IN")}</strong></article>
          <article><span>Credits in circulation</span><strong>{Number(summary?.total_credits ?? 0).toLocaleString("en-IN")}</strong></article>
          <article><span>Recent billing events</span><strong>{billingEvents.length.toLocaleString("en-IN")}</strong></article>
        </section>

        <section className="admin-overview builder-overview" aria-label="Builder operations overview">
          <article><span>Agent generations</span><strong>{Number(builderSummary?.total_generations ?? 0).toLocaleString("en-IN")}</strong></article>
          <article><span>Completed builds</span><strong>{Number(builderSummary?.completed_generations ?? 0).toLocaleString("en-IN")}</strong></article>
          <article><span>Failed builds</span><strong>{Number(builderSummary?.failed_generations ?? 0).toLocaleString("en-IN")}</strong></article>
          <article><span>Deployments</span><strong>{Number(builderSummary?.total_deployments ?? 0).toLocaleString("en-IN")}</strong></article>
        </section>

        <section className="admin-panel">
          <header><div><span>AI spend guardrails</span><h2>Workspace usage · rolling 24 hours</h2></div><small>Watch at 50%, high at 80%, blocked at 100% of the plan limit. Running agents count as a 20-credit reservation.</small></header>
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead><tr><th>Workspace</th><th>Plan</th><th>Runs</th><th>Credits / limit</th><th>Guardrail</th></tr></thead>
              <tbody>
                {activeSpendRows.map(row => {
                  const used = Number(row.credits_24h ?? 0);
                  const limit = dailyAgentCreditLimit(row.plan);
                  const alert = agentSpendAlert(used, limit);
                  return <tr key={row.id}>
                    <td><b>{row.name}</b><small>{row.owner_email}</small></td>
                    <td><strong>{row.plan}</strong></td>
                    <td><strong>{Number(row.runs_24h ?? 0).toLocaleString("en-IN")}</strong></td>
                    <td><strong>{used.toLocaleString("en-IN")} / {limit.toLocaleString("en-IN")}</strong><small>{Math.max(0, limit - used).toLocaleString("en-IN")} remaining</small></td>
                    <td><strong>{alert.percent}%</strong><small>{alert.level}</small></td>
                  </tr>;
                })}
                {!activeSpendRows.length && <tr><td colSpan={5} className="admin-empty">No AI credit spend in the last 24 hours.</td></tr>}
              </tbody>
            </table>
          </div>
        </section>

        <section className="admin-panel">
          <header><div><span>AI economics</span><h2>Usage by model</h2></div><small>Gateway-cost estimate uses the verified model catalog snapshot; KODO credits include platform and build overhead.</small></header>
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead><tr><th>Model</th><th>Runs</th><th>Tokens</th><th>Credits used</th><th>Gateway cost estimate</th></tr></thead>
              <tbody>
                {modelUsage.map(row => {
                  const inputTokens = Number(row.input_tokens ?? 0);
                  const outputTokens = Number(row.output_tokens ?? 0);
                  return <tr key={row.model}>
                    <td><b>{agentModelLabel(row.model)}</b><small>{row.model}</small></td>
                    <td><strong>{Number(row.total_generations).toLocaleString("en-IN")}</strong><small>{Number(row.completed_generations).toLocaleString("en-IN")} completed</small></td>
                    <td><strong>{(inputTokens + outputTokens).toLocaleString("en-IN")}</strong><small>{inputTokens.toLocaleString("en-IN")} in · {outputTokens.toLocaleString("en-IN")} out</small></td>
                    <td><strong>{Number(row.credits_used ?? 0).toLocaleString("en-IN")}</strong></td>
                    <td><strong>{formatUsd(estimateAgentCostUsd(row.model, inputTokens, outputTokens))}</strong></td>
                  </tr>;
                })}
                {!modelUsage.length && <tr><td colSpan={5} className="admin-empty">No model usage recorded yet.</td></tr>}
              </tbody>
            </table>
          </div>
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

        <div className="admin-columns">
          <section className="admin-panel">
            <header><div><span>Builder operations</span><h2>Recent agent generations</h2></div></header>
            <div className="admin-feed">
              {generations.map(generation => <article key={generation.id}><span className={`admin-event-dot ${generation.status}`} /><div><b>{generation.prompt}</b><small>{generation.project_name} · {generation.model} · {generation.credits_used} credits</small></div><time>{formatDate(generation.created_at)}<small>{generation.status}</small></time></article>)}
              {!generations.length && <p className="admin-empty">No agent generations recorded yet.</p>}
            </div>
          </section>
          <section className="admin-panel">
            <header><div><span>Release operations</span><h2>Recent deployments</h2></div></header>
            <div className="admin-feed">
              {deployments.map(deployment => <article key={deployment.id}><span className={`admin-event-dot ${deployment.status}`} /><div><b>{deployment.project_name}</b><small>{deployment.environment} · {deployment.project_id}</small></div><time>{formatDate(deployment.created_at)}{deployment.url ? <a href={deployment.url} target="_blank" rel="noreferrer">Open</a> : <small>{deployment.status}</small>}</time></article>)}
              {!deployments.length && <p className="admin-empty">No deployments recorded yet.</p>}
            </div>
          </section>
        </div>
      </div>
    </ProductShell>
  );
}
