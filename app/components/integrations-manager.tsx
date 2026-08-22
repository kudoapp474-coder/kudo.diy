"use client";

import { useEffect, useState } from "react";
import { Check, CloudUpload, Cpu, Github, KeyRound, RefreshCw, ShieldCheck, Sparkles, WalletCards } from "lucide-react";

type Integration = { id: string; name: string; configured: boolean; status: string; model?: string; account?: string | null };

const icons = { ai: Sparkles, github: Github, sandbox: Cpu, vercel: CloudUpload, dodo: WalletCards };
const fallbackItems: Integration[] = [
  { id: "ai", name: "AI Gateway", configured: false, status: "unknown" },
  { id: "github", name: "GitHub", configured: false, status: "disconnected" },
  { id: "sandbox", name: "Sandbox", configured: false, status: "unknown" },
  { id: "vercel", name: "Vercel Deployments", configured: false, status: "unknown" },
  { id: "dodo", name: "Dodo Payments", configured: false, status: "unknown" },
];

async function requestIntegrations() {
  const response = await fetch("/api/integrations/status", { cache: "no-store" });
  if (!response.ok) throw new Error(`Status request failed (${response.status})`);
  const data = await response.json() as { integrations?: Integration[] };
  if (!Array.isArray(data.integrations)) throw new Error("Invalid integration status response");
  return data.integrations;
}

export function IntegrationsManager() {
  const [items, setItems] = useState<Integration[]>(fallbackItems);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function load() {
    setLoading(true);
    setError("");
    try {
      setItems(await requestIntegrations());
    } catch {
      setItems(fallbackItems);
      setError("Live status is unavailable. You can still connect GitHub below.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    let active = true;
    requestIntegrations()
      .then(integrations => { if (active) setItems(integrations); })
      .catch(() => {
        if (!active) return;
        setItems(fallbackItems);
        setError("Live status is unavailable. You can still connect GitHub below.");
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  return <div className="integration-manager"><div className="integration-summary"><ShieldCheck size={17}/><span><b>Secrets stay server-side</b><small>{error || "Keys are never exposed to the browser or saved in project files."}</small></span><button onClick={load}><RefreshCw size={14}/>{loading?"Checking...":"Refresh"}</button></div><div className="integration-grid">{items.map(item=>{const Icon=icons[item.id as keyof typeof icons]??KeyRound;const connected=item.status==="connected";const operational=item.id==="github"?connected:item.configured;const label=item.id==="github"&&item.configured&&!connected?"Credentials ready":operational?"Ready":"Setup required";const description=item.id==="ai"?`Production coding model · ${item.model??"managed by AI Gateway"}`:item.id==="github"?"Repositories, branches, commits and pull requests":item.id==="sandbox"?"Isolated builds and tests authenticated by Vercel OIDC":item.id==="vercel"?"Real preview and production URLs with live deployment status":"Hosted subscription checkout, renewals and invoices";const keyLabel=item.id==="ai"?"AI_GATEWAY_API_KEY":item.id==="github"?"GITHUB_APP_ID · PRIVATE_KEY":item.id==="sandbox"?"VERCEL_OIDC_TOKEN · @vercel/sandbox":item.id==="vercel"?"VERCEL_TOKEN · VERCEL_TEAM_ID":"DODO_PAYMENTS_API_KEY · PRODUCT_ID · WEBHOOK_KEY";return <article key={item.id}><header><span><Icon size={18}/></span><em className={operational||item.configured?"ready":"required"}>{operational?<><Check size={11}/> {label}</>:label}</em></header><h2>{item.name}</h2><p>{description}</p>{item.account&&<small>{item.account}</small>}{item.id==="github"?<a href="/api/github/connect">{connected?"Reconnect":"Connect GitHub"}</a>:<button disabled={item.configured}>{item.configured?"Connected":"Admin key required"}</button>}<footer>{keyLabel}</footer></article>})}</div><section className="integration-flow"><h2>Production flow</h2>{[["1","User authenticates with Clerk"],["2","KODO saves the project in the workspace database"],["3","AI plans and edits versioned project files"],["4","Vercel Sandbox builds and tests the result"],["5","Vercel creates the real preview or production deployment"],["6","GitHub sync saves the generated files"],["7","Dodo renewals refill workspace credits"]].map(([step,label])=><div key={step}><span>{step}</span><p>{label}</p></div>)}</section></div>
}
