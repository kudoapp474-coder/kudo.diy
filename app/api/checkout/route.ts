import { requireApiUser, unauthorized } from "../../../lib/server-auth";

export async function POST(request: Request) {
  const auth = await requireApiUser();
  if (!auth) return unauthorized();
  const apiKey = process.env.DODO_PAYMENTS_API_KEY;
  const productId = process.env.DODO_PAYMENTS_PRODUCT_ID;
  if (!apiKey || !productId) return Response.json({ error: "Dodo Payments is not connected.", code: "SETUP_REQUIRED", connectUrl: "/integrations" }, { status: 503 });

  const environment = process.env.DODO_PAYMENTS_ENVIRONMENT === "live_mode" ? "live_mode" : "test_mode";
  const baseUrl = environment === "live_mode" ? "https://live.dodopayments.com" : "https://test.dodopayments.com";
  const origin = new URL(request.url).origin;

  const response = await fetch(`${baseUrl}/checkouts`, {
    method: "POST",
    headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
    body: JSON.stringify({
      product_cart: [{ product_id: productId, quantity: 1 }],
      return_url: `${origin}/billing?checkout=success`,
      cancel_url: `${origin}/pricing?checkout=cancelled`,
      metadata: { workspace_id: auth.workspaceId, customer_email: auth.user.email, plan: "pro" },
      show_saved_payment_methods: true,
    }),
  });
  const session = await response.json() as { checkout_url?: string | null; message?: string; error?: { message?: string } };
  if (!response.ok || !session.checkout_url) return Response.json({ error: session.error?.message ?? session.message ?? "Unable to start Dodo checkout." }, { status: 502 });
  return Response.json({ url: session.checkout_url, environment });
}
