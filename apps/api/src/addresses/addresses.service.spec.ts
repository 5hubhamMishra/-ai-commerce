import { NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
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
      findUniqueOrThrow: jest.Mock;
      delete: jest.Mock;
      count: jest.Mock;
    };
    order: { count: jest.Mock };
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
        findUniqueOrThrow: jest.fn(),
        delete: jest.fn(),
        count: jest.fn(),
      },
      order: { count: jest.fn() },
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

  it('rejects a stale address update before changing default state', async () => {
    const updatedAt = new Date('2026-09-01T00:00:00.000Z');
    prisma.address.findUnique.mockResolvedValue({
      id: 'addr1',
      userId: 'u1',
      updatedAt,
    });
    prisma.address.updateMany.mockResolvedValue({ count: 0 });

    await expect(
      service.update('u1', 'addr1', { city: 'New city', isDefault: true }),
    ).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'ADDRESS_CHANGED' }),
    });
    expect(prisma.address.updateMany).toHaveBeenCalledTimes(1);
    expect(prisma.address.updateMany).toHaveBeenCalledWith({
      where: { id: 'addr1', userId: 'u1', updatedAt },
      data: { city: 'New city', isDefault: true },
    });
  });

  it('maps an order-created-during-delete race to the address conflict', async () => {
    prisma.address.findUnique.mockResolvedValue({ id: 'addr1', userId: 'u1' });
    prisma.order.count.mockResolvedValue(0);
    prisma.address.delete.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError(
        'Foreign key constraint failed',
        {
          code: 'P2003',
          clientVersion: 'test',
        },
      ),
    );

    await expect(service.remove('u1', 'addr1')).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'ADDRESS_HAS_ORDERS' }),
    });
  });

  it('maps a concurrent address deletion to not found', async () => {
    prisma.address.findUnique.mockResolvedValue({ id: 'addr1', userId: 'u1' });
    prisma.order.count.mockResolvedValue(0);
    prisma.address.delete.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('Record not found', {
        code: 'P2025',
        clientVersion: 'test',
      }),
    );

    await expect(service.remove('u1', 'addr1')).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'ADDRESS_NOT_FOUND' }),
    });
  });
});
