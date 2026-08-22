import { slugify, type ProjectFileRecord } from "./project-files";

type VercelDeploymentResponse = { id?: string; url?: string; readyState?: string; error?: { message?: string } };

export async function deployStaticProjectToVercel(name: string, projectId: string, files: ProjectFileRecord[], target: "preview" | "production") {
  const token = process.env.VERCEL_TOKEN;
  if (!token) return { configured: false as const };
  const deployable = files.filter(file => !file.path.startsWith("scripts/") && file.path !== "package.json");
  const projectName = `${slugify(name) || "kodo-project"}-${projectId.slice(-8)}`.slice(0, 100);
  const apiUrl = new URL("https://api.vercel.com/v13/deployments");
  const teamId = process.env.VERCEL_TEAM_ID || process.env.VERCEL_ORG_ID;
  if (teamId) apiUrl.searchParams.set("teamId", teamId);
  const response = await fetch(apiUrl, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify({
      name: projectName,
      ...(target === "production" ? { target: "production" } : {}),
      files: deployable.map(file => ({ file: file.path, data: file.content })),
      projectSettings: { framework: null },
    }),
  });
  const data = await response.json() as VercelDeploymentResponse;
  if (!response.ok || !data.url) return { configured: true as const, error: data.error?.message ?? `Vercel deployment failed (${response.status}).` };
  return { configured: true as const, id: data.id ?? null, url: `https://${data.url}`, status: data.readyState ?? "QUEUED" };
}
