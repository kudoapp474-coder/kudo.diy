"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, CircleAlert, LoaderCircle } from "lucide-react";

type AcceptResult = { workspaceId?: string; workspaceName?: string; error?: string };

export function InviteAccept({ token }: { token: string }) {
  const [state, setState] = useState<"loading" | "done" | "error">("loading");
  const [message, setMessage] = useState("");
  const [workspaceName, setWorkspaceName] = useState("");

  useEffect(() => {
    let active = true;
    fetch("/api/team/accept", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ token }) })
      .then(response => (response.json() as Promise<AcceptResult>).then(data => ({ ok: response.ok, data })))
      .then(({ ok, data }) => {
        if (!active) return;
        if (!ok || !data.workspaceId) { setState("error"); setMessage(data.error ?? "Could not accept this invite."); return; }
        setState("done");
        setWorkspaceName(data.workspaceName ?? "the workspace");
      })
      .catch(() => { if (active) { setState("error"); setMessage("Could not accept this invite."); } });
    return () => { active = false; };
  }, [token]);

  if (state === "loading") return <p className="auth-status"><LoaderCircle size={14} className="spin" /> Accepting your invite...</p>;
  if (state === "error") return <p className="auth-status auth-status-error"><CircleAlert size={14} /> {message}</p>;
  return <p className="auth-status auth-status-ok"><CheckCircle2 size={14} /> You&rsquo;ve joined {workspaceName}. <a href="/workspace">Go to workspace</a></p>;
}
