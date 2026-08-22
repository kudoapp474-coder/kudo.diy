import { all, ensureDatabase, now } from "../../../../lib/db";
import { runAutomation } from "../../../../lib/automation-runner";

type WorkflowRunPayload = {
  action?: string;
  repository?: { full_name?: string };
  workflow_run?: { conclusion?: string | null };
};

type PullRequestPayload = {
  action?: string;
  repository?: { full_name?: string };
  pull_request?: { merged?: boolean };
};

type MatchedAutomation = { id: string; workspace_id: string; project_id: string; prompt: string; owner_email: string };

function hexToBytes(hex: string) {
  const bytes = new Uint8Array(hex.length / 2);
  for (let index = 0; index < bytes.length; index++) bytes[index] = parseInt(hex.slice(index * 2, index * 2 + 2), 16);
  return bytes;
}

function safeEqual(a: Uint8Array, b: Uint8Array) {
  if (a.length !== b.length) return false;
  let value = 0;
  for (let index = 0; index < a.length; index++) value |= a[index] ^ b[index];
  return value === 0;
}

async function verifySignature(body: string, header: string, secret: string) {
  if (!header.startsWith("sha256=")) return false;
  const provided = header.slice("sha256=".length);
  if (!/^[0-9a-f]+$/i.test(provided) || provided.length % 2 !== 0) return false;
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const digest = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body)));
  return safeEqual(digest, hexToBytes(provided));
}

export const maxDuration = 300;

export async function POST(request: Request) {
  const secret = process.env.GITHUB_APP_WEBHOOK_SECRET;
  if (!secret) return Response.json({ error: "GitHub automation webhook is not configured." }, { status: 503 });

  const body = await request.text();
  const signature = request.headers.get("x-hub-signature-256") ?? "";
  const deliveryId = request.headers.get("x-github-delivery") ?? "";
  const event = request.headers.get("x-github-event") ?? "";
  let verified = false;
  try {
    verified = await verifySignature(body, signature, secret);
  } catch {
    verified = false;
  }
  if (!verified) return Response.json({ error: "Invalid GitHub webhook signature." }, { status: 401 });

  const db = await ensureDatabase();
  if (deliveryId) {
    const claimed = await db.prepare("INSERT OR IGNORE INTO billing_events (event_id, provider, event_type, workspace_id, payload_json, processed_at) VALUES (?, 'github_automation', ?, NULL, ?, ?)")
      .bind(deliveryId, event, body.slice(0, 8000), now()).run();
    if ((claimed.meta?.changes ?? 0) === 0) return Response.json({ received: true, duplicate: true });
  }

  let repository: string | undefined;
  let triggerType: "ci_failure" | "pull_request_merged" | null = null;

  if (event === "workflow_run") {
    const payload = JSON.parse(body) as WorkflowRunPayload;
    repository = payload.repository?.full_name;
    if (payload.action === "completed" && payload.workflow_run?.conclusion === "failure") triggerType = "ci_failure";
  } else if (event === "pull_request") {
    const payload = JSON.parse(body) as PullRequestPayload;
    repository = payload.repository?.full_name;
    if (payload.action === "closed" && payload.pull_request?.merged) triggerType = "pull_request_merged";
  }

  if (!repository || !triggerType) return Response.json({ received: true, ignored: true });

  const matches = await all<MatchedAutomation>(db.prepare(`
    SELECT a.id, a.workspace_id, a.project_id, a.prompt, w.owner_email
    FROM automations a
    JOIN projects p ON p.id = a.project_id
    JOIN workspaces w ON w.id = a.workspace_id
    WHERE p.repository = ? AND a.trigger_type = ? AND a.active = 1
  `).bind(repository, triggerType));

  for (const automation of matches) {
    await runAutomation({
      db,
      automationId: automation.id,
      workspaceId: automation.workspace_id,
      userEmail: automation.owner_email,
      projectId: automation.project_id,
      prompt: automation.prompt,
      trigger: "github",
    });
  }

  return Response.json({ received: true, triggered: matches.length });
}
