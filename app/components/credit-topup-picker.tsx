"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AlertCircle, CheckCircle2, LoaderCircle, Zap } from "lucide-react";
import type { CreditPack } from "../../lib/credit-packs";

async function fetchCredits() {
  const response = await fetch("/api/billing/status", { cache: "no-store" });
  if (!response.ok) throw new Error("Unable to confirm credits");
  return (await response.json() as { credits: number }).credits;
}

export function CreditTopupPicker({ packs, initialCredits }: { packs: CreditPack[]; initialCredits: number }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const returnedFromCheckout = searchParams.get("topup") === "success";
  const [busyPack, setBusyPack] = useState("");
  const [error, setError] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [delayed, setDelayed] = useState(false);
  const [credits, setCredits] = useState(initialCredits);
  const [checkoutUrl, setCheckoutUrl] = useState("");

  async function buy(pack: CreditPack) {
    if (busyPack) return;
    setBusyPack(pack.id);
    setError("");
    const response = await fetch("/api/checkout/topup", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ pack: pack.id }) });
    const data = await response.json() as { url?: string; error?: string };

    if (response.ok && data.url) {
      setCheckoutUrl(data.url);
    } else {
      setError(data.error ?? "Checkout unavailable.");
      setBusyPack("");
    }
  }

  useEffect(() => {
    if (!checkoutUrl) return;
    window.location.href = checkoutUrl;
  }, [checkoutUrl]);

  useEffect(() => {
    if (!returnedFromCheckout || confirmed) return;
    let attempts = 0;
    let cancelled = false;
    const check = async () => {
      attempts += 1;
      try {
        const latest = await fetchCredits();
        if (cancelled) return;
        if (latest > initialCredits) {
          setCredits(latest);
          setConfirmed(true);
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
    const timer = window.setInterval(() => void check(), 2500);
    void check();
    return () => { cancelled = true; window.clearInterval(timer); };
  }, [confirmed, initialCredits, returnedFromCheckout, router]);

  useEffect(() => {
    if (!confirmed) return;
    const cleanup = window.setTimeout(() => router.replace("/billing"), 4000);
    return () => window.clearTimeout(cleanup);
  }, [confirmed, router]);

  return <div className="topup-picker">
    {returnedFromCheckout ? <div className={`checkout-status ${confirmed ? "confirmed" : delayed ? "delayed" : "confirming"}`} role="status">
      {confirmed ? <CheckCircle2 size={17} /> : delayed ? <AlertCircle size={17} /> : <LoaderCircle size={17} />}
      <span>
        <b>{confirmed ? "Credits added" : delayed ? "Confirmation is taking longer than usual" : "Payment received — confirming credits"}</b>
        <small>{confirmed ? `Your balance is now ${credits.toLocaleString("en-IN")} credits.` : delayed ? "Your payment is safe. Refresh once, or contact support if credits are still missing." : "This will update automatically when the signed webhook arrives."}</small>
      </span>
    </div> : null}
    <div className="topup-packs">
      {packs.map(pack => (
        <button key={pack.id} className="topup-pack" disabled={Boolean(busyPack)} onClick={() => void buy(pack)}>
          <Zap size={14} />
          <b>{pack.credits.toLocaleString("en-IN")} credits</b>
          <small>{pack.label}</small>
          <em>{busyPack === pack.id ? "Opening..." : pack.price}</em>
        </button>
      ))}
    </div>
    {error ? <p className="workspace-composer-error" role="alert">{error}</p> : null}
  </div>;
}
