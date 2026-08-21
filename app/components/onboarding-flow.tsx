"use client";

import { useState } from "react";
import { ArrowRight, Check, GitBranch, Sparkles, WandSparkles } from "lucide-react";
import { BrandLogo } from "./brand-logo";

export function OnboardingFlow() {
  const [step, setStep] = useState(1);
  const [name, setName] = useState("My first KODO project");
  const [goal, setGoal] = useState("Build a polished product homepage");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function finish() {
    setBusy(true); setError("");
    const response = await fetch("/api/projects", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name, description: goal }) });
    const data = await response.json() as { project?: { id: string }; error?: string };
    if (response.ok && data.project) window.location.href = `/project/${data.project.id}?task=${encodeURIComponent(goal)}`;
    else { setError(data.error ?? "Could not create the project."); setBusy(false); }
  }

  return <main className="onboarding-page"><a href="/" className="onboarding-logo"><BrandLogo /></a><div className="onboarding-progress">{[1,2,3].map(item=><span className={item<=step?"active":""} key={item}><i>{item<step?<Check size={11}/>:item}</i></span>)}</div><section className="onboarding-card">{step===1&&<><span className="onboarding-icon"><Sparkles size={20}/></span><p>STEP 1 OF 3</p><h1>Name your first project</h1><small>KODO will keep its files, agent history, and deployments together.</small><label>Project name<input value={name} onChange={event=>setName(event.target.value)} autoFocus/></label><button onClick={()=>setStep(2)} disabled={!name.trim()}>Continue <ArrowRight size={15}/></button></>}{step===2&&<><span className="onboarding-icon"><GitBranch size={20}/></span><p>STEP 2 OF 3</p><h1>Connect code</h1><small>You can connect GitHub now or begin with a blank KODO project.</small><div className="onboarding-choice"><button onClick={()=>window.location.href="/api/github/connect"}><GitBranch size={16}/><span><b>Connect GitHub</b><em>Import an existing repository</em></span><ArrowRight size={14}/></button><button onClick={()=>setStep(3)}><Sparkles size={16}/><span><b>Start blank</b><em>KODO creates the initial files</em></span><ArrowRight size={14}/></button></div><button className="text-button" onClick={()=>setStep(1)}>Back</button></>}{step===3&&<><span className="onboarding-icon"><WandSparkles size={20}/></span><p>STEP 3 OF 3</p><h1>What should KODO build?</h1><small>Describe the finished outcome. You can change everything later.</small><label>First task<textarea value={goal} onChange={event=>setGoal(event.target.value)}/></label>{error&&<div className="onboarding-error">{error}</div>}<button onClick={finish} disabled={!goal.trim()||busy}>{busy?"Creating workspace...":"Create project"}<ArrowRight size={15}/></button><button className="text-button" onClick={()=>setStep(2)}>Back</button></>}</section><footer>Secure workspace · Private by default</footer></main>
}
