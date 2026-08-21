"use client";
import { useState } from "react";
import { ArrowRight } from "lucide-react";

export function CheckoutButton({ label = "Upgrade to Pro" }: { label?: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function checkout() {
    setBusy(true);
    setError("");
    const response = await fetch("/api/checkout", { method: "POST" });
    const data = await response.json() as { url?: string; error?: string; connectUrl?: string };

    if (response.ok && data.url) {
      window.location.href = data.url;
    } else {
      setError(data.error ?? "Checkout unavailable.");
      setBusy(false);
    }
  }

  return (
    <div className="checkout-action">
      <button onClick={checkout} disabled={busy}>
        {busy ? "Opening checkout..." : label}
        <ArrowRight size={14} />
      </button>
      {error && <p>{error} <a href="/integrations">Open integrations</a></p>}
    </div>
  );
}
