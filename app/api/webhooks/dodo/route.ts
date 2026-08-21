import { ensureDatabase, id, now } from "../../../../lib/db";

type DodoEvent = {
  business_id?: string;
  type: string;
  timestamp?: string;
  data?: {
    metadata?: Record<string, string>;
    subscription_id?: string;
    payment_id?: string;
    payload_type?: string;
    status?: string;
  };
};

const proStatuses = new Set(["active", "unpaused"]);
const restrictedStatuses = new Set(["cancelled", "expired", "failed", "on_hold", "paused"]);

function lifecyclePlan(event: DodoEvent) {
  if (["subscription.active", "subscription.unpaused", "subscription.plan_changed"].includes(event.type)) return "pro";
  if (["subscription.cancelled", "subscription.expired", "subscription.failed", "subscription.on_hold", "subscription.paused"].includes(event.type)) return "free";
  if (event.type !== "subscription.updated") return null;
  const status = event.data?.status?.toLowerCase();
  if (status && proStatuses.has(status)) return "pro";
  if (status && restrictedStatuses.has(status)) return "free";
  return null;
}

function lifecycleMetadata(event: DodoEvent, webhookId: string) {
  return JSON.stringify({
    provider: "dodo",
    webhookId,
    subscriptionId: event.data?.subscription_id,
    eventType: event.type,
    status: event.data?.status,
  });
}

function decodeSecret(secret: string) {
  const encoded = secret.startsWith("whsec_") ? secret.slice(6) : secret;
  const binary = atob(encoded);
  return Uint8Array.from(binary, character => character.charCodeAt(0));
}

function safeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let value = 0;
  for (let index = 0; index < a.length; index++) value |= a.charCodeAt(index) ^ b.charCodeAt(index);
  return value === 0;
}

async function verifyWebhook(body: string, webhookId: string, timestamp: string, signature: string, secret: string) {
  const timestampNumber = Number(timestamp);
  if (!webhookId || !timestamp || !Number.isFinite(timestampNumber) || Math.abs(Date.now() / 1000 - timestampNumber) > 300) return false;
  const key = await crypto.subtle.importKey("raw", decodeSecret(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const digest = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${webhookId}.${timestamp}.${body}`));
  const expected = btoa(String.fromCharCode(...new Uint8Array(digest)));
  return signature.split(" ").some(candidate => {
    const [version, value] = candidate.split(",");
    return version === "v1" && Boolean(value) && safeEqual(value, expected);
  });
}

export async function POST(request: Request) {
  const secret = process.env.DODO_PAYMENTS_WEBHOOK_KEY;
  if (!secret) return Response.json({ error: "Dodo webhook is not configured." }, { status: 503 });

  const body = await request.text();
  const webhookId = request.headers.get("webhook-id") ?? "";
  const webhookTimestamp = request.headers.get("webhook-timestamp") ?? "";
  const webhookSignature = request.headers.get("webhook-signature") ?? "";
  let verified = false;
  try {
    verified = await verifyWebhook(body, webhookId, webhookTimestamp, webhookSignature, secret);
  } catch {
    verified = false;
  }
  if (!verified) return Response.json({ error: "Invalid Dodo webhook signature." }, { status: 401 });

  let event: DodoEvent;
  try {
    event = JSON.parse(body) as DodoEvent;
  } catch {
    return Response.json({ error: "Invalid JSON payload." }, { status: 400 });
  }

  const workspaceId = event.data?.metadata?.workspace_id;
  const db = await ensureDatabase();
  const claimed = await db.prepare("INSERT OR IGNORE INTO billing_events (event_id, provider, event_type, workspace_id, payload_json, processed_at) VALUES (?, 'dodo', ?, ?, ?, ?)")
    .bind(webhookId, event.type, workspaceId ?? null, body, now()).run();
  if ((claimed.meta?.changes ?? 0) === 0) return Response.json({ received: true, duplicate: true });

  if (!workspaceId) return Response.json({ received: true });

  if (event.type === "subscription.active") {
    await db.batch([
      db.prepare("UPDATE workspaces SET plan = 'pro', credits = MAX(credits, 5000) WHERE id = ?").bind(workspaceId),
      db.prepare("INSERT INTO usage_events (id, workspace_id, kind, units, metadata_json, created_at) VALUES (?, ?, 'subscription_credit', 5000, ?, ?)")
        .bind(id("use"), workspaceId, lifecycleMetadata(event, webhookId), now()),
    ]);
  } else if (event.type === "subscription.renewed") {
    await db.batch([
      db.prepare("UPDATE workspaces SET plan = 'pro', credits = credits + 5000 WHERE id = ?").bind(workspaceId),
      db.prepare("INSERT INTO usage_events (id, workspace_id, kind, units, metadata_json, created_at) VALUES (?, ?, 'subscription_renewal', 5000, ?, ?)")
        .bind(id("use"), workspaceId, lifecycleMetadata(event, webhookId), now()),
    ]);
  } else if (event.type.startsWith("subscription.")) {
    const plan = lifecyclePlan(event);
    const statements = [
      db.prepare("INSERT INTO usage_events (id, workspace_id, kind, units, metadata_json, created_at) VALUES (?, ?, 'subscription_status', 0, ?, ?)")
        .bind(id("use"), workspaceId, lifecycleMetadata(event, webhookId), now()),
    ];
    if (plan) statements.unshift(db.prepare("UPDATE workspaces SET plan = ? WHERE id = ?").bind(plan, workspaceId));
    await db.batch(statements);
  }

  return Response.json({ received: true });
}
