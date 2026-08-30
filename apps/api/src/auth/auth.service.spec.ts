import { ConflictException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { Role } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuthService } from './auth.service';

describe('AuthService', () => {
  let service: AuthService;
  let audit: { record: jest.Mock };
  let prisma: {
    user: { findUnique: jest.Mock; create: jest.Mock };
    refreshToken: {
      create: jest.Mock;
      findUnique: jest.Mock;
      update: jest.Mock;
      updateMany: jest.Mock;
    };
  };

  beforeEach(async () => {
    prisma = {
      user: { findUnique: jest.fn(), create: jest.fn() },
      refreshToken: {
        create: jest.fn().mockResolvedValue({}),
        findUnique: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
      },
    };
    audit = { record: jest.fn() };

    const module = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: prisma },
        JwtService,
        {
          provide: ConfigService,
          useValue: {
            get: (key: string) =>
              ({
                'jwt.accessSecret':
                  'test-secret-value-that-is-long-enough-for-hs256',
                'jwt.accessTtl': '15m',
                'jwt.refreshTtlDays': 30,
              })[key],
          },
        },
        { provide: AuditService, useValue: audit },
      ],
    }).compile();

    service = module.get(AuthService);
  });

  describe('register', () => {
    it('rejects a duplicate email', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 'existing' });
      await expect(
        service.register({
          email: 'a@example.com',
          password: 'password123',
          name: 'A',
        }),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(prisma.user.findUnique).toHaveBeenCalledWith({
        where: { email: 'a@example.com' },
        select: { id: true },
      });
    });

    it('hashes the password before storing it — never stores plaintext', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      prisma.user.create.mockImplementation(
        ({
          data,
        }: {
          data: { email: string; name: string; passwordHash: string };
        }) =>
          Promise.resolve({
            id: 'u1',
            email: data.email,
            name: data.name,
            passwordHash: data.passwordHash,
            roles: [{ role: Role.CUSTOMER }],
          }),
      );

      await service.register({
        email: 'new@example.com',
        password: 'password123',
        name: 'New',
      });

      const storedHash = prisma.user.create.mock.calls[0][0].data.passwordHash;
      expect(storedHash).not.toBe('password123');
      expect(await bcrypt.compare('password123', storedHash)).toBe(true);
    });

    it('assigns the CUSTOMER role by default', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      prisma.user.create.mockImplementation(() =>
        Promise.resolve({
          id: 'u1',
          email: 'new@example.com',
          name: 'New',
          roles: [{ role: Role.CUSTOMER }],
        }),
      );

      await service.register({
        email: 'new@example.com',
        password: 'password123',
        name: 'New',
      });

      expect(prisma.user.create.mock.calls[0][0].data.roles).toEqual({
        create: { role: Role.CUSTOMER },
      });
      expect(prisma.user.create.mock.calls[0][0].include).toBeUndefined();
      expect(prisma.user.create.mock.calls[0][0].select).toEqual({
        id: true,
        email: true,
        name: true,
        roles: { select: { role: true } },
      });
    });
  });

  describe('login', () => {
    it('rejects an unknown email without revealing whether the account exists', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      await expect(
        service.login({ email: 'ghost@example.com', password: 'whatever' }),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('rejects an incorrect password', async () => {
      const passwordHash = await bcrypt.hash('correct-password', 4);
      prisma.user.findUnique.mockResolvedValue({
        id: 'u1',
        email: 'a@example.com',
        passwordHash,
        isActive: true,
        deletedAt: null,
        name: 'A',
        roles: [{ role: Role.CUSTOMER }],
      });

      await expect(
        service.login({ email: 'a@example.com', password: 'wrong-password' }),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('audits a failed login attempt (for credential-stuffing/brute-force visibility)', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      await expect(
        service.login({ email: 'ghost@example.com', password: 'whatever' }),
      ).rejects.toBeInstanceOf(UnauthorizedException);

      expect(audit.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'USER_LOGIN_FAILED',
          metadata: { email: 'ghost@example.com' },
        }),
      );
    });

    it('rejects a deactivated account even with the correct password', async () => {
      const passwordHash = await bcrypt.hash('correct-password', 4);
      prisma.user.findUnique.mockResolvedValue({
        id: 'u1',
        email: 'a@example.com',
        passwordHash,
        isActive: false,
        deletedAt: null,
        name: 'A',
        roles: [{ role: Role.CUSTOMER }],
      });

      await expect(
        service.login({ email: 'a@example.com', password: 'correct-password' }),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('issues an access + refresh token pair on valid credentials', async () => {
      const passwordHash = await bcrypt.hash('correct-password', 4);
      prisma.user.findUnique.mockResolvedValue({
        id: 'u1',
        email: 'a@example.com',
        passwordHash,
        isActive: true,
        deletedAt: null,
        name: 'A',
        roles: [{ role: Role.CUSTOMER }],
      });

      const result = await service.login({
        email: 'a@example.com',
        password: 'correct-password',
      });

      expect(result.accessToken).toEqual(expect.any(String));
      expect(result.refreshToken).toEqual(expect.any(String));
      expect(prisma.refreshToken.create).toHaveBeenCalled();
      expect(prisma.user.findUnique).toHaveBeenCalledWith({
        where: { email: 'a@example.com' },
        select: {
          id: true,
          email: true,
          passwordHash: true,
          name: true,
          isActive: true,
          deletedAt: true,
          roles: { select: { role: true } },
        },
      });
    });
  });

  describe('refresh', () => {
    it('revokes the whole session chain if a revoked token is reused (theft signal)', async () => {
      prisma.refreshToken.findUnique.mockResolvedValue({
        id: 'rt1',
        userId: 'u1',
        revokedAt: new Date(),
        expiresAt: new Date(Date.now() + 1_000_000),
      });

      await expect(service.refresh('some-token')).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
      expect(prisma.refreshToken.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ userId: 'u1', revokedAt: null }),
        }),
      );
      expect(audit.record).toHaveBeenCalledWith(
        expect.objectContaining({
          actorId: 'u1',
          action: 'REFRESH_TOKEN_REUSE_DETECTED',
        }),
      );
    });

    it('rejects an expired token', async () => {
      prisma.refreshToken.findUnique.mockResolvedValue({
        id: 'rt1',
        userId: 'u1',
        revokedAt: null,
        expiresAt: new Date(Date.now() - 1000),
      });

      await expect(service.refresh('some-token')).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
    });

    it('selects only the fields needed to issue the next token', async () => {
      prisma.refreshToken.findUnique.mockResolvedValue({
        id: 'rt1',
        userId: 'u1',
        revokedAt: null,
        expiresAt: new Date(Date.now() + 1_000_000),
      });
      prisma.user.findUnique.mockResolvedValue({
        id: 'u1',
        email: 'a@example.com',
        isActive: true,
        deletedAt: null,
      });

      await expect(service.refresh('some-token')).resolves.toEqual({
        accessToken: expect.any(String),
        refreshToken: expect.any(String),
      });
      expect(prisma.user.findUnique).toHaveBeenCalledWith({
        where: { id: 'u1' },
        select: {
          id: true,
          email: true,
          isActive: true,
          deletedAt: true,
        },
      });
    });

    it('rejects an unrecognized token', async () => {
      prisma.refreshToken.findUnique.mockResolvedValue(null);
      await expect(service.refresh('unknown-token')).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
    });
  });
});
