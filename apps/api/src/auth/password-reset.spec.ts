import * as bcrypt from 'bcrypt';
import { AuthService } from './auth.service';

describe('AuthService password recovery', () => {
  const originalNodeEnv = process.env.NODE_ENV;

  afterEach(() => {
    process.env.NODE_ENV = originalNodeEnv;
  });

  function createService(overrides: Record<string, unknown> = {}) {
    const prisma = {
      user: {
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        update: jest.fn(),
      },
      refreshToken: { updateMany: jest.fn() },
      passwordResetToken: {
        findUnique: jest.fn(),
        create: jest.fn(),
        deleteMany: jest.fn(),
        updateMany: jest.fn(),
      },
      $transaction: jest.fn(),
      ...overrides,
    };
    const audit = { record: jest.fn() };
    const service = new AuthService(
      prisma as never,
      {} as never,
      {} as never,
      audit as never,
    );
    return { service, prisma, audit };
  }

  it('returns a generic response for an unknown email', async () => {
    const { service, prisma } = createService();
    prisma.user.findUnique.mockResolvedValue(null);

    const result = await service.requestPasswordReset('missing@example.com');

    expect(result).toEqual({
      message:
        'If an account exists for that email, recovery instructions will be available shortly.',
    });
    expect(prisma.passwordResetToken.create).not.toHaveBeenCalled();
  });

  it('creates a hashed, expiring development reset token without leaking the hash', async () => {
    process.env.NODE_ENV = 'test';
    const { service, prisma } = createService();
    prisma.user.findUnique.mockResolvedValue({
      id: 'user-1',
      isActive: true,
      deletedAt: null,
    });
    prisma.$transaction.mockResolvedValue([]);

    const result = await service.requestPasswordReset('USER@example.com');
    const created = prisma.passwordResetToken.create.mock.calls[0][0].data as {
      userId: string;
      tokenHash: string;
      expiresAt: Date;
    };

    expect(result.resetToken).toMatch(/^[a-f0-9]{64}$/);
    expect(created.userId).toBe('user-1');
    expect(created.tokenHash).not.toBe(result.resetToken);
    expect(created.expiresAt.getTime()).toBeGreaterThan(Date.now());
    expect(prisma.user.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { email: 'user@example.com' } }),
    );
  });

  it('fails closed in production until an email provider is configured', async () => {
    process.env.NODE_ENV = 'production';
    const { service, prisma } = createService();
    prisma.user.findUnique.mockResolvedValue({
      id: 'user-1',
      isActive: true,
      deletedAt: null,
    });
    prisma.$transaction.mockResolvedValue([]);

    await expect(
      service.requestPasswordReset('user@example.com'),
    ).rejects.toMatchObject({
      response: expect.objectContaining({
        code: 'PASSWORD_RESET_PROVIDER_UNAVAILABLE',
      }),
    });
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
  });

  it('claims a valid token, changes the password, and revokes sessions', async () => {
    const { service, prisma, audit } = createService();
    const token = 'a'.repeat(64);
    prisma.passwordResetToken.findUnique.mockResolvedValue({
      id: 'reset-1',
      userId: 'user-1',
      usedAt: null,
      expiresAt: new Date(Date.now() + 60_000),
    });
    let transactionResult: unknown;
    prisma.$transaction.mockImplementation(
      (callback: (tx: unknown) => unknown) => {
        transactionResult = callback({
          passwordResetToken: {
            updateMany: jest.fn().mockResolvedValue({ count: 1 }),
            deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
          },
          user: {
            findFirst: jest.fn().mockResolvedValue({ id: 'user-1' }),
            update: jest.fn().mockResolvedValue({ id: 'user-1' }),
          },
          refreshToken: {
            updateMany: jest.fn().mockResolvedValue({ count: 2 }),
          },
        });
        return Promise.resolve(transactionResult);
      },
    );

    await expect(service.resetPassword(token, 'new-password')).resolves.toEqual(
      { message: 'Password reset successfully. Please sign in again.' },
    );
    expect(await transactionResult).toEqual({ id: 'user-1' });
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'PASSWORD_RESET_COMPLETED' }),
    );
  });

  it('stores a bcrypt password hash when resetting', async () => {
    const { service, prisma } = createService();
    prisma.passwordResetToken.findUnique.mockResolvedValue({
      id: 'reset-1',
      userId: 'user-1',
      usedAt: null,
      expiresAt: new Date(Date.now() + 60_000),
    });
    const userUpdate = jest.fn().mockResolvedValue({ id: 'user-1' });
    prisma.$transaction.mockImplementation(
      (callback: (tx: unknown) => unknown) =>
        Promise.resolve(
          callback({
            passwordResetToken: {
              updateMany: jest.fn().mockResolvedValue({ count: 1 }),
              deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
            },
            user: {
              findFirst: jest.fn().mockResolvedValue({ id: 'user-1' }),
              update: userUpdate,
            },
            refreshToken: {
              updateMany: jest.fn().mockResolvedValue({ count: 0 }),
            },
          }),
        ),
    );

    await service.resetPassword('b'.repeat(64), 'new-password');

    const passwordHash = userUpdate.mock.calls[0][0].data.passwordHash;
    expect(passwordHash).not.toBe('new-password');
    await expect(
      bcrypt.compare('new-password', passwordHash as string),
    ).resolves.toBe(true);
  });

  it('rejects expired tokens before changing credentials', async () => {
    const { service, prisma } = createService();
    prisma.passwordResetToken.findUnique.mockResolvedValue({
      id: 'reset-1',
      userId: 'user-1',
      usedAt: null,
      expiresAt: new Date(Date.now() - 1),
    });

    await expect(
      service.resetPassword('expired-token', 'new-password'),
    ).rejects.toMatchObject({
      response: expect.objectContaining({
        code: 'INVALID_PASSWORD_RESET_TOKEN',
      }),
    });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});
