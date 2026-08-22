"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { FileCode2, FolderGit2, LoaderCircle, Search, Sparkles, X } from "lucide-react";

type ProjectResult = { id: string; name: string; description: string; status: string };
type AgentResult = { id: string; project_id: string; project_name: string; prompt: string; status: string };
type FileResult = { project_id: string; project_name: string; path: string };
type SearchResults = { projects: ProjectResult[]; agents: AgentResult[]; files: FileResult[] };

const EMPTY: SearchResults = { projects: [], agents: [], files: [] };

export function GlobalSearch() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResults>(EMPTY);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  function openSearch() {
    setOpen(true);
  }

  function closeSearch() {
    setOpen(false);
    setQuery("");
    setResults(EMPTY);
    setLoading(false);
  }

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setOpen(current => !current);
      } else if (event.key === "Escape") {
        setOpen(false);
        setQuery("");
        setResults(EMPTY);
        setLoading(false);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  useEffect(() => {
    if (!open) return;
    const timer = window.setTimeout(() => inputRef.current?.focus(), 0);
    return () => window.clearTimeout(timer);
  }, [open]);

  useEffect(() => {
    const trimmed = query.trim();
    if (!open || trimmed.length < 2) return;
    let active = true;
    const timer = window.setTimeout(() => {
      setLoading(true);
      fetch(`/api/search?q=${encodeURIComponent(trimmed)}`, { cache: "no-store" })
        .then(response => response.json() as Promise<SearchResults>)
        .then(data => { if (active) setResults(data); })
        .catch(() => { if (active) setResults(EMPTY); })
        .finally(() => { if (active) setLoading(false); });
    }, 250);
    return () => { active = false; window.clearTimeout(timer); };
  }, [query, open]);

  function onQueryChange(value: string) {
    setQuery(value);
    if (value.trim().length < 2) { setResults(EMPTY); setLoading(false); }
  }

  function go(path: string) {
    closeSearch();
    router.push(path);
  }

  const hasQuery = query.trim().length >= 2;
  const hasResults = results.projects.length > 0 || results.agents.length > 0 || results.files.length > 0;

  return <>
    <button className="global-search" onClick={openSearch}><Search size={15} /><span>Search projects, agents, and files</span><kbd>⌘ K</kbd></button>
    {open ? <div className="search-palette-layer" role="dialog" aria-modal="true" aria-label="Search">
      <button className="search-palette-scrim" onClick={closeSearch} aria-label="Close search" />
      <section className="search-palette">
        <header><Search size={15} /><input ref={inputRef} value={query} onChange={event => onQueryChange(event.target.value)} placeholder="Search projects, agents, and files" aria-label="Search" />{loading ? <LoaderCircle size={14} className="search-palette-spinner" /> : null}<button onClick={closeSearch} aria-label="Close"><X size={15} /></button></header>
        <div className="search-palette-body">
          {!hasQuery ? <p className="search-palette-hint">Type at least 2 characters to search this workspace.</p> : null}
          {hasQuery && !loading && !hasResults ? <p className="search-palette-hint">No matches for &ldquo;{query.trim()}&rdquo;.</p> : null}
          {results.projects.length ? <div className="search-palette-group"><small>PROJECTS</small>{results.projects.map(project => <button key={project.id} onClick={() => go(`/project/${project.id}`)}><Sparkles size={13} /><span><b>{project.name}</b><small>{project.description || project.status}</small></span></button>)}</div> : null}
          {results.agents.length ? <div className="search-palette-group"><small>AGENTS</small>{results.agents.map(agent => <button key={agent.id} onClick={() => go(`/project/${agent.project_id}`)}><Sparkles size={13} /><span><b>{agent.prompt}</b><small>{agent.project_name} · {agent.status}</small></span></button>)}</div> : null}
          {results.files.length ? <div className="search-palette-group"><small>FILES</small>{results.files.map(file => <button key={`${file.project_id}-${file.path}`} onClick={() => go(`/project/${file.project_id}`)}><FileCode2 size={13} /><span><b>{file.path}</b><small>{file.project_name}</small></span></button>)}</div> : null}
        </div>
        <footer><FolderGit2 size={11} /> Searches this workspace only</footer>
      </section>
    </div> : null}
  </>;
}
