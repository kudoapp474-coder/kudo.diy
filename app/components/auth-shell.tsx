import type { ReactNode } from "react";
import { ArrowLeft, Check } from "lucide-react";
import { BrandLogo } from "./brand-logo";

export function AuthShell({ mode, children }: { mode: "login" | "signup"; children: ReactNode }) {
  const signup = mode === "signup";
  return <main className="auth-page">
    <a className="auth-logo" href="/"><BrandLogo /></a>
    <section className="auth-card"><a className="auth-back" href="/"><ArrowLeft size={14} /> Back to KODO</a><div className="auth-title"><h1>{signup ? "Create your workspace" : "Welcome back"}</h1><p>{signup ? "Start building with your AI coding agent." : "Sign in to continue building."}</p></div><button className="github-auth"><span>◈</span> Continue with GitHub</button><button className="google-auth"><span>G</span> Continue with Google</button><div className="auth-divider"><i /><span>or continue with email</span><i /></div>{children}<p className="auth-switch">{signup ? "Already have an account?" : "New to KODO?"} <a href={signup ? "/login" : "/signup"}>{signup ? "Sign in" : "Create an account"}</a></p></section>
    <aside className="auth-proof"><div><p>BUILD WITH CONFIDENCE</p><h2>One workspace from first prompt to production.</h2><ul><li><Check size={15} /> Plan and build complete features</li><li><Check size={15} /> Review every code change</li><li><Check size={15} /> Preview before you publish</li></ul></div><span>© 2026 KODO.DIY</span></aside>
  </main>;
}
