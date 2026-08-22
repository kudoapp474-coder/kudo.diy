import { all } from "../../lib/db";
import { requireApiUser } from "../../lib/server-auth";
import { agentModelLabel, estimateAgentCostUsd } from "../../lib/agent-models";
import { agentSpendAlert, workspaceAgentSpendWindow } from "../../lib/agent-spend";

type ModelSpendRow = {
  model: string;
  runs: number;
  credits_used: number;
  input_tokens: number;
  output_tokens: number;
};

export async function BillingSpendCenter() {
  const auth = await requireApiUser();
  if (!auth) return null;

  const workspace = await auth.db.prepare("SELECT plan FROM workspaces WHERE id = ?").bind(auth.workspaceId).first<{ plan: string }>();
  const plan = workspace?.plan ?? "free";
  const spend = await workspaceAgentSpendWindow(auth.db, auth.workspaceId, plan);
  const alert = agentSpendAlert(spend.used, spend.limit);

  const modelSpend = await all<ModelSpendRow>(auth.db.prepare(`
    SELECT model,
      COUNT(*) AS runs,
      COALESCE(SUM(credits_used), 0) AS credits_used,
      COALESCE(SUM(input_tokens), 0) AS input_tokens,
      COALESCE(SUM(output_tokens), 0) AS output_tokens
    FROM generations
    WHERE workspace_id = ? AND created_at > ? AND status = 'complete'
    GROUP BY model
    ORDER BY credits_used DESC
  `).bind(auth.workspaceId, spend.since));

  const percent = Math.min(100, alert.percent);

  return (
    <section className="spend-center">
      <header>
        <div><span>ROLLING 24 HOURS</span><h2>AI usage & budget</h2><p>Running agents reserve {20} credits until they finish. Limits reset continuously on a rolling 24-hour window, not at midnight.</p></div>
        <span className={`spend-alert-badge ${alert.level}`}>{alert.level === "blocked" ? "Limit reached" : alert.level === "high" ? "Near limit" : alert.level === "watch" ? "Watch" : "Normal"}</span>
      </header>
      <div className="spend-meter">
        <div className="spend-meter-numbers"><b>{spend.used.toLocaleString("en-IN")}</b><span> / {spend.limit.toLocaleString("en-IN")} credits used</span></div>
        <i className={`spend-meter-track ${alert.level}`}><b style={{ width: `${percent}%` }} /></i>
        <p>{Math.max(0, spend.limit - spend.used).toLocaleString("en-IN")} credits remaining in this window · {plan === "pro" ? "Pro" : "Free"} plan limit</p>
      </div>
      <div className="spend-model-table">
        <div className="spend-model-head"><span>Model</span><span>Runs</span><span>Tokens</span><span>Credits</span><span>Est. cost</span></div>
        {modelSpend.map(row => {
          const inputTokens = Number(row.input_tokens ?? 0);
          const outputTokens = Number(row.output_tokens ?? 0);
          return <div className="spend-model-row" key={row.model}>
            <span>{agentModelLabel(row.model)}</span>
            <span>{Number(row.runs).toLocaleString("en-IN")}</span>
            <span>{(inputTokens + outputTokens).toLocaleString("en-IN")}</span>
            <span>{Number(row.credits_used).toLocaleString("en-IN")}</span>
            <span>${estimateAgentCostUsd(row.model, inputTokens, outputTokens).toFixed(4)}</span>
          </div>;
        })}
        {!modelSpend.length ? <p className="spend-model-empty">No agent runs completed in the last 24 hours.</p> : null}
      </div>
      <footer><span>Watch at 50%</span><span>High at 80%</span><span>Blocked at 100%</span></footer>
    </section>
  );
}
