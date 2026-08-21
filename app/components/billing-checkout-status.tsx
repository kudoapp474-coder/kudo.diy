"use client";

import { useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { CheckCircle2, LoaderCircle } from "lucide-react";

export function BillingCheckoutStatus({ isPro }: { isPro: boolean }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const returnedFromCheckout = searchParams.get("checkout") === "success";

  useEffect(() => {
    if (!returnedFromCheckout || isPro) return;
    let attempts = 0;
    const timer = window.setInterval(() => {
      attempts += 1;
      router.refresh();
      if (attempts >= 8) window.clearInterval(timer);
    }, 2500);
    return () => window.clearInterval(timer);
  }, [isPro, returnedFromCheckout, router]);

  if (!returnedFromCheckout) return null;
  return (
    <div className={`checkout-status ${isPro ? "confirmed" : "confirming"}`} role="status">
      {isPro ? <CheckCircle2 size={17} /> : <LoaderCircle size={17} />}
      <span><b>{isPro ? "KODO Pro is active" : "Payment received — confirming subscription"}</b><small>{isPro ? "Your plan and billing controls are ready." : "This page will update automatically when the signed webhook arrives."}</small></span>
    </div>
  );
}
