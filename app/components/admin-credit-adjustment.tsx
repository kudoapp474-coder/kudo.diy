"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

export function AdminCreditAdjustment({ workspaceId, ownerEmail }: { workspaceId: string; ownerEmail: string }) {
  const router = useRouter();
  const [status, setStatus] = useState<{ type: "idle" | "loading" | "success" | "error"; message?: string }>({ type: "idle" });

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const delta = Number(data.get("delta"));
    const reason = String(data.get("reason") ?? "").trim();

    setStatus({ type: "loading" });
    try {
      const response = await fetch("/api/admin/credits", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          workspaceId,
          delta,
          reason,
          requestId: `adj_${crypto.randomUUID()}`,
        }),
      });
      const result = await response.json() as { error?: string; adjustment?: { new_balance?: number } };
      if (!response.ok) throw new Error(result.error ?? "Adjustment failed.");
      form.reset();
      setStatus({
        type: "success",
        message: `Balance updated to ${Number(result.adjustment?.new_balance ?? 0).toLocaleString("en-IN")} credits.`,
      });
      router.refresh();
    } catch (error) {
      setStatus({ type: "error", message: error instanceof Error ? error.message : "Adjustment failed." });
    }
  }

  return (
    <details className="admin-adjustment">
      <summary>Adjust credits</summary>
      <form onSubmit={submit}>
        <label>
          <span>Add or deduct</span>
          <input name="delta" type="number" step="1" min="-50000" max="50000" placeholder="+500 or -100" required />
        </label>
        <label>
          <span>Reason</span>
          <input name="reason" minLength={8} maxLength={280} placeholder={`Support reason for ${ownerEmail}`} required />
        </label>
        <button disabled={status.type === "loading"} type="submit">
          {status.type === "loading" ? "Saving…" : "Apply adjustment"}
        </button>
        {status.message && <p className={status.type} aria-live="polite">{status.message}</p>}
      </form>
    </details>
  );
}
