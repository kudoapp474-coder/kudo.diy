import { auth, currentUser } from "@clerk/nextjs/server";
import { getChatGPTUser } from "../app/chatgpt-auth";
import { ensureDatabase, now } from "./db";

export async function requireApiUser() {
  let user = await getChatGPTUser();

  if (process.env.CLERK_SECRET_KEY && process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY) {
    const session = await auth();
    if (!session.userId) return null;
    const clerkUser = await currentUser();
    const email = clerkUser?.primaryEmailAddress?.emailAddress ?? clerkUser?.emailAddresses[0]?.emailAddress;
    if (!email) return null;
    user = {
      email,
      displayName: clerkUser?.fullName ?? clerkUser?.firstName ?? email.split("@")[0],
      fullName: clerkUser?.fullName ?? null,
    };
  }

  if (!user) return null;
  const db = await ensureDatabase();
  const workspaceId = `ws_${user.email.toLowerCase().replace(/[^a-z0-9]/g, "_").slice(0, 44)}`;
  await db.prepare("INSERT OR IGNORE INTO workspaces (id, owner_email, name, slug, plan, credits, created_at) VALUES (?, ?, ?, ?, 'free', 500, ?)")
    .bind(workspaceId, user.email, `${user.displayName}'s Workspace`, workspaceId.slice(3), now()).run();
  return { user, workspaceId, db };
}

export function unauthorized() {
  return Response.json({ error: "Sign in to continue.", code: "UNAUTHORIZED" }, { status: 401 });
}
