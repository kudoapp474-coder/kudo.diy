import { all } from "../../lib/db";
import { requireApiUser } from "../../lib/server-auth";

type UsageRow = {
  generation_id: string | null;
  kind: string;
  units: number;
  metadata_json: string;
  created_at: string;
};

function usageLabel(kind: string) {
  if (kind === "subscription_credit") return "Pro activation credits";
  if (kind === "subscription_renewal") return "Pro renewal credits";
  return "KODO agent run";
}

function eventCredits(row: UsageRow) {
  if (row.kind !== "agent_tokens") return Number(row.units || 0);
  try {
    return Number((JSON.parse(row.metadata_json) as { creditsUsed?: number }).creditsUsed ?? 0);
  } catch {
    return 0;
  }
}

export async function BillingUsage() {
  const auth = await requireApiUser();
  const rows = auth
    ? await all<UsageRow>(auth.db.prepare("SELECT generation_id, kind, units, metadata_json, created_at FROM usage_events WHERE workspace_id = ? ORDER BY created_at DESC LIMIT 30").bind(auth.workspaceId))
    : [];
  const creditsUsed = rows
    .filter(row => row.kind === "agent_credit" || row.kind === "agent_tokens")
    .reduce((total, row) => total + eventCredits(row), 0);
  const recent = rows.slice(0, 10);

  return (
    <section className="usage-breakdown">
      <header><div><h2>Credit usage</h2><p>Every completed KODO run is metered and stored with its model and token totals.</p></div><strong>{creditsUsed.toLocaleString("en-IN")} credits used</strong></header>
      {recent.length ? <div className="usage-history">
        <div className="usage-history-head"><span>Activity</span><span>Date</span><span>Credits</span></div>
        {recent.map((row, index) => {
          const credits = eventCredits(row);
          const isCredit = row.kind.startsWith("subscription_");
          return <div className="usage-history-row" key={`${row.generation_id ?? row.kind}-${row.created_at}-${index}`}><span><b>{usageLabel(row.kind)}</b><small>{row.generation_id ?? "Dodo Payments"}</small></span><time>{new Date(row.created_at).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}</time><em className={isCredit ? "credit" : "debit"}>{isCredit ? "+" : "−"}{credits.toLocaleString("en-IN")}</em></div>;
        })}
      </div> : <div className="usage-empty"><b>No credit activity yet</b><span>Your completed agent runs and subscription refills will appear here.</span></div>}
    </section>
  );
}
