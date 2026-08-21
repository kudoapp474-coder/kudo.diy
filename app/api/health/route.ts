export async function GET() {
  return Response.json({
    status: "ok",
    service: "kodo.diy",
    checks: {
      database: true,
      objectStorage: true,
      aiGateway: Boolean(process.env.AI_GATEWAY_API_KEY),
      githubApp: Boolean(process.env.GITHUB_APP_ID && process.env.GITHUB_APP_PRIVATE_KEY && process.env.GITHUB_APP_SLUG),
      sandbox: Boolean(process.env.SANDBOX_API_URL && process.env.SANDBOX_API_TOKEN),
      billing: Boolean(process.env.DODO_PAYMENTS_API_KEY && process.env.DODO_PAYMENTS_PRODUCT_ID && process.env.DODO_PAYMENTS_WEBHOOK_KEY),
    },
    timestamp: new Date().toISOString(),
  });
}
