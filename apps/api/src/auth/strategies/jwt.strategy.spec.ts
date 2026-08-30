import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Role } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { JwtStrategy } from './jwt.strategy';

describe('JwtStrategy', () => {
  let strategy: JwtStrategy;
  let prisma: { user: { findUnique: jest.Mock } };

  beforeEach(() => {
    prisma = { user: { findUnique: jest.fn() } };
    strategy = new JwtStrategy(
      {
        get: (key: string) =>
          key === 'jwt.accessSecret'
            ? 'test-secret-value-that-is-long-enough-for-hs256'
            : undefined,
      } as ConfigService,
      prisma as unknown as PrismaService,
    );
  });

  it('selects only authentication fields and maps the roles', async () => {
    prisma.user.findUnique.mockResolvedValue({
      id: 'u1',
      email: 'a@example.com',
      isActive: true,
      deletedAt: null,
      roles: [{ role: Role.CUSTOMER }],
    });

    await expect(
      strategy.validate({ sub: 'u1', email: 'a@example.com' }),
    ).resolves.toEqual({
      id: 'u1',
      email: 'a@example.com',
      roles: [Role.CUSTOMER],
    });
    expect(prisma.user.findUnique).toHaveBeenCalledWith({
      where: { id: 'u1' },
      select: {
        id: true,
        email: true,
        isActive: true,
        deletedAt: true,
        roles: { select: { role: true } },
      },
    });
  });

  it('rejects inactive users', async () => {
    prisma.user.findUnique.mockResolvedValue({
      id: 'u1',
      email: 'a@example.com',
      isActive: false,
      deletedAt: null,
      roles: [],
    });

    await expect(
      strategy.validate({ sub: 'u1', email: 'a@example.com' }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });
});
