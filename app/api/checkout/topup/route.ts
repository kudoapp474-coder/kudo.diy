import { CREDIT_PACKS, isCreditPackId } from "../../../../lib/credit-packs";
import { requireApiUser, unauthorized } from "../../../../lib/server-auth";

export async function POST(request: Request) {
  const auth = await requireApiUser();
  if (!auth) return unauthorized();

  const body = await request.json().catch(() => ({})) as { pack?: string };
  if (!body.pack || !isCreditPackId(body.pack)) return Response.json({ error: "Choose a valid credit pack." }, { status: 400 });
  const pack = CREDIT_PACKS[body.pack];

  const apiKey = process.env.DODO_PAYMENTS_API_KEY;
  const productId = process.env[pack.envKey];
  if (!apiKey || !productId) return Response.json({ error: "Credit top-ups are not connected yet.", code: "SETUP_REQUIRED", connectUrl: "/integrations" }, { status: 503 });

  const environment = process.env.DODO_PAYMENTS_ENVIRONMENT === "live_mode" ? "live_mode" : "test_mode";
  const baseUrl = environment === "live_mode" ? "https://live.dodopayments.com" : "https://test.dodopayments.com";
  const origin = new URL(request.url).origin;

  const response = await fetch(`${baseUrl}/checkouts`, {
    method: "POST",
    headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
    body: JSON.stringify({
      product_cart: [{ product_id: productId, quantity: 1 }],
      return_url: `${origin}/billing?topup=success`,
      cancel_url: `${origin}/billing?topup=cancelled`,
      metadata: { workspace_id: auth.workspaceId, customer_email: auth.user.email, kind: "credit_topup", pack: pack.id },
      show_saved_payment_methods: true,
    }),
  });
  const session = await response.json() as { checkout_url?: string | null; message?: string; error?: { message?: string } };
  if (!response.ok || !session.checkout_url) return Response.json({ error: session.error?.message ?? session.message ?? "Unable to start checkout." }, { status: 502 });
  return Response.json({ url: session.checkout_url, environment });
}
