import { all } from "../../../../lib/db";
import { requireApiUser, unauthorized } from "../../../../lib/server-auth";
import { vercelPublishingConfigured } from "../../../../lib/vercel-publish";
import { nativeSandboxConfigured } from "../../../../lib/vercel-sandbox";

export async function GET() {
  const auth = await requireApiUser();
  if (!auth) return unauthorized();
  const connections = await all<{ provider: string; status: string; account_label: string | null; updated_at: string }>(auth.db.prepare("SELECT provider, status, account_label, updated_at FROM connections WHERE workspace_id = ?").bind(auth.workspaceId));
  const saved = new Map(connections.map(connection => [connection.provider, connection]));
  return Response.json({
    integrations: [
      { id: "ai", name: "AI Gateway", configured: Boolean(process.env.AI_GATEWAY_API_KEY || process.env.VERCEL_OIDC_TOKEN), status: process.env.AI_GATEWAY_API_KEY || process.env.VERCEL_OIDC_TOKEN ? "ready" : "setup_required", model: "openai/gpt-5.6-sol" },
      { id: "github", name: "GitHub App", configured: Boolean(process.env.GITHUB_APP_SLUG && process.env.GITHUB_APP_ID && process.env.GITHUB_APP_PRIVATE_KEY), status: saved.get("github")?.status ?? "disconnected", account: saved.get("github")?.account_label ?? null },
      { id: "sandbox", name: "Vercel Sandbox", configured: nativeSandboxConfigured(), status: nativeSandboxConfigured() ? "ready" : "setup_required" },
      { id: "vercel", name: "Vercel Deployments", configured: vercelPublishingConfigured(), status: vercelPublishingConfigured() ? "ready" : "setup_required" },
      { id: "dodo", name: "Dodo Payments", configured: Boolean(process.env.DODO_PAYMENTS_API_KEY && process.env.DODO_PAYMENTS_PRODUCT_ID && process.env.DODO_PAYMENTS_WEBHOOK_KEY), status: process.env.DODO_PAYMENTS_API_KEY && process.env.DODO_PAYMENTS_PRODUCT_ID && process.env.DODO_PAYMENTS_WEBHOOK_KEY ? "ready" : "setup_required" },
    ],
  });
}
