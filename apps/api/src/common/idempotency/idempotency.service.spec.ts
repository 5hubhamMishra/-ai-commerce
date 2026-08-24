import { ConflictException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaService } from '../../prisma/prisma.service';
import { IdempotencyService } from './idempotency.service';

describe('IdempotencyService', () => {
  let service: IdempotencyService;
  const prisma = {
    idempotencyKey: {
      create: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const moduleRef = await Test.createTestingModule({
      providers: [
        IdempotencyService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();
    service = moduleRef.get(IdempotencyService);
  });

  it('claims the key, runs the operation once, and stores the response', async () => {
    prisma.idempotencyKey.create.mockResolvedValue({});
    const operation = jest
      .fn()
      .mockResolvedValue({ statusCode: 201, body: { orderId: 'o1' } });

    const result = await service.run(
      'user1',
      'order_create',
      'key1',
      operation,
    );

    expect(prisma.idempotencyKey.create).toHaveBeenCalledWith({
      data: {
        userId: 'user1',
        scope: 'order_create',
        key: 'key1',
        requestFingerprint: undefined,
      },
    });
    expect(operation).toHaveBeenCalledTimes(1);
    expect(prisma.idempotencyKey.update).toHaveBeenCalledWith({
      where: {
        userId_scope_key: {
          userId: 'user1',
          scope: 'order_create',
          key: 'key1',
        },
      },
      data: { statusCode: 201, responseBody: { orderId: 'o1' } },
    });
    expect(result).toEqual({
      statusCode: 201,
      body: { orderId: 'o1' },
      replayed: false,
    });
  });

  it('replays the stored response instead of re-running a completed operation', async () => {
    prisma.idempotencyKey.create.mockRejectedValue(
      new Error('unique constraint violation'),
    );
    prisma.idempotencyKey.findUnique.mockResolvedValue({
      requestFingerprint: undefined,
      statusCode: 201,
      responseBody: { orderId: 'o1' },
    });
    const operation = jest.fn();

    const result = await service.run(
      'user1',
      'order_create',
      'key1',
      operation,
    );

    expect(operation).not.toHaveBeenCalled();
    expect(result).toEqual({
      statusCode: 201,
      body: { orderId: 'o1' },
      replayed: true,
    });
  });

  it('rejects a concurrent request while the first attempt is still in flight', async () => {
    prisma.idempotencyKey.create.mockRejectedValue(
      new Error('unique constraint violation'),
    );
    prisma.idempotencyKey.findUnique.mockResolvedValue({
      requestFingerprint: undefined,
      statusCode: null,
      responseBody: null,
    });
    const operation = jest.fn();

    await expect(
      service.run('user1', 'order_create', 'key1', operation),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(operation).not.toHaveBeenCalled();
  });

  it('releases the claim on failure so a genuine retry can re-attempt the operation', async () => {
    prisma.idempotencyKey.create.mockResolvedValue({});
    prisma.idempotencyKey.delete.mockResolvedValue({});
    const operation = jest
      .fn()
      .mockRejectedValue(new Error('payment provider unreachable'));

    await expect(
      service.run('user1', 'payment_create', 'key1', operation),
    ).rejects.toThrow('payment provider unreachable');

    expect(prisma.idempotencyKey.delete).toHaveBeenCalledWith({
      where: {
        userId_scope_key: {
          userId: 'user1',
          scope: 'payment_create',
          key: 'key1',
        },
      },
    });
    expect(prisma.idempotencyKey.update).not.toHaveBeenCalled();
  });

  it('rejects same-key reuse for a different request fingerprint', async () => {
    prisma.idempotencyKey.create.mockRejectedValue(
      new Error('unique constraint violation'),
    );
    prisma.idempotencyKey.findUnique.mockResolvedValue({
      requestFingerprint: 'hash-a',
      statusCode: 201,
      responseBody: { refundId: 'r1' },
    });
    const operation = jest.fn();

    await expect(
      service.run('admin1', 'refund_create', 'key1', operation, 'hash-b'),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(operation).not.toHaveBeenCalled();
  });
});
