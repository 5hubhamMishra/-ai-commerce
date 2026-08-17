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

export type Address = {
  id: string;
  userId: string;
  label?: string | null;
  line1: string;
  line2?: string | null;
  city: string;
  state: string;
  postalCode: string;
  country: string;
  isDefault: boolean;
};
