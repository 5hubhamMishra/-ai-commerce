/** Matches the raw Prisma `Address` row shape returned by every endpoint in
 *  apps/api/src/addresses/addresses.service.ts — there is no custom response mapper. */
export type Address = {
  id: string;
  userId: string;
  label: string | null;
  line1: string;
  line2: string | null;
  city: string;
  state: string;
  postalCode: string;
  country: string;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
};

/** Matches `CreateAddressDto` in apps/api/src/addresses/dto/create-address.dto.ts. */
export type CreateAddressInput = {
  label?: string;
  line1: string;
  line2?: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
  isDefault?: boolean;
};

/** Matches `UpdateAddressDto` (= PartialType(CreateAddressDto)). */
export type UpdateAddressInput = Partial<CreateAddressInput>;
