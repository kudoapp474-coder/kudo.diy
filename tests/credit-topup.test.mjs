import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("wires an instant credit top-up flow separate from the Pro subscription", async () => {
  const packs = await readFile(new URL("../lib/credit-packs.ts", import.meta.url), "utf8");
  const checkoutRoute = await readFile(new URL("../app/api/checkout/topup/route.ts", import.meta.url), "utf8");
  const webhookRoute = await readFile(new URL("../app/api/webhooks/dodo/route.ts", import.meta.url), "utf8");
  const picker = await readFile(new URL("../app/components/credit-topup-picker.tsx", import.meta.url), "utf8");

  assert.match(packs, /small:.*credits: 1000/s);
  assert.match(packs, /medium:.*credits: 5000/s);
  assert.match(packs, /large:.*credits: 20000/s);

  // A top-up checkout must never be blocked by an existing Pro subscription,
  // unlike the /api/checkout subscription route.
  assert.doesNotMatch(checkoutRoute, /ALREADY_SUBSCRIBED/);
  assert.match(checkoutRoute, /kind: "credit_topup"/);

  // The webhook must add credits (not clobber the balance) and derive the
  // amount from our own trusted pack table, not a raw number from the payload.
  assert.match(webhookRoute, /event\.type === "payment\.succeeded" && event\.data\?\.metadata\?\.kind === "credit_topup"/);
  assert.match(webhookRoute, /credits = credits \+ \? WHERE id = \?/);
  assert.match(webhookRoute, /isCreditPackId\(packId\)/);

  // The redirect to the hosted checkout must happen from an effect, not
  // directly inside the click handler (required by this repo's lint rules).
  assert.match(picker, /useEffect\(\(\) => \{\s*if \(!checkoutUrl\) return;\s*window\.location\.href = checkoutUrl;/);
});
