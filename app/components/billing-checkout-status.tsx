"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AlertCircle, CheckCircle2, LoaderCircle, RefreshCw } from "lucide-react";

type BillingStatus = {
  active: boolean;
  credits: number;
};

async function fetchBillingStatus() {
  const response = await fetch("/api/billing/status", { cache: "no-store" });
  if (!response.ok) throw new Error("Unable to confirm billing status");
  return response.json() as Promise<BillingStatus>;
}

export function BillingCheckoutStatus({ isPro }: { isPro: boolean }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const returnedFromCheckout = searchParams.get("checkout") === "success";
  const [delayed, setDelayed] = useState(false);
  const [confirmedByStatus, setConfirmedByStatus] = useState(false);
  const [credits, setCredits] = useState<number | null>(null);
  const confirmed = isPro || confirmedByStatus;

  useEffect(() => {
    if (!returnedFromCheckout) return;
    if (confirmed) {
      const cleanup = window.setTimeout(() => router.replace("/billing"), 4000);
      return () => window.clearTimeout(cleanup);
    }

    let attempts = 0;
    let cancelled = false;
    const checkStatus = async () => {
      attempts += 1;
      try {
        const status = await fetchBillingStatus();
        if (cancelled) return;
        if (status.active) {
          setCredits(status.credits);
          setConfirmedByStatus(true);
          router.refresh();
          return;
        }
      } catch {
        // A transient request failure should not interrupt the confirmation window.
      }
      if (!cancelled && attempts >= 8) {
        window.clearInterval(timer);
        setDelayed(true);
      }
    };
    const timer = window.setInterval(() => void checkStatus(), 2500);
    void checkStatus();
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [confirmed, returnedFromCheckout, router]);

  async function refreshStatus() {
    setDelayed(false);
    try {
      const status = await fetchBillingStatus();
      if (status.active) {
        setCredits(status.credits);
        setConfirmedByStatus(true);
        router.refresh();
        return;
      }
    } catch {
      // Keep the manual retry available when the status request fails.
    }
    setDelayed(true);
  }

  if (!returnedFromCheckout) return null;
  return (
    <div className={`checkout-status ${confirmed ? "confirmed" : delayed ? "delayed" : "confirming"}`} role="status">
      {confirmed ? <CheckCircle2 size={17} /> : delayed ? <AlertCircle size={17} /> : <LoaderCircle size={17} />}
      <span>
        <b>{confirmed ? "KODO Pro is active" : delayed ? "Confirmation is taking longer than usual" : "Payment received — confirming subscription"}</b>
        <small>{confirmed ? credits === null ? "Your plan and billing controls are ready." : `Your plan is active with ${credits.toLocaleString()} credits remaining.` : delayed ? "Your payment is safe. Refresh once, or contact support if Pro is still unavailable." : "This page will update automatically when the signed webhook arrives."}</small>
      </span>
      {delayed && <div className="checkout-status-actions"><button type="button" onClick={() => void refreshStatus()}><RefreshCw size={12} /> Check again</button><a href="mailto:hello@kodo.diy?subject=KODO%20Pro%20payment%20confirmation">Contact support</a></div>}
    </div>
  );
}
