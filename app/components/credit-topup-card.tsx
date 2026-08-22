import { requireApiUser } from "../../lib/server-auth";
import { CREDIT_PACKS } from "../../lib/credit-packs";
import { CreditTopupPicker } from "./credit-topup-picker";

export async function CreditTopupCard() {
  const auth = await requireApiUser();
  const workspace = auth
    ? await auth.db.prepare("SELECT credits FROM workspaces WHERE id = ?").bind(auth.workspaceId).first<{ credits: number }>()
    : null;
  const credits = Number(workspace?.credits ?? 0);

  return (
    <section className="topup-card">
      <h2>Quick recharge</h2>
      <p>Buy credits instantly — no change to your subscription.</p>
      <CreditTopupPicker packs={Object.values(CREDIT_PACKS)} initialCredits={credits} />
    </section>
  );
}
