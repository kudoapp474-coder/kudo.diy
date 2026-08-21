"use client";
import { useState } from "react";
import { ArrowRight } from "lucide-react";

export function CheckoutButton({ label = "Upgrade to Pro" }: { label?: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [recovery, setRecovery] = useState<{ href: string; label: string } | null>(null);

  async function checkout() {
    setBusy(true);
    setError("");
    setRecovery(null);
    const response = await fetch("/api/checkout", { method: "POST" });
    const data = await response.json() as { url?: string; error?: string; code?: string; connectUrl?: string; manageUrl?: string };

    if (response.ok && data.url) {
      window.location.href = data.url;
    } else {
      setError(data.error ?? "Checkout unavailable.");
      if (data.code === "ALREADY_SUBSCRIBED") setRecovery({ href: data.manageUrl ?? "/billing", label: "Manage billing" });
      else if (data.code === "UNAUTHORIZED") setRecovery({ href: "/login", label: "Sign in" });
      else setRecovery({ href: data.connectUrl ?? "/integrations", label: "Open integrations" });
      setBusy(false);
    }
  }

  return (
    <div className="checkout-action">
      <button onClick={checkout} disabled={busy}>
        {busy ? "Opening checkout..." : label}
        <ArrowRight size={14} />
      </button>
      {error && <p>{error} {recovery && <a href={recovery.href}>{recovery.label}</a>}</p>}
    </div>
  );
}
