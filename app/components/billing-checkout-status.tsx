"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AlertCircle, CheckCircle2, LoaderCircle, RefreshCw } from "lucide-react";

export function BillingCheckoutStatus({ isPro }: { isPro: boolean }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const returnedFromCheckout = searchParams.get("checkout") === "success";
  const [delayed, setDelayed] = useState(false);

  useEffect(() => {
    if (!returnedFromCheckout) return;
    if (isPro) {
      const cleanup = window.setTimeout(() => router.replace("/billing"), 4000);
      return () => window.clearTimeout(cleanup);
    }

    let attempts = 0;
    const timer = window.setInterval(() => {
      attempts += 1;
      router.refresh();
      if (attempts >= 8) {
        window.clearInterval(timer);
        setDelayed(true);
      }
    }, 2500);
    return () => window.clearInterval(timer);
  }, [isPro, returnedFromCheckout, router]);

  if (!returnedFromCheckout) return null;
  const confirmed = isPro;
  return (
    <div className={`checkout-status ${confirmed ? "confirmed" : delayed ? "delayed" : "confirming"}`} role="status">
      {confirmed ? <CheckCircle2 size={17} /> : delayed ? <AlertCircle size={17} /> : <LoaderCircle size={17} />}
      <span>
        <b>{confirmed ? "KODO Pro is active" : delayed ? "Confirmation is taking longer than usual" : "Payment received — confirming subscription"}</b>
        <small>{confirmed ? "Your plan and billing controls are ready." : delayed ? "Your payment is safe. Refresh once, or contact support if Pro is still unavailable." : "This page will update automatically when the signed webhook arrives."}</small>
      </span>
      {delayed && <div className="checkout-status-actions"><button type="button" onClick={() => { setDelayed(false); router.refresh(); }}><RefreshCw size={12} /> Refresh</button><a href="mailto:hello@kodo.diy?subject=KODO%20Pro%20payment%20confirmation">Contact support</a></div>}
    </div>
  );
}
