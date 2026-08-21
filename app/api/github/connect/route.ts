import { id, now } from "../../../../lib/db";
import { requireApiUser, unauthorized } from "../../../../lib/server-auth";

export async function GET(request: Request) {
  const auth = await requireApiUser();
  if (!auth) return unauthorized();
  const slug = process.env.GITHUB_APP_SLUG;
  if (!slug) return Response.redirect(new URL("/integrations?missing=github", request.url));
  const state = id("ghstate");
  await auth.db.prepare("INSERT INTO connections (id, workspace_id, provider, status, metadata_json, updated_at) VALUES (?, ?, 'github_oauth_state', 'pending', ?, ?) ON CONFLICT(workspace_id, provider) DO UPDATE SET status = 'pending', metadata_json = excluded.metadata_json, updated_at = excluded.updated_at")
    .bind(id("conn"), auth.workspaceId, JSON.stringify({ state }), now()).run();
  const url = new URL(`https://github.com/apps/${encodeURIComponent(slug)}/installations/new`);
  url.searchParams.set("state", state);
  return Response.redirect(url);
}
