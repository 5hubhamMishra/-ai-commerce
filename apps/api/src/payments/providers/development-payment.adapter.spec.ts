import { ConfigService } from '@nestjs/config';
import { createHmac } from 'node:crypto';
import { DevelopmentPaymentAdapter } from './development-payment.adapter';

function adapterWithSecret(secret: string | undefined) {
  const config = { get: () => secret } as unknown as ConfigService;
  return new DevelopmentPaymentAdapter(config);
}

describe('DevelopmentPaymentAdapter.verifyWebhookSignature', () => {
  const payload = JSON.stringify({ providerRef: 'dev_abc', success: true });

  it('accepts a signature computed with the configured secret', () => {
    const adapter = adapterWithSecret('a-real-secret');
    const signature = createHmac('sha256', 'a-real-secret')
      .update(payload)
      .digest('hex');

    expect(adapter.verifyWebhookSignature(payload, signature)).toBe(true);
  });

  it('rejects a signature computed with the wrong secret', () => {
    const adapter = adapterWithSecret('a-real-secret');
    const signature = createHmac('sha256', 'wrong-secret')
      .update(payload)
      .digest('hex');

    expect(adapter.verifyWebhookSignature(payload, signature)).toBe(false);
  });

  it('rejects a tampered payload even with an otherwise-valid signature', () => {
    const adapter = adapterWithSecret('a-real-secret');
    const signature = createHmac('sha256', 'a-real-secret')
      .update(payload)
      .digest('hex');

    const tamperedPayload = JSON.stringify({
      providerRef: 'dev_abc',
      success: false,
    });
    expect(adapter.verifyWebhookSignature(tamperedPayload, signature)).toBe(
      false,
    );
  });

  it('fails closed (rejects) when no signature header is present', () => {
    const adapter = adapterWithSecret('a-real-secret');
    expect(adapter.verifyWebhookSignature(payload, undefined)).toBe(false);
  });

  it('fails closed (rejects everything) when no secret is configured, rather than accepting all', () => {
    const adapter = adapterWithSecret(undefined);
    const signature = createHmac('sha256', 'whatever')
      .update(payload)
      .digest('hex');

    expect(adapter.verifyWebhookSignature(payload, signature)).toBe(false);
  });
});
