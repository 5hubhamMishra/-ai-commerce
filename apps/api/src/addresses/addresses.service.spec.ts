import { NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service';
import { AddressesService } from './addresses.service';
import type { CreateAddressDto } from './dto/create-address.dto';

const baseAddress: CreateAddressDto = {
  line1: '1 Main St',
  city: 'Bengaluru',
  state: 'KA',
  postalCode: '560001',
  country: 'IN',
};

describe('AddressesService', () => {
  let service: AddressesService;
  let prisma: {
    address: {
      findMany: jest.Mock;
      findUnique: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
      updateMany: jest.Mock;
      delete: jest.Mock;
      count: jest.Mock;
    };
    $transaction: jest.Mock;
  };

  beforeEach(async () => {
    prisma = {
      address: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
        delete: jest.fn(),
        count: jest.fn(),
      },
      $transaction: jest.fn((fn: (tx: unknown) => unknown) => fn(prisma)),
    };

    const module = await Test.createTestingModule({
      providers: [
        AddressesService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get(AddressesService);
  });

  it('marks the first address for a user as default automatically', async () => {
    prisma.address.count.mockResolvedValue(0);
    prisma.address.create.mockImplementation(
      ({ data }: { data: Record<string, unknown> }) => Promise.resolve(data),
    );

    const result = await service.create('u1', baseAddress);

    expect(result.isDefault).toBe(true);
  });

  it('does not default a second address unless explicitly requested', async () => {
    prisma.address.count.mockResolvedValue(1);
    prisma.address.create.mockImplementation(
      ({ data }: { data: Record<string, unknown> }) => Promise.resolve(data),
    );

    const result = await service.create('u1', baseAddress);

    expect(result.isDefault).toBe(false);
    expect(prisma.address.updateMany).not.toHaveBeenCalled();
  });

  it('unsets the previous default when a new default address is created', async () => {
    prisma.address.count.mockResolvedValue(1);
    prisma.address.create.mockImplementation(
      ({ data }: { data: Record<string, unknown> }) => Promise.resolve(data),
    );

    await service.create('u1', { ...baseAddress, isDefault: true });

    expect(prisma.address.updateMany).toHaveBeenCalledWith({
      where: { userId: 'u1', isDefault: true },
      data: { isDefault: false },
    });
  });

  it('refuses to update an address owned by a different user, without revealing it exists', async () => {
    prisma.address.findUnique.mockResolvedValue({
      id: 'addr1',
      userId: 'someone-else',
    });

    await expect(
      service.update('u1', 'addr1', { city: 'Nowhere' }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.address.update).not.toHaveBeenCalled();
  });

  it('throws not-found for a nonexistent address on delete', async () => {
    prisma.address.findUnique.mockResolvedValue(null);
    await expect(service.remove('u1', 'missing')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
