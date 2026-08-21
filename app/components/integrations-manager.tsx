"use client";

import { useEffect, useState } from "react";
import { Check, Cpu, Github, KeyRound, RefreshCw, ShieldCheck, Sparkles, WalletCards } from "lucide-react";

type Integration = { id: string; name: string; configured: boolean; status: string; model?: string; account?: string | null };

const icons = { ai: Sparkles, github: Github, sandbox: Cpu, dodo: WalletCards };

export function IntegrationsManager() {
  const [items, setItems] = useState<Integration[]>([]);
  const [loading, setLoading] = useState(true);
  async function load() { setLoading(true); const response=await fetch("/api/integrations/status"); const data=await response.json() as { integrations?: Integration[] }; setItems(data.integrations??[]); setLoading(false); }
  useEffect(()=>{void load()},[]);
  return <div className="integration-manager"><div className="integration-summary"><ShieldCheck size={17}/><span><b>Secrets stay server-side</b><small>Keys are never exposed to the browser or saved in project files.</small></span><button onClick={load}><RefreshCw size={14}/>{loading?"Checking...":"Refresh"}</button></div><div className="integration-grid">{items.map(item=>{const Icon=icons[item.id as keyof typeof icons]??KeyRound;return <article key={item.id}><header><span><Icon size={18}/></span><em className={item.configured||item.status==="connected"?"ready":"required"}>{item.configured||item.status==="connected"?<><Check size={11}/> Ready</>:"Setup required"}</em></header><h2>{item.name}</h2><p>{item.id==="ai"?`Production coding model · ${item.model}`:item.id==="github"?"Repositories, branches, commits and pull requests":item.id==="sandbox"?"Isolated builds, tests and browser verification":"Hosted subscription checkout, renewals and invoices"}</p>{item.account&&<small>{item.account}</small>}{item.id==="github"?<a href="/api/github/connect">{item.status==="connected"?"Reconnect":"Connect GitHub"}</a>:<button disabled={item.configured}>{item.configured?"Connected":"Admin key required"}</button>}<footer>{item.id==="ai"?"AI_GATEWAY_API_KEY":item.id==="github"?"GITHUB_APP_ID · PRIVATE_KEY":item.id==="sandbox"?"SANDBOX_API_URL · TOKEN":"DODO_PAYMENTS_API_KEY · PRODUCT_ID · WEBHOOK_KEY"}</footer></article>})}</div><section className="integration-flow"><h2>Production flow</h2>{[["1","User authenticates with ChatGPT"],["2","KODO saves the project in the workspace database"],["3","AI plans and edits versioned project files"],["4","Sandbox builds and tests the result"],["5","GitHub and publishing actions require approval"],["6","Dodo renewals refill workspace credits"]].map(([step,label])=><div key={step}><span>{step}</span><p>{label}</p></div>)}</section></div>
}
