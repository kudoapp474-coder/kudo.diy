export type MemberRole = "owner" | "admin" | "member";

export function canManageMembers(role: MemberRole) {
  return role === "owner" || role === "admin";
}

export function isValidInviteRole(role: string): role is "admin" | "member" {
  return role === "admin" || role === "member";
}
