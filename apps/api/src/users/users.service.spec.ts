import { NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
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
  };

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
    };

    const module = await Test.createTestingModule({
      providers: [UsersService, { provide: PrismaService, useValue: prisma }],
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
});
