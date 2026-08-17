import type { Role } from '@prisma/client';

/** Shape attached to `request.user` by JwtStrategy after a valid access token is verified. */
export type AuthenticatedUser = {
  id: string;
  email: string;
  roles: Role[];
};
