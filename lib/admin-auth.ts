import { requireApiUser, unauthorized } from "./server-auth";

export function isKodoAdmin(email: string) {
  const allowed = (process.env.KODO_ADMIN_EMAILS ?? "")
    .split(",")
    .map(value => value.trim().toLowerCase())
    .filter(Boolean);
  return allowed.includes(email.trim().toLowerCase());
}

export async function requireAdminApiUser() {
  const auth = await requireApiUser();
  if (!auth) return { auth: null, response: unauthorized() };
  if (!isKodoAdmin(auth.user.email)) {
    return {
      auth: null,
      response: Response.json(
        { error: "Admin access is required.", code: "FORBIDDEN" },
        { status: 403 },
      ),
    };
  }
  return { auth, response: null };
}
