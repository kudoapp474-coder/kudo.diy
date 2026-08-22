import { createSign } from "node:crypto";

function base64Url(value: string) {
  return Buffer.from(value).toString("base64url");
}

export function normalizeGitHubPrivateKey(rawValue: string) {
  let value = rawValue.trim();

  // Vercel values are sometimes pasted as a JSON string or with literal
  // newline escapes. Accept those safe representations before handing the
  // key to OpenSSL.
  if (value.startsWith('"') && value.endsWith('"')) {
    try {
      const parsed = JSON.parse(value);
      if (typeof parsed === "string") value = parsed;
    } catch {
      value = value.slice(1, -1);
    }
  } else if (value.startsWith("'") && value.endsWith("'")) {
    value = value.slice(1, -1);
  }

  value = value
    .replace(/\\r\\n/g, "\n")
    .replace(/\\n/g, "\n")
    .replace(/\r\n/g, "\n")
    .trim();

  // Also accept a base64-encoded PEM, which is a common environment-variable
  // representation for multiline secrets.
  if (!value.includes("-----BEGIN")) {
    try {
      const decoded = Buffer.from(value.replace(/\s+/g, ""), "base64").toString("utf8").trim();
      if (decoded.includes("-----BEGIN")) value = decoded;
    } catch {
      // Keep the original value so the stable configuration error below is
      // returned instead of exposing decoder internals.
    }
  }

  const pem = value.match(/-----BEGIN ([A-Z0-9 ]+?)-----([\s\S]*?)-----END \1-----/);
  if (!pem) return value;

  const body = pem[2].replace(/\s+/g, "");
  if (!body) return value;
  const wrappedBody = body.match(/.{1,64}/g)?.join("\n") ?? body;
  return `-----BEGIN ${pem[1]}-----\n${wrappedBody}\n-----END ${pem[1]}-----\n`;
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
  try {
    return `${unsigned}.${signer.sign(normalizeGitHubPrivateKey(privateKey), "base64url")}`;
  } catch {
    throw new Error("GitHub App private key is invalid. Replace GITHUB_APP_PRIVATE_KEY with the complete PEM contents.");
  }
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
