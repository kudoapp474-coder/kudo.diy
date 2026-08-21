import { createSign } from "node:crypto";

import { id, now } from "../../../../lib/db";
import { requireApiUser, unauthorized } from "../../../../lib/server-auth";

type GitHubInstallation = {
  id: number;
  account?: { login?: string | null } | null;
};

function base64Url(value: string) {
  return Buffer.from(value).toString("base64url");
}

function createAppJwt(appId: string, privateKey: string) {
  const issuedAt = Math.floor(Date.now() / 1000) - 60;
  const header = base64Url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const payload = base64Url(JSON.stringify({ iat: issuedAt, exp: issuedAt + 600, iss: appId }));
  const unsigned = `${header}.${payload}`;
  const signer = createSign("RSA-SHA256");
  signer.update(unsigned);
  signer.end();
  return `${unsigned}.${signer.sign(privateKey.replace(/\\n/g, "\n"), "base64url")}`;
}

async function getExistingInstallation(): Promise<GitHubInstallation | null> {
  const appId = process.env.GITHUB_APP_ID;
  const privateKey = process.env.GITHUB_APP_PRIVATE_KEY;
  if (!appId || !privateKey) return null;

  try {
    const response = await fetch("https://api.github.com/app/installations?per_page=100", {
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${createAppJwt(appId, privateKey)}`,
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "kodo-diy",
      },
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

  // An App can already be installed before a KODO workspace connection exists.
  // Reuse the sole installation instead of forcing GitHub through setup again.
  const existing = await getExistingInstallation();
  if (existing) {
    const account = existing.account?.login?.trim();
    await auth.db.prepare("INSERT INTO connections (id, workspace_id, provider, account_label, status, metadata_json, updated_at) VALUES (?, ?, 'github', ?, 'connected', ?, ?) ON CONFLICT(workspace_id, provider) DO UPDATE SET account_label = excluded.account_label, status = 'connected', metadata_json = excluded.metadata_json, updated_at = excluded.updated_at")
      .bind(id("conn"), auth.workspaceId, account || `Installation ${existing.id}`, JSON.stringify({ installationId: String(existing.id) }), now()).run();
    return Response.redirect(new URL("/integrations?connected=github&source=existing", request.url));
  }

  const state = id("ghstate");
  await auth.db.prepare("INSERT INTO connections (id, workspace_id, provider, status, metadata_json, updated_at) VALUES (?, ?, 'github_oauth_state', 'pending', ?, ?) ON CONFLICT(workspace_id, provider) DO UPDATE SET status = 'pending', metadata_json = excluded.metadata_json, updated_at = excluded.updated_at")
    .bind(id("conn"), auth.workspaceId, JSON.stringify({ state }), now()).run();

  const url = new URL(`https://github.com/apps/${encodeURIComponent(slug)}/installations/new`);
  url.searchParams.set("state", state);
  return Response.redirect(url);
}
