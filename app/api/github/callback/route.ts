import { id, now } from "../../../../lib/db";
import { requireApiUser, unauthorized } from "../../../../lib/server-auth";

function safeReturnTo(value: unknown) {
  return typeof value === "string" && value.startsWith("/") && !value.startsWith("//") ? value : "/integrations";
}

export async function GET(request: Request) {
  const auth = await requireApiUser();
  if (!auth) return unauthorized();
  const url = new URL(request.url);
  const installationId = url.searchParams.get("installation_id");
  const state = url.searchParams.get("state");
  const pending = await auth.db.prepare("SELECT metadata_json FROM connections WHERE workspace_id = ? AND provider = 'github_oauth_state'").bind(auth.workspaceId).first<{ metadata_json: string }>();
  let expectedState = "";
  let returnTo = "/integrations";
  try {
    const metadata = JSON.parse(pending?.metadata_json ?? "{}") as { state?: string; returnTo?: string };
    expectedState = metadata.state ?? "";
    returnTo = safeReturnTo(metadata.returnTo);
  } catch { expectedState = ""; }
  if (!installationId || !state || state !== expectedState) return Response.redirect(new URL("/integrations?error=github_state", request.url));
  await auth.db.prepare("INSERT INTO connections (id, workspace_id, provider, account_label, status, metadata_json, updated_at) VALUES (?, ?, 'github', ?, 'connected', ?, ?) ON CONFLICT(workspace_id, provider) DO UPDATE SET account_label = excluded.account_label, status = 'connected', metadata_json = excluded.metadata_json, updated_at = excluded.updated_at")
    .bind(id("conn"), auth.workspaceId, `Installation ${installationId}`, JSON.stringify({ installationId }), now()).run();
  await auth.db.prepare("DELETE FROM connections WHERE workspace_id = ? AND provider = 'github_oauth_state'").bind(auth.workspaceId).run();
  const destination = new URL(returnTo, request.url);
  destination.searchParams.set("connected", "github");
  return Response.redirect(destination);
}
