import {
  ArrowRight,
  Check,
  CheckCircle2,
  ChevronRight,
  Code2,
  FileCode2,
  GitBranch,
  Menu,
  Play,
  Sparkles,
  Terminal,
  Zap,
} from "lucide-react";
import { BrandLogo } from "./components/brand-logo";

const jobs = [
  { title: "Build product launch page", meta: "Done · Fonts and responsive CSS", time: "Now", active: true },
  { title: "Fix checkout edge cases", meta: "12 tests passed", time: "8m" },
  { title: "Add team permissions", meta: "+135 −21 · Ready for review", time: "24m" },
  { title: "Refresh API documentation", meta: "kodo/docs", time: "1h" },
];

export default function MarketingHome() {
  return (
    <main className="marketing-page">
      <header className="marketing-nav">
        <a className="marketing-logo" href="#top" aria-label="KODO home"><BrandLogo /></a>
        <nav className="marketing-links" aria-label="Main navigation">
          <a href="#models">Models</a><a href="#product">Product</a><a href="#enterprise">Enterprise</a><a href="/pricing">Pricing</a><a href="/docs">Resources</a>
        </nav>
        <div className="marketing-actions">
          <a className="nav-signin" href="/login">Sign in</a><a className="nav-outline" href="mailto:hello@kodo.diy">Contact sales</a><a className="nav-primary" href="/signup">Start building</a>
        </div>
        <details className="mobile-marketing-menu">
          <summary aria-label="Open menu"><Menu size={20} /></summary>
          <div><a href="#product">Product</a><a href="#models">Models</a><a href="#enterprise">Enterprise</a><a href="/pricing">Pricing</a><a href="/workspace">Open workspace</a></div>
        </details>
      </header>

      <section className="marketing-hero" id="top">
        <div className="hero-copy">
          <p className="hero-kicker"><span /> THE AI CODING AGENT</p>
          <h1>Build ambitious<br />software with KODO.</h1>
          <p className="hero-lede">KODO plans, writes, reviews, and ships code with you—so an idea can become a working product in one focused workspace.</p>
          <div className="hero-actions"><a className="hero-primary" href="/workspace">Start building <ArrowRight size={16} /></a><a className="hero-secondary" href="#product"><Play size={14} fill="currentColor" /> See how it works</a></div>
          <p className="hero-note"><Check size={13} /> Start free. Your code stays yours.</p>
        </div>
        <div className="hero-orbit" aria-hidden="true">
          <span className="orbit-line orbit-one" /><span className="orbit-line orbit-two" /><span className="orbit-core"><Sparkles size={27} /></span><span className="orbit-chip chip-plan">Plan</span><span className="orbit-chip chip-code">Code</span><span className="orbit-chip chip-ship">Ship</span>
        </div>
      </section>

      <section className="product-stage" id="product" aria-label="KODO product preview">
        <div className="stage-glow" />
        <div className="desktop-window">
          <div className="window-bar"><div className="window-dots"><i /><i /><i /></div><span>KODO Desktop</span><div className="window-bar-actions"><span>Share</span><span>•••</span></div></div>
          <div className="window-grid">
            <aside className="demo-tasks">
              <p className="demo-label">IN PROGRESS <span>1</span></p>
              <div className="progress-task"><span className="demo-spinner" /><div><b>Plan product launch</b><small>Generating implementation plan</small></div></div>
              <p className="demo-label review-label">READY FOR REVIEW <span>4</span></p>
              {jobs.map((job) => <div className={`demo-job ${job.active ? "selected" : ""}`} key={job.title}><CheckCircle2 size={15} /><div><b>{job.title}</b><small>{job.meta}</small></div><time>{job.time}</time></div>)}
            </aside>
            <section className="demo-agent">
              <div className="demo-agent-title"><span>Build product launch page</span><GitBranch size={14} /></div>
              <div className="prompt-bubble">Build a polished launch page from the attached product brief. Match our brand and make it responsive.</div>
              <div className="agent-steps"><span><Check size={12} /> Read product-brief.md</span><span><Check size={12} /> Inspect existing design system</span><span><Check size={12} /> Build responsive page</span></div>
              <p className="agent-answer">I built the launch page with a focused hero, responsive product preview, and accessible interactions. The full production build passes.</p>
              <div className="changed-file"><FileCode2 size={15} /><b>app/page.tsx</b><span className="plus">+84</span><span className="minus">−12</span></div>
              <div className="changed-file"><FileCode2 size={15} /><b>app/globals.css</b><span className="plus">+126</span><span className="minus">−8</span></div>
              <div className="agent-done"><CheckCircle2 size={15} /><span><b>Done</b><small>Build passed · 18 tests passed</small></span></div>
            </section>
            <section className="demo-preview">
              <div className="browser-bar"><ChevronRight size={15} /><span>↻</span><div>kodo.local</div><Code2 size={15} /></div>
              <div className="preview-canvas"><span className="preview-eyebrow">ACME LABS</span><h3>Software creation<br />is changing.</h3><p>From idea to production, one intelligent workspace keeps your team in flow.</p><button>Explore the product <ArrowRight size={13} /></button><div className="preview-lines"><i /><i /><i /></div></div>
            </section>
          </div>
          <div className="cli-window"><div className="cli-head"><div className="window-dots"><i /><i /><i /></div><span>KODO CLI</span></div><p>~/kodo/product</p><code><span>$</span> kodo build &quot;ship the new homepage&quot;</code><div className="cli-run"><span className="demo-spinner" /> Running tests and checking the build...</div></div>
        </div>
      </section>

      <section className="value-strip" id="models">
        <article><span>01</span><div><h2>Plans before it edits.</h2><p>KODO reads your codebase, finds the right context, and turns the request into a clear plan.</p></div></article>
        <article><span>02</span><div><h2>Works across the stack.</h2><p>Frontend, backend, tests, and infrastructure stay connected in one visible agent run.</p></div></article>
        <article><span>03</span><div><h2>Proves the work.</h2><p>Every task ends with changes, checks, and a review-ready result—not just generated code.</p></div></article>
      </section>

      <section className="workflow-section" id="enterprise">
        <div><p className="section-kicker">ONE WORKSPACE. THE FULL LOOP.</p><h2>From “could we?”<br />to “it’s live.”</h2></div>
        <div className="workflow-rail"><div><span><Sparkles size={17} /></span><b>Describe</b><small>Start with the outcome.</small></div><i /><div><span><Code2 size={17} /></span><b>Build</b><small>Watch every change.</small></div><i /><div><span><Zap size={17} /></span><b>Verify</b><small>Tests and checks included.</small></div><i /><div><span><Terminal size={17} /></span><b>Ship</b><small>You approve the launch.</small></div></div>
      </section>

      <section className="final-cta" id="pricing">
        <BrandLogo size="large" /><h2>Build what comes next.</h2><p>Give KODO a goal. Get a plan, working code, and a clear path to production.</p><a href="/workspace">Start building with KODO <ArrowRight size={16} /></a>
      </section>

      <footer className="marketing-footer" id="resources"><span>© 2026 KODO.DIY</span><div><a href="#product">Product</a><a href="/docs">Docs</a><a href="mailto:hello@kodo.diy">Contact</a><a href="/login">Sign in</a></div><span>Built for ambitious teams.</span></footer>
    </main>
  );
}
