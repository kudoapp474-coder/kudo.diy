"use client";

import { useRef, useState } from "react";
import {
  ArrowUp,
  Check,
  ChevronDown,
  Code2,
  Eye,
  File,
  FileCode2,
  Folder,
  GitBranch,
  Globe,
  MoreHorizontal,
  Paperclip,
  Play,
  Plus,
  RefreshCw,
  Settings2,
  Sparkles,
  Terminal,
  X,
} from "lucide-react";
import { BrandLogo } from "./brand-logo";

const fileTree = ["app", "components", "lib", "public"];

type ChatMessage = { role: "user" | "agent"; text: string; done?: boolean; connectUrl?: string };

export function ProjectWorkspace({ projectId }: { projectId: string }) {
  const [view, setView] = useState<"preview" | "code">("preview");
  const [prompt, setPrompt] = useState("");
  const [running, setRunning] = useState(false);
  const [showFiles, setShowFiles] = useState(true);
  const [published, setPublished] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([
    { role: "user", text: "Build a premium homepage for KODO with a working product preview." },
    { role: "agent", text: "Project workspace is ready. Connect the AI Gateway in Integrations to run this request on the production coding agent.", connectUrl: "/integrations" },
  ]);
  const uploadInput = useRef<HTMLInputElement>(null);

  async function runAgent() {
    if (!prompt.trim() || running) return;
    const task = prompt.trim();
    setMessages((current) => [...current, { role: "user", text: task }]);
    setPrompt("");
    setRunning(true);
    try {
      const response = await fetch("/api/agent", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ projectId, prompt: task }) });
      const data = await response.json() as { result?: string; error?: string; connectUrl?: string };
      setMessages((current) => [...current, { role: "agent", text: data.result ?? data.error ?? "The agent could not complete this run.", done: response.ok, connectUrl: data.connectUrl }]);
    } catch {
      setMessages((current) => [...current, { role: "agent", text: "KODO could not reach the agent service. Please try again." }]);
    } finally {
      setRunning(false);
    }
  }

  async function uploadFile(file?: File) {
    if (!file) return;
    const form = new FormData();
    form.set("projectId", projectId);
    form.set("file", file);
    const response = await fetch("/api/uploads", { method: "POST", body: form });
    const data = await response.json() as { file?: { name: string }; error?: string };
    setMessages((current) => [...current, { role: "agent", text: response.ok ? `${data.file?.name ?? "File"} was uploaded and added to project context.` : data.error ?? "Upload failed." }]);
  }

  return (
    <main className="builder-shell">
      <header className="builder-topbar">
        <div><a className="builder-logo" href="/"><BrandLogo size="compact" /></a><span className="builder-divider" /><a className="builder-project-name" href="/projects"><span className="project-glyph violet"><Sparkles size={12} /></span><b>{projectId === "new" ? "Untitled project" : projectId.replaceAll("-", " ")}</b><ChevronDown size={13} /></a></div>
        <div className="builder-top-actions"><span className="save-state"><Check size={12} /> Saved</span><button><GitBranch size={14} /> main <ChevronDown size={12} /></button><button className="share-btn">Share</button><button className="publish-btn" onClick={() => setPublished(true)}><Globe size={14} /> Publish</button><span className="user-avatar">N</span></div>
      </header>

      <div className="builder-body">
        <aside className="agent-panel">
          <div className="agent-panel-head"><div><span className="online-dot" /><b>KODO Agent</b></div><button aria-label="Agent options"><MoreHorizontal size={17} /></button></div>
          <div className="conversation">
            <div className="agent-intro"><span><Sparkles size={16} /></span><h1>Build with KODO</h1><p>Ask for a feature, a fix, or a complete redesign. KODO understands your project and handles the implementation.</p></div>
            {messages.map((message, index) => <div className={`message ${message.role}`} key={`${message.role}-${index}`}><span className="message-role">{message.role === "user" ? "You" : <><Sparkles size={11} /> KODO</>}</span><p>{message.text}</p>{message.connectUrl && <a className="message-connect" href={message.connectUrl}>Open integrations</a>}{message.done && <div className="change-summary"><span><Check size={12} /> Agent run completed</span><div><FileCode2 size={13} /><b>Changes saved to project</b><em>Versioned</em></div><button onClick={() => setView("code")}>Review changes</button></div>}</div>)}
            {running && <div className="message agent running-message"><span className="message-role"><Sparkles size={11} /> KODO</span><div className="thinking-line"><i /><span>Reading your project and making changes</span></div><div className="thinking-steps"><span><Check size={11} /> Understanding request</span><span className="current"><i /> Editing project files</span><span>Running checks</span></div></div>}
          </div>
          <div className="agent-composer"><textarea value={prompt} onChange={(event) => setPrompt(event.target.value)} onKeyDown={(event) => { if ((event.metaKey || event.ctrlKey) && event.key === "Enter") runAgent(); }} placeholder="Ask KODO to build, change, or fix..." aria-label="Message KODO" /><input ref={uploadInput} className="hidden-file-input" type="file" onChange={(event) => uploadFile(event.target.files?.[0])} /><div><button aria-label="Add context" onClick={() => uploadInput.current?.click()}><Plus size={17} /></button><button className="attach-button" onClick={() => uploadInput.current?.click()}><Paperclip size={14} /> Attach</button><span className="composer-spacer" /><button className="model-button"><Sparkles size={13} /> GPT-5.6 Sol <ChevronDown size={11} /></button><button className="send-button" disabled={!prompt.trim() || running} onClick={runAgent}><ArrowUp size={16} /></button></div></div>
        </aside>

        <section className="work-panel">
          <header className="work-toolbar"><div className="view-switch"><button className={view === "preview" ? "active" : ""} onClick={() => setView("preview")}><Eye size={14} /> Preview</button><button className={view === "code" ? "active" : ""} onClick={() => setView("code")}><Code2 size={14} /> Code</button></div><div><button aria-label="Refresh"><RefreshCw size={14} /></button><button onClick={() => setShowFiles((current) => !current)}><Folder size={14} /> Files</button><button><Terminal size={14} /> Console</button><button aria-label="Preview settings"><Settings2 size={15} /></button></div></header>

          {view === "preview" ? <div className="live-preview"><div className="preview-browser"><div><button>←</button><button>→</button><button>↻</button></div><span>https://kodo-preview.local</span><button>•••</button></div><div className="built-page"><nav><b>Acme Labs</b><div><span>Work</span><span>About</span><button>Start a project</button></div></nav><section><small>DESIGN & ENGINEERING STUDIO</small><h2>Software for<br />what comes next.</h2><p>We partner with ambitious teams to design and build useful digital products.</p><button>Explore our work <ArrowUp size={15} /></button></section><footer><span>Independent studio · 2026</span><span>New York / Remote</span></footer></div></div> : <div className="code-workspace">{showFiles && <aside className="file-tree"><p>EXPLORER</p>{fileTree.map((file, index) => <div key={file}><Folder size={13} fill="currentColor" /><span>{file}</span><ChevronDown size={11} /></div>)}<span><File size={13} /> package.json</span><span className="active"><FileCode2 size={13} /> page.tsx</span><span><FileCode2 size={13} /> globals.css</span></aside>}<section className="editor"><div className="editor-tabs"><span><FileCode2 size={12} /> page.tsx <X size={11} /></span><span><FileCode2 size={12} /> globals.css</span></div><pre><code>{`export default function Home() {\n  return (\n    <main className="studio-page">\n      <Navigation />\n      <section className="hero">\n        <p>DESIGN & ENGINEERING STUDIO</p>\n        <h1>Software for\n          what comes next.</h1>\n        <ProjectGrid />\n      </section>\n    </main>\n  );\n}`}</code></pre><div className="editor-status"><span>Ln 8, Col 22</span><span>TypeScript React · UTF-8</span></div></section></div>}
        </section>
      </div>

      {published && <div className="publish-layer" role="dialog" aria-modal="true"><button className="publish-scrim" onClick={() => setPublished(false)} aria-label="Close" /><section className="publish-dialog"><button className="dialog-close" onClick={() => setPublished(false)}><X size={18} /></button><span className="publish-icon"><Globe size={22} /></span><h2>Publish this project</h2><p>Your project will be available on a secure KODO URL. You can connect a custom domain anytime.</p><label>Project URL<div><span>kodo.diy/</span><input defaultValue={projectId === "new" ? "untitled-project" : projectId} /></div></label><div className="publish-checks"><span><Check size={13} /> Production build passed</span><span><Check size={13} /> Project is ready to publish</span></div><button className="confirm-publish" onClick={() => setPublished(false)}><Play size={14} /> Publish project</button></section></div>}
    </main>
  );
}
