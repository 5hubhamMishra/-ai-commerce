import type { PublicUser, Role } from "@ai-commerce/types";

/** Roles that can see *something* on /admin — each individual section still degrades
 *  gracefully per its own, narrower role requirement (e.g. only SUPPORT_AGENT/ADMIN/
 *  SUPER_ADMIN can read orders; only ANALYST/ADMIN/SUPER_ADMIN can read analytics).
 *  This is a client-side UX gate only — the real security boundary is apps/api's own
 *  `@Roles(...)` guards on every route; a user could bypass this and still get a clean
 *  403 from the API for anything they don't actually hold a role for. */
export const ADMIN_SURFACE_ROLES: Role[] = [
  "SUPPORT_AGENT",
  "CONTENT_MANAGER",
  "INVENTORY_MANAGER",
  "ANALYST",
  "ADMIN",
  "SUPER_ADMIN",
];

export function hasAnyRole(user: PublicUser | null, roles: Role[]): boolean {
  if (!user) return false;
  return user.roles.some((r) => roles.includes(r));
}
