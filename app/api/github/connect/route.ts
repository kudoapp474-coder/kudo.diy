import { id, now } from "../../../../lib/db";
import { createGitHubAppJwt, githubHeaders } from "../../../../lib/github-app";
import { requireApiUser, unauthorized } from "../../../../lib/server-auth";

type GitHubInstallation = {
  id: number;
  account?: { login?: string | null } | null;
};

function safeReturnTo(value: string | null) {
  return value?.startsWith("/") && !value.startsWith("//") ? value : "/integrations";
}

async function getExistingInstallation(): Promise<GitHubInstallation | null> {
  const appId = process.env.GITHUB_APP_ID;
  const privateKey = process.env.GITHUB_APP_PRIVATE_KEY;
  if (!appId || !privateKey) return null;

  try {
    const response = await fetch("https://api.github.com/app/installations?per_page=100", {
      headers: githubHeaders(createGitHubAppJwt()),
      cache: "no-store",
    });
    if (!response.ok) return null;
    const installations = (await response.json()) as GitHubInstallation[];
    return installations.length === 1 ? installations[0] : null;
  } catch {
    return null;
  }
}

export async function GET(request: Request) {
  const auth = await requireApiUser();
  if (!auth) return unauthorized();

  const slug = process.env.GITHUB_APP_SLUG;
  if (!slug) return Response.redirect(new URL("/integrations?missing=github", request.url));
  const requestUrl = new URL(request.url);
  const returnTo = safeReturnTo(requestUrl.searchParams.get("returnTo"));

  // An App can already be installed before a KODO workspace connection exists.
  // Reuse the sole installation instead of forcing GitHub through setup again.
  const existing = await getExistingInstallation();
  if (existing) {
    const account = existing.account?.login?.trim();
    await auth.db.prepare("INSERT INTO connections (id, workspace_id, provider, account_label, status, metadata_json, updated_at) VALUES (?, ?, 'github', ?, 'connected', ?, ?) ON CONFLICT(workspace_id, provider) DO UPDATE SET account_label = excluded.account_label, status = 'connected', metadata_json = excluded.metadata_json, updated_at = excluded.updated_at")
      .bind(id("conn"), auth.workspaceId, account || `Installation ${existing.id}`, JSON.stringify({ installationId: String(existing.id) }), now()).run();
    const destination = new URL(returnTo, request.url);
    destination.searchParams.set("connected", "github");
    destination.searchParams.set("source", "existing");
    return Response.redirect(destination);
  }

  const state = id("ghstate");
  await auth.db.prepare("INSERT INTO connections (id, workspace_id, provider, status, metadata_json, updated_at) VALUES (?, ?, 'github_oauth_state', 'pending', ?, ?) ON CONFLICT(workspace_id, provider) DO UPDATE SET status = 'pending', metadata_json = excluded.metadata_json, updated_at = excluded.updated_at")
    .bind(id("conn"), auth.workspaceId, JSON.stringify({ state, returnTo }), now()).run();

  const url = new URL(`https://github.com/apps/${encodeURIComponent(slug)}/installations/new`);
  url.searchParams.set("state", state);
  return Response.redirect(url);
}
