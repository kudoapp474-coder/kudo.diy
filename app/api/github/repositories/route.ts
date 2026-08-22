import { getGitHubInstallationToken, githubHeaders } from "../../../../lib/github-app";
import { requireApiUser, unauthorized } from "../../../../lib/server-auth";

type InstallationRepositories = {
  repositories?: Array<{
    full_name?: string;
    html_url?: string;
    private?: boolean;
    language?: string | null;
    default_branch?: string;
    pushed_at?: string | null;
  }>;
  message?: string;
};

function readInstallationId(metadata: string | null | undefined) {
  try {
    return String(JSON.parse(metadata ?? "{}").installationId ?? "");
  } catch {
    return "";
  }
}

function safeReturnTo(value: string | null) {
  return value?.startsWith("/") && !value.startsWith("//") ? value : "/repositories";
}

export async function GET(request: Request) {
  const auth = await requireApiUser();
  if (!auth) return unauthorized();
  const returnTo = safeReturnTo(new URL(request.url).searchParams.get("returnTo"));
  const connectUrl = `/api/github/connect?returnTo=${encodeURIComponent(returnTo)}`;

  const connection = await auth.db
    .prepare("SELECT account_label, metadata_json FROM connections WHERE workspace_id = ? AND provider = 'github' AND status = 'connected'")
    .bind(auth.workspaceId)
    .first<{ account_label: string | null; metadata_json: string }>();
  const installationId = readInstallationId(connection?.metadata_json);

  if (!installationId) {
    return Response.json({ connected: false, repositories: [], connectUrl });
  }

  try {
    const token = await getGitHubInstallationToken(installationId);
    const response = await fetch("https://api.github.com/installation/repositories?per_page=100", {
      headers: githubHeaders(token),
      cache: "no-store",
    });
    const data = await response.json() as InstallationRepositories;
    if (!response.ok) throw new Error(data.message ?? `GitHub request failed (${response.status}).`);

    const repositories = (data.repositories ?? [])
      .filter(repository => repository.full_name && repository.html_url)
      .map(repository => ({
        name: repository.full_name!,
        url: repository.html_url!,
        private: Boolean(repository.private),
        language: repository.language || "—",
        branch: repository.default_branch || "main",
        updatedAt: repository.pushed_at,
      }))
      .sort((left, right) => String(right.updatedAt ?? "").localeCompare(String(left.updatedAt ?? "")));

    return Response.json({
      connected: true,
      account: connection?.account_label ?? null,
      repositories,
      connectUrl,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not load GitHub repositories.";
    return Response.json({ connected: true, repositories: [], error: message.slice(0, 400) }, { status: 502 });
  }
}
