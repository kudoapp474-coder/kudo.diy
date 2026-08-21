"use client";

import { useState } from "react";
import { ExternalLink } from "lucide-react";

export function BillingPortalButton() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function openPortal() {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/billing/portal", { method: "POST" });
      const data = await response.json() as { url?: string; error?: string };
      if (!response.ok || !data.url) throw new Error(data.error ?? "Unable to open billing portal.");
      window.location.assign(data.url);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to open billing portal.");
      setLoading(false);
    }
  }

  return (
    <div className="checkout-action">
      <button type="button" onClick={openPortal} disabled={loading}>
        {loading ? "Opening…" : "Manage subscription"}<ExternalLink size={14} />
      </button>
      {error && <p role="alert">{error}</p>}
    </div>
  );
}
