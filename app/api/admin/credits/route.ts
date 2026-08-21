import { id, now } from "../../../../lib/db";
import { requireAdminApiUser } from "../../../../lib/admin-auth";

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
  completed_at: string | null;
};

function invalid(error: string) {
  return Response.json({ error, code: "INVALID_REQUEST" }, { status: 400 });
}

export async function POST(request: Request) {
  const { auth, response } = await requireAdminApiUser();
  if (!auth) return response;

  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) {
    return Response.json({ error: "Cross-origin request blocked.", code: "FORBIDDEN" }, { status: 403 });
  }

  let body: { workspaceId?: unknown; delta?: unknown; reason?: unknown; requestId?: unknown };
  try {
    body = await request.json();
  } catch {
    return invalid("A valid JSON body is required.");
  }

  const workspaceId = typeof body.workspaceId === "string" ? body.workspaceId.trim() : "";
  const delta = typeof body.delta === "number" ? body.delta : Number(body.delta);
  const reason = typeof body.reason === "string" ? body.reason.trim() : "";
  const requestId = typeof body.requestId === "string" ? body.requestId.trim() : "";

  if (!/^ws_[a-z0-9_]{1,50}$/i.test(workspaceId)) return invalid("Choose a valid workspace.");
  if (!Number.isSafeInteger(delta) || delta === 0 || Math.abs(delta) > 50_000) {
    return invalid("Credit adjustment must be a non-zero whole number between -50,000 and 50,000.");
  }
  if (reason.length < 8 || reason.length > 280) return invalid("Reason must be between 8 and 280 characters.");
  if (!/^adj_[a-z0-9_-]{8,80}$/i.test(requestId)) return invalid("A valid request ID is required.");

  const existing = await auth.db
    .prepare("SELECT id, workspace_id, admin_email, delta, reason, previous_balance, new_balance, status, created_at, completed_at FROM credit_adjustments WHERE id = ?")
    .bind(requestId)
    .first<AdjustmentRow>();
  if (existing) {
    if (existing.workspace_id !== workspaceId || Number(existing.delta) !== delta) {
      return Response.json({ error: "Request ID was already used for another adjustment.", code: "IDEMPOTENCY_CONFLICT" }, { status: 409 });
    }
    return Response.json({ adjustment: existing, duplicate: true }, { headers: { "cache-control": "no-store" } });
  }

  const workspace = await auth.db
    .prepare("SELECT credits FROM workspaces WHERE id = ?")
    .bind(workspaceId)
    .first<{ credits: number }>();
  if (!workspace) return Response.json({ error: "Workspace not found.", code: "NOT_FOUND" }, { status: 404 });

  const previousBalance = Number(workspace.credits ?? 0);
  const newBalance = previousBalance + delta;
  if (newBalance < 0) return invalid("This adjustment would make the balance negative.");

  const createdAt = now();
  const claimed = await auth.db
    .prepare("INSERT OR IGNORE INTO credit_adjustments (id, workspace_id, admin_email, delta, reason, previous_balance, new_balance, status, created_at, completed_at) VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?, NULL)")
    .bind(requestId, workspaceId, auth.user.email, delta, reason, previousBalance, newBalance, createdAt)
    .run();

  if ((claimed.meta?.changes ?? 0) === 0) {
    const duplicate = await auth.db
      .prepare("SELECT id, workspace_id, admin_email, delta, reason, previous_balance, new_balance, status, created_at, completed_at FROM credit_adjustments WHERE id = ?")
      .bind(requestId)
      .first<AdjustmentRow>();
    return Response.json({ adjustment: duplicate, duplicate: true }, { headers: { "cache-control": "no-store" } });
  }

  const updated = await auth.db
    .prepare("UPDATE workspaces SET credits = ? WHERE id = ? AND credits = ?")
    .bind(newBalance, workspaceId, previousBalance)
    .run();

  if ((updated.meta?.changes ?? 0) === 0) {
    await auth.db
      .prepare("UPDATE credit_adjustments SET status = 'conflict', completed_at = ? WHERE id = ?")
      .bind(now(), requestId)
      .run();
    return Response.json(
      { error: "Balance changed while the adjustment was being applied. Refresh and try again.", code: "BALANCE_CONFLICT" },
      { status: 409 },
    );
  }

  const completedAt = now();
  await auth.db.batch([
    auth.db
      .prepare("UPDATE credit_adjustments SET status = 'complete', completed_at = ? WHERE id = ?")
      .bind(completedAt, requestId),
    auth.db
      .prepare("INSERT INTO usage_events (id, workspace_id, kind, units, metadata_json, created_at) VALUES (?, ?, 'admin_credit_adjustment', ?, ?, ?)")
      .bind(
        id("use"),
        workspaceId,
        delta,
        JSON.stringify({
          adjustmentId: requestId,
          adminEmail: auth.user.email,
          reason,
          previousBalance,
          newBalance,
        }),
        completedAt,
      ),
  ]);

  return Response.json(
    {
      adjustment: {
        id: requestId,
        workspace_id: workspaceId,
        admin_email: auth.user.email,
        delta,
        reason,
        previous_balance: previousBalance,
        new_balance: newBalance,
        status: "complete",
        created_at: createdAt,
        completed_at: completedAt,
      },
    },
    { headers: { "cache-control": "no-store" } },
  );
}
