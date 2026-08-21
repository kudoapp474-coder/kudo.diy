import { ensureDatabase } from "../../../lib/db";

export async function GET() {
  let database = false;
  try {
    const db = await ensureDatabase();
    database = Boolean(await db.prepare("SELECT 1 AS ok").first());
  } catch {
    database = false;
  }

  return Response.json({
    status: "ok",
    service: "kodo.diy",
    checks: {
      database,
      objectStorage: Boolean(process.env.BLOB_READ_WRITE_TOKEN),
      authentication: Boolean(process.env.CLERK_SECRET_KEY && process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY),
      aiGateway: Boolean(process.env.AI_GATEWAY_API_KEY || process.env.VERCEL_OIDC_TOKEN),
      githubApp: Boolean(process.env.GITHUB_APP_ID && process.env.GITHUB_APP_PRIVATE_KEY && process.env.GITHUB_APP_SLUG),
      sandbox: Boolean(process.env.SANDBOX_API_URL && process.env.SANDBOX_API_TOKEN),
      billing: Boolean(process.env.DODO_PAYMENTS_API_KEY && process.env.DODO_PAYMENTS_PRODUCT_ID && process.env.DODO_PAYMENTS_WEBHOOK_KEY),
    },
    timestamp: new Date().toISOString(),
  });
}
