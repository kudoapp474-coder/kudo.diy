export type CreditPackId = "small" | "medium" | "large";

export type CreditPack = { id: CreditPackId; label: string; credits: number; price: string; envKey: string };

export const CREDIT_PACKS: Record<CreditPackId, CreditPack> = {
  small: { id: "small", label: "Quick top-up", credits: 1000, price: "₹99", envKey: "DODO_TOPUP_SMALL_PRODUCT_ID" },
  medium: { id: "medium", label: "Booster pack", credits: 5000, price: "₹399", envKey: "DODO_TOPUP_MEDIUM_PRODUCT_ID" },
  large: { id: "large", label: "Power pack", credits: 20000, price: "₹1,299", envKey: "DODO_TOPUP_LARGE_PRODUCT_ID" },
};

export function isCreditPackId(value: string): value is CreditPackId {
  return value === "small" || value === "medium" || value === "large";
}
