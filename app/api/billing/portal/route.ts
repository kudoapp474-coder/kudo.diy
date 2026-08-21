import { requireApiUser, unauthorized } from "../../../../lib/server-auth";

type DodoCustomer = { customer_id?: string; email?: string };
type DodoCustomerList = { items?: DodoCustomer[] };
type DodoPortalSession = { link?: string; message?: string; error?: { message?: string } };

export async function POST() {
  const auth = await requireApiUser();
  if (!auth) return unauthorized();

  const apiKey = process.env.DODO_PAYMENTS_API_KEY;
  if (!apiKey) {
    return Response.json({ error: "Dodo Payments is not connected.", code: "SETUP_REQUIRED" }, { status: 503 });
  }

  const environment = process.env.DODO_PAYMENTS_ENVIRONMENT === "live_mode" ? "live_mode" : "test_mode";
  const baseUrl = environment === "live_mode" ? "https://live.dodopayments.com" : "https://test.dodopayments.com";
  const headers = { authorization: `Bearer ${apiKey}` };

  const customerResponse = await fetch(
    `${baseUrl}/customers?email=${encodeURIComponent(auth.user.email)}&page_size=1`,
    { headers, cache: "no-store" },
  );
  const customers = await customerResponse.json() as DodoCustomerList & DodoPortalSession;
  const customerId = customers.items?.find(customer => customer.email?.toLowerCase() === auth.user.email.toLowerCase())?.customer_id;

  if (!customerResponse.ok || !customerId) {
    return Response.json({ error: customers.error?.message ?? customers.message ?? "No Dodo customer was found for this workspace." }, { status: 404 });
  }

  const portalResponse = await fetch(`${baseUrl}/customers/${encodeURIComponent(customerId)}/customer-portal/session`, {
    method: "POST",
    headers,
  });
  const portal = await portalResponse.json() as DodoPortalSession;
  if (!portalResponse.ok || !portal.link) {
    return Response.json({ error: portal.error?.message ?? portal.message ?? "Unable to open the billing portal." }, { status: 502 });
  }

  return Response.json({ url: portal.link });
}
