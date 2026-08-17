/**
 * Mirrors the `Role` enum in apps/api/prisma/schema.prisma. Duplicated (not imported from
 * @prisma/client) on purpose — web and mobile shouldn't depend on a backend-only package
 * just to know the list of role names.
 */
export const ROLES = [
  'CUSTOMER',
  'SELLER',
  'SELLER_STAFF',
  'SUPPORT_AGENT',
  'CONTENT_MANAGER',
  'INVENTORY_MANAGER',
  'ANALYST',
  'ADMIN',
  'SUPER_ADMIN',
] as const;

export type Role = (typeof ROLES)[number];
