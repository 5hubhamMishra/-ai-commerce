import { ServiceUnavailableException } from '@nestjs/common';
import { DevelopmentPayoutAdapter } from './development-payout.adapter';
import { DevelopmentVerificationAdapter } from './development-verification.adapter';

describe('development seller adapters', () => {
  const originalNodeEnv = process.env.NODE_ENV;
  const originalVercelEnv = process.env.VERCEL_ENV;

  afterEach(() => {
    if (originalNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = originalNodeEnv;
    if (originalVercelEnv === undefined) delete process.env.VERCEL_ENV;
    else process.env.VERCEL_ENV = originalVercelEnv;
  });

  it('keeps development payout simulation available outside production', async () => {
    process.env.NODE_ENV = 'test';
    delete process.env.VERCEL_ENV;

    await expect(
      new DevelopmentPayoutAdapter().payout({
        sellerId: 'seller-1',
        amount: 100,
        currency: 'INR',
        idempotencyKey: 'payout-1',
      }),
    ).resolves.toMatchObject({ success: true, raw: { simulated: true } });
  });

  it('fails closed instead of representing a simulated payout as real in production', async () => {
    process.env.NODE_ENV = 'production';

    await expect(
      new DevelopmentPayoutAdapter().payout({
        sellerId: 'seller-1',
        amount: 100,
        currency: 'INR',
        idempotencyKey: 'payout-1',
      }),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it('fails closed instead of auto-verifying a seller in production', async () => {
    process.env.NODE_ENV = 'test';
    process.env.VERCEL_ENV = 'production';

    await expect(
      new DevelopmentVerificationAdapter().verify({
        sellerId: 'seller-1',
        businessName: 'Example Store',
      }),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
  });
});
