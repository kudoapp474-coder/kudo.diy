import { slugify, type ProjectFileRecord } from "./project-files";

type VercelDeploymentResponse = {
  id?: string;
  url?: string;
  readyState?: string;
  state?: string;
  error?: { message?: string };
};

export type KodoDeploymentStatus = "building" | "ready" | "failed";

const TERMINAL_STATES = new Set(["READY", "ERROR", "CANCELED"]);
const STATUS_ATTEMPTS = 18;

function deploymentApiUrl(path = "") {
  const url = new URL(`https://api.vercel.com/v13/deployments${path}`);
  const teamId = process.env.VERCEL_TEAM_ID || process.env.VERCEL_ORG_ID;
  if (teamId) url.searchParams.set("teamId", teamId);
  return url;
}

function stateOf(deployment: VercelDeploymentResponse) {
  return (deployment.readyState || deployment.state || "QUEUED").toUpperCase();
}

export function vercelPublishingConfigured() {
  return Boolean(process.env.VERCEL_TOKEN && (process.env.VERCEL_TEAM_ID || process.env.VERCEL_ORG_ID));
}

export function kodoDeploymentStatus(state: string): KodoDeploymentStatus {
  const normalized = state.toUpperCase();
  if (normalized === "READY") return "ready";
  if (normalized === "ERROR" || normalized === "CANCELED") return "failed";
  return "building";
}

async function responseData(response: Response) {
  return response.json().catch(() => ({})) as Promise<VercelDeploymentResponse>;
}

async function requestDeployment(identifier: string) {
  const token = process.env.VERCEL_TOKEN;
  if (!token) return null;
  const response = await fetch(deploymentApiUrl(`/${encodeURIComponent(identifier)}`), {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  const data = await responseData(response);
  if (!response.ok) throw new Error(data.error?.message ?? `Vercel status request failed (${response.status}).`);
  return data;
}

async function waitForDeployment(identifier: string, initial: VercelDeploymentResponse) {
  let deployment = initial;
  for (let attempt = 0; attempt < STATUS_ATTEMPTS && !TERMINAL_STATES.has(stateOf(deployment)); attempt += 1) {
    await new Promise(resolve => setTimeout(resolve, Math.min(1_000 + attempt * 250, 3_000)));
    deployment = await requestDeployment(identifier) ?? deployment;
  }
  return deployment;
}

export async function refreshVercelDeployment(url: string) {
  if (!vercelPublishingConfigured()) return { configured: false as const };
  const identifier = new URL(url).hostname;
  const deployment = await requestDeployment(identifier);
  if (!deployment) return { configured: false as const };
  const state = stateOf(deployment);
  return {
    configured: true as const,
    id: deployment.id ?? null,
    url: deployment.url ? `https://${deployment.url}` : url,
    state,
    status: kodoDeploymentStatus(state),
  };
}

export async function deployStaticProjectToVercel(name: string, projectId: string, files: ProjectFileRecord[], target: "preview" | "production") {
  const token = process.env.VERCEL_TOKEN;
  if (!vercelPublishingConfigured() || !token) return { configured: false as const };
  const deployable = files.filter(file => !file.path.startsWith("scripts/") && file.path !== "package.json");
  const projectName = `${slugify(name) || "kodo-project"}-${projectId.slice(-8)}`.slice(0, 100);
  const response = await fetch(deploymentApiUrl(), {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify({
      name: projectName,
      ...(target === "production" ? { target: "production" } : {}),
      files: deployable.map(file => ({ file: file.path, data: file.content })),
      projectSettings: { framework: null },
      meta: { kodoProjectId: projectId, kodoEnvironment: target },
    }),
  });
  const data = await responseData(response);
  if (!response.ok || !data.url) return { configured: true as const, error: data.error?.message ?? `Vercel deployment failed (${response.status}).` };
  const deployment = data.id ? await waitForDeployment(data.id, data) : data;
  const state = stateOf(deployment);
  if (kodoDeploymentStatus(state) === "failed") {
    return { configured: true as const, id: deployment.id ?? data.id ?? null, error: `Vercel deployment ${state.toLowerCase()}.` };
  }
  return {
    configured: true as const,
    id: deployment.id ?? data.id ?? null,
    url: `https://${deployment.url ?? data.url}`,
    state,
    status: kodoDeploymentStatus(state),
  };
}
