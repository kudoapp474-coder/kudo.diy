"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Info, X } from "lucide-react";

export function CheckoutCancelledStatus() {
  const router = useRouter();
  const searchParams = useSearchParams();
  if (searchParams.get("checkout") !== "cancelled") return null;

  return (
    <div className="checkout-cancelled" role="status">
      <Info size={16} />
      <span><b>Checkout cancelled — no payment was taken</b><small>You can review the plans and restart checkout whenever you are ready.</small></span>
      <button type="button" aria-label="Dismiss checkout message" onClick={() => router.replace("/pricing")}><X size={14} /></button>
    </div>
  );
}
