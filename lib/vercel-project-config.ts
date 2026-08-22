import { slugify } from "./project-files";

type VercelError = { error?: { message?: string }; message?: string };

function teamId() { return process.env.VERCEL_TEAM_ID || process.env.VERCEL_ORG_ID || ""; }
function token() { return process.env.VERCEL_TOKEN || ""; }

export function kodoVercelProjectName(name: string, projectId: string) {
  return `${slugify(name) || "kodo-project"}-${projectId.slice(-8)}`.slice(0, 100);
}

export function projectVercelConfigured() { return Boolean(token() && teamId()); }

async function vercelRequest<T>(path: string, init: RequestInit = {}) {
  if (!projectVercelConfigured()) throw new Error("Connect Vercel publishing before managing this setting.");
  const url = new URL(`https://api.vercel.com${path}`);
  url.searchParams.set("teamId", teamId());
  const response = await fetch(url, {
    ...init,
    headers: { Authorization: `Bearer ${token()}`, ...(init.body ? { "content-type": "application/json" } : {}), ...init.headers },
    cache: "no-store",
  });
  const data = await response.json().catch(() => ({})) as T & VercelError;
  if (!response.ok) throw new Error(data.error?.message || data.message || `Vercel request failed (${response.status}).`);
  return data;
}

export type ProjectDomain = { name: string; verified?: boolean; verification?: Array<{ type?: string; domain?: string; value?: string; reason?: string }> };

export async function listProjectDomains(projectName: string) {
  const data = await vercelRequest<{ domains?: ProjectDomain[] }>(`/v9/projects/${encodeURIComponent(projectName)}/domains`);
  return data.domains ?? [];
}

export function addProjectDomain(projectName: string, domain: string) {
  return vercelRequest<ProjectDomain>(`/v10/projects/${encodeURIComponent(projectName)}/domains`, { method: "POST", body: JSON.stringify({ name: domain }) });
}

export function removeProjectDomain(projectName: string, domain: string) {
  return vercelRequest<Record<string, unknown>>(`/v9/projects/${encodeURIComponent(projectName)}/domains/${encodeURIComponent(domain)}`, { method: "DELETE", body: JSON.stringify({ removeRedirects: false }) });
}

export function upsertProjectEnvironmentVariable(projectName: string, input: { key: string; value: string; targets: string[]; gitBranch?: string | null; comment?: string }) {
  return vercelRequest<Record<string, unknown>>(`/v10/projects/${encodeURIComponent(projectName)}/env?upsert=true`, {
    method: "POST",
    body: JSON.stringify({ key: input.key, value: input.value, type: "encrypted", target: input.targets, ...(input.gitBranch ? { gitBranch: input.gitBranch } : {}), comment: input.comment?.slice(0, 500) }),
  });
}

export async function removeProjectEnvironmentVariable(projectName: string, key: string) {
  const data = await vercelRequest<{ envs?: Array<{ id: string; key: string }> }>(`/v9/projects/${encodeURIComponent(projectName)}/env`);
  const matches = (data.envs ?? []).filter(item => item.key === key);
  await Promise.all(matches.map(item => vercelRequest(`/v9/projects/${encodeURIComponent(projectName)}/env/${encodeURIComponent(item.id)}`, { method: "DELETE" })));
  return matches.length;
}
