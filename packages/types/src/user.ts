import type { Role } from './roles';

export type PublicUser = {
  id: string;
  email: string;
  name: string;
  isActive: boolean;
  createdAt: string;
  roles: Role[];
};

export type Profile = {
  id: string;
  userId: string;
  phone?: string | null;
  personalizationEnabled: boolean;
  notificationPreferences: Record<string, unknown>;
};
