import { createSign } from "node:crypto";

function base64Url(value: string) {
  return Buffer.from(value).toString("base64url");
}

export function createGitHubAppJwt() {
  const appId = process.env.GITHUB_APP_ID;
  const privateKey = process.env.GITHUB_APP_PRIVATE_KEY;
  if (!appId || !privateKey) throw new Error("GitHub App credentials are not configured.");
  const issuedAt = Math.floor(Date.now() / 1000) - 60;
  const header = base64Url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const payload = base64Url(JSON.stringify({ iat: issuedAt, exp: issuedAt + 600, iss: appId }));
  const unsigned = `${header}.${payload}`;
  const signer = createSign("RSA-SHA256");
  signer.update(unsigned);
  signer.end();
  return `${unsigned}.${signer.sign(privateKey.replace(/\\n/g, "\n"), "base64url")}`;
}

export function githubHeaders(token: string) {
  return {
    Accept: "application/vnd.github+json",
    Authorization: `Bearer ${token}`,
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "kodo-diy",
  };
}

export async function getGitHubInstallationToken(installationId: string) {
  const response = await fetch(`https://api.github.com/app/installations/${encodeURIComponent(installationId)}/access_tokens`, {
    method: "POST",
    headers: githubHeaders(createGitHubAppJwt()),
  });
  const data = await response.json() as { token?: string; message?: string };
  if (!response.ok || !data.token) throw new Error(data.message ?? "Could not authorize the GitHub installation.");
  return data.token;
}
