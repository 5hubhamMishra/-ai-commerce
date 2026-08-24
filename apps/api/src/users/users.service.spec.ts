import { NotFoundException, UnauthorizedException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as bcrypt from 'bcrypt';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import { UsersService } from './users.service';

describe('UsersService', () => {
  let service: UsersService;
  let prisma: {
    user: {
      findUnique: jest.Mock;
      update: jest.Mock;
      findMany: jest.Mock;
      count: jest.Mock;
    };
    order: { findMany: jest.Mock };
    cart: { findUnique: jest.Mock; deleteMany: jest.Mock };
    wishlistItem: { findMany: jest.Mock; deleteMany: jest.Mock };
    behavioralEvent: { findMany: jest.Mock; deleteMany: jest.Mock };
    customerProfile: { findUnique: jest.Mock; deleteMany: jest.Mock };
    notification: { findMany: jest.Mock; deleteMany: jest.Mock };
    shopAIConversation: { findMany: jest.Mock; deleteMany: jest.Mock };
    shopAIInteractionLog: { updateMany: jest.Mock };
    recommendationImpression: { updateMany: jest.Mock };
    searchQueryLog: { updateMany: jest.Mock };
    supportTicket: { findMany: jest.Mock; updateMany: jest.Mock };
    supportMessage: { updateMany: jest.Mock };
    address: { updateMany: jest.Mock };
    profile: { updateMany: jest.Mock };
    refreshToken: { updateMany: jest.Mock };
    $transaction: jest.Mock;
  };
  let audit: { record: jest.Mock };

  const row = {
    id: 'u1',
    email: 'a@example.com',
    name: 'A',
    isActive: true,
    createdAt: new Date(),
    deletedAt: null,
    roles: [],
  };

  beforeEach(async () => {
    prisma = {
      user: {
        findUnique: jest.fn().mockResolvedValue(row),
        update: jest.fn().mockResolvedValue(row),
        findMany: jest.fn().mockResolvedValue([row]),
        count: jest.fn().mockResolvedValue(1),
      },
      order: { findMany: jest.fn().mockResolvedValue([]) },
      cart: {
        findUnique: jest.fn().mockResolvedValue(null),
        deleteMany: jest.fn(),
      },
      wishlistItem: {
        findMany: jest.fn().mockResolvedValue([]),
        deleteMany: jest.fn(),
      },
      behavioralEvent: {
        findMany: jest.fn().mockResolvedValue([]),
        deleteMany: jest.fn(),
      },
      customerProfile: {
        findUnique: jest.fn().mockResolvedValue(null),
        deleteMany: jest.fn(),
      },
      notification: {
        findMany: jest.fn().mockResolvedValue([]),
        deleteMany: jest.fn(),
      },
      shopAIConversation: {
        findMany: jest.fn().mockResolvedValue([]),
        deleteMany: jest.fn(),
      },
      shopAIInteractionLog: { updateMany: jest.fn() },
      recommendationImpression: { updateMany: jest.fn() },
      searchQueryLog: { updateMany: jest.fn() },
      supportTicket: {
        findMany: jest.fn().mockResolvedValue([]),
        updateMany: jest.fn(),
      },
      supportMessage: { updateMany: jest.fn() },
      address: { updateMany: jest.fn() },
      profile: { updateMany: jest.fn() },
      refreshToken: { updateMany: jest.fn() },
      $transaction: jest.fn().mockResolvedValue(undefined),
    };
    audit = { record: jest.fn().mockResolvedValue(undefined) };

    const module = await Test.createTestingModule({
      providers: [
        UsersService,
        { provide: PrismaService, useValue: prisma },
        { provide: AuditService, useValue: audit },
      ],
    }).compile();

    service = module.get(UsersService);
  });

  // Prisma's `include` returns every scalar column at runtime (passwordHash included)
  // regardless of what a TypeScript return type claims — only `select` makes fetching
  // it structurally impossible. These assert the query shape itself, not just that a
  // downstream mapper happens to drop the field.
  describe('never fetches passwordHash', () => {
    it('findById uses select, not include, and never names passwordHash', async () => {
      await service.findById('u1');
      const call = prisma.user.findUnique.mock.calls[0][0];
      expect(call.include).toBeUndefined();
      expect(call.select).toBeDefined();
      expect(call.select.passwordHash).toBeUndefined();
    });

    it('updateName uses select, not include', async () => {
      await service.updateName('u1', 'New Name');
      const call = prisma.user.update.mock.calls[0][0];
      expect(call.include).toBeUndefined();
      expect(call.select).toBeDefined();
      expect(call.select.passwordHash).toBeUndefined();
    });

    it('list uses select, not include', async () => {
      await service.list({ page: 1, pageSize: 20 });
      const call = prisma.user.findMany.mock.calls[0][0];
      expect(call.include).toBeUndefined();
      expect(call.select).toBeDefined();
      expect(call.select.passwordHash).toBeUndefined();
    });
  });

  it('findById throws NotFoundException for a soft-deleted user', async () => {
    prisma.user.findUnique.mockResolvedValue({ ...row, deletedAt: new Date() });
    await expect(service.findById('u1')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('toPublic never forwards fields outside its explicit allowlist', () => {
    const result = service.toPublic(row);
    expect(Object.keys(result).sort()).toEqual(
      ['createdAt', 'email', 'id', 'isActive', 'name', 'roles'].sort(),
    );
  });

  describe('exportData', () => {
    it('throws NotFoundException when the user does not exist', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      await expect(service.exportData('missing')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('gathers every personal-data source into one envelope', async () => {
      prisma.user.findUnique.mockResolvedValue({
        ...row,
        profile: { phone: '555' },
        addresses: [{ id: 'a1' }],
      });
      const result = await service.exportData('u1');
      expect(prisma.order.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { userId: 'u1' } }),
      );
      expect(prisma.supportTicket.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          include: { messages: { where: { senderId: 'u1' } } },
        }),
      );
      expect(result.account.id).toBe('u1');
      expect(result.profile).toEqual({ phone: '555' });
      expect(Object.keys(result).sort()).toEqual(
        [
          'account',
          'activity',
          'addresses',
          'cart',
          'customerProfile',
          'exportedAt',
          'notifications',
          'orders',
          'profile',
          'shopaiConversations',
          'supportTickets',
          'wishlist',
        ].sort(),
      );
    });
  });

  describe('deleteAccount', () => {
    // Real bcrypt (low round count, matching auth.service.spec.ts's own convention) rather
    // than a mocked `bcrypt.compare` — the native binding's exports aren't spy-redefinable.
    let realPasswordHash: string;
    beforeAll(async () => {
      realPasswordHash = await bcrypt.hash('correct-password', 4);
    });

    it('throws NotFoundException for a missing or already-deleted user', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      await expect(service.deleteAccount('u1', 'pw')).rejects.toBeInstanceOf(
        NotFoundException,
      );

      prisma.user.findUnique.mockResolvedValue({
        ...row,
        passwordHash: realPasswordHash,
        deletedAt: new Date(),
      });
      await expect(service.deleteAccount('u1', 'pw')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('throws UnauthorizedException on a wrong password without touching any data', async () => {
      prisma.user.findUnique.mockResolvedValue({
        ...row,
        passwordHash: realPasswordHash,
      });

      await expect(
        service.deleteAccount('u1', 'wrong-password'),
      ).rejects.toBeInstanceOf(UnauthorizedException);
      expect(prisma.$transaction).not.toHaveBeenCalled();
      expect(audit.record).not.toHaveBeenCalled();
    });

    it('anonymizes the account, deletes personal data, and audits the deletion', async () => {
      prisma.user.findUnique.mockResolvedValue({
        ...row,
        passwordHash: realPasswordHash,
      });

      await service.deleteAccount('u1', 'correct-password');

      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      const ops = prisma.$transaction.mock.calls[0][0];
      expect(Array.isArray(ops)).toBe(true);
      // The final operation anonymizes the User row itself — email/name/passwordHash
      // scrubbed, never left as the real account holder's identity.
      expect(prisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'u1' },
          data: expect.objectContaining({
            email: 'deleted-u1@deleted.invalid',
            name: 'Deleted User',
            isActive: false,
          }),
        }),
      );
      expect(prisma.user.update.mock.calls[0][0].data.deletedAt).toBeInstanceOf(
        Date,
      );
      expect(prisma.user.update.mock.calls[0][0].data.passwordHash).not.toBe(
        realPasswordHash,
      );
      // Addresses are scrubbed in place, never hard-deleted (Order.addressId depends
      // on the row continuing to exist).
      expect(prisma.address.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId: 'u1' },
          data: expect.objectContaining({ line1: '[deleted]' }),
        }),
      );
      expect(prisma.refreshToken.updateMany).toHaveBeenCalledWith({
        where: { userId: 'u1', revokedAt: null },
        data: { revokedAt: expect.any(Date) },
      });
      // Support tickets aren't deletable (a non-nullable FK, and staff may have replied on
      // the same thread) — the user's own free text is scrubbed in place instead, same
      // treatment as addresses. Only the user's own messages, never staff replies.
      expect(prisma.supportMessage.updateMany).toHaveBeenCalledWith({
        where: { senderId: 'u1' },
        data: { body: '[deleted]' },
      });
      expect(prisma.supportTicket.updateMany).toHaveBeenCalledWith({
        where: { userId: 'u1' },
        data: { subject: '[deleted]' },
      });
      expect(audit.record).toHaveBeenCalledWith({
        actorId: 'u1',
        action: 'USER_ACCOUNT_DELETED',
        entityType: 'user',
        entityId: 'u1',
      });
    });
  });
});
