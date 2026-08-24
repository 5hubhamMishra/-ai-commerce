import {
  ConfigPreflightError,
  assertConfigPreflight,
  validateConfigPreflight,
} from './config-preflight';

const validConfig = {
  NODE_ENV: 'development',
  PORT: '4000',
  WEB_ORIGIN: 'http://localhost:3000,http://localhost:3100',
  DATABASE_URL: 'postgresql://user:password@localhost:5432/app?schema=public',
  DIRECT_URL: 'postgresql://user:password@localhost:5432/app?schema=public',
  REDIS_URL: 'redis://localhost:6379',
  JWT_ACCESS_SECRET: 'a'.repeat(32),
  JWT_REFRESH_SECRET: 'b'.repeat(32),
  ANTHROPIC_API_KEY: 'anthropic-key-present',
  PAYMENT_PROVIDER: 'development',
  PAYMENT_SECRET: 'dev-webhook-secret',
};

describe('config preflight', () => {
  it('accepts a complete local development configuration', () => {
    expect(validateConfigPreflight(validConfig)).toEqual([]);
  });

  it('reports missing or malformed database config without exposing values', () => {
    const issues = validateConfigPreflight({
      ...validConfig,
      DATABASE_URL: 'not-a-postgres-url',
    });

    expect(issues).toEqual([
      { key: 'DATABASE_URL', reason: 'must be a valid URL' },
    ]);
  });

  it('requires DIRECT_URL for build preflight before Prisma migrations run', () => {
    const withoutDirectUrl: Record<string, unknown> = { ...validConfig };
    delete withoutDirectUrl.DIRECT_URL;

    expect(validateConfigPreflight(withoutDirectUrl)).toEqual([]);
    expect(
      validateConfigPreflight(withoutDirectUrl, { mode: 'build' }),
    ).toEqual([{ key: 'DIRECT_URL', reason: 'is required' }]);
  });

  it('requires cron protection in production-like environments', () => {
    expect(
      validateConfigPreflight({
        ...validConfig,
        NODE_ENV: 'production',
      }),
    ).toContainEqual({
      key: 'CRON_SECRET',
      reason: 'is required',
    });
  });

  it('requires Razorpay credentials and webhook secret when Razorpay is selected', () => {
    const issues = validateConfigPreflight({
      ...validConfig,
      PAYMENT_PROVIDER: 'razorpay',
      PAYMENT_SECRET: 'short',
    });

    expect(issues).toEqual([
      { key: 'RAZORPAY_KEY_ID', reason: 'is required' },
      { key: 'RAZORPAY_KEY_SECRET', reason: 'is required' },
      {
        key: 'PAYMENT_SECRET',
        reason: 'must be at least 16 characters',
      },
    ]);
  });

  it('throws a sanitized error that lists names and reasons only', () => {
    const leakedValue = 'postgresql://user:super-secret@localhost:5432/app';

    expect(() =>
      assertConfigPreflight({
        ...validConfig,
        DATABASE_URL: leakedValue,
        JWT_ACCESS_SECRET: 'too-short',
      }),
    ).toThrow(ConfigPreflightError);

    try {
      assertConfigPreflight({
        ...validConfig,
        DATABASE_URL: leakedValue,
        JWT_ACCESS_SECRET: 'too-short',
      });
    } catch (error) {
      expect(error).toBeInstanceOf(ConfigPreflightError);
      expect((error as Error).message).toContain('JWT_ACCESS_SECRET');
      expect((error as Error).message).not.toContain('super-secret');
      expect((error as Error).message).not.toContain(leakedValue);
    }
  });
});
