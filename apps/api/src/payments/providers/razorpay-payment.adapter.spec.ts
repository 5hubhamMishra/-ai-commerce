import { createHmac } from 'node:crypto';
import { ConfigService } from '@nestjs/config';
import { RazorpayPaymentAdapter } from './razorpay-payment.adapter';

const mockOrdersCreate = jest.fn();
const mockPaymentsRefund = jest.fn();

// Only the network-calling SDK methods (orders.create, payments.refund) are mocked — the
// static `validateWebhookSignature` stays the real implementation (kept via jest.requireActual)
// so webhook tests exercise genuine HMAC math, not a mocked assertion. The adapter separately
// imports `validatePaymentVerification` from 'razorpay/dist/utils/razorpay-utils' directly (not
// through this mocked 'razorpay' module), so confirmPayment tests also run real crypto.
jest.mock('razorpay', () => {
  const actual = jest.requireActual('razorpay');
  class MockRazorpay {
    orders = { create: mockOrdersCreate };
    payments = { refund: mockPaymentsRefund };
    static validateWebhookSignature = actual.validateWebhookSignature;
  }
  return MockRazorpay;
});

function configWith(values: Record<string, string | undefined>) {
  return { get: (key: string) => values[key] } as unknown as ConfigService;
}

const KEY_ID = 'rzp_test_key';
const KEY_SECRET = 'a-real-key-secret';
const WEBHOOK_SECRET = 'a-real-webhook-secret';

function fullConfig(overrides: Record<string, string | undefined> = {}) {
  return configWith({
    'payments.razorpay.keyId': KEY_ID,
    'payments.razorpay.keySecret': KEY_SECRET,
    'payments.webhookSecret': WEBHOOK_SECRET,
    ...overrides,
  });
}

describe('RazorpayPaymentAdapter', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('createIntent', () => {
    it('converts the amount to paise and returns the order id as providerRef', async () => {
      mockOrdersCreate.mockResolvedValue({
        id: 'order_abc123',
        amount: 49900,
        currency: 'INR',
        status: 'created',
      });
      const adapter = new RazorpayPaymentAdapter(fullConfig());

      const result = await adapter.createIntent({
        orderId: 'ord-1',
        amount: 499,
        currency: 'INR',
        idempotencyKey: 'idem-1',
      });

      expect(mockOrdersCreate).toHaveBeenCalledWith({
        amount: 49900,
        currency: 'INR',
        receipt: 'idem-1',
        notes: { orderId: 'ord-1' },
      });
      expect(result.providerRef).toBe('order_abc123');
    });

    it('throws when RAZORPAY_KEY_ID/KEY_SECRET are not configured', async () => {
      const adapter = new RazorpayPaymentAdapter(configWith({}));

      await expect(
        adapter.createIntent({
          orderId: 'ord-1',
          amount: 499,
          currency: 'INR',
          idempotencyKey: 'idem-1',
        }),
      ).rejects.toThrow('RAZORPAY_KEY_ID/RAZORPAY_KEY_SECRET must be set');
    });

    it('propagates Razorpay SDK/network failures without creating a fake provider reference', async () => {
      mockOrdersCreate.mockRejectedValue(new Error('Razorpay unavailable'));
      const adapter = new RazorpayPaymentAdapter(fullConfig());

      await expect(
        adapter.createIntent({
          orderId: 'ord-1',
          amount: 499,
          currency: 'INR',
          idempotencyKey: 'idem-1',
        }),
      ).rejects.toThrow('Razorpay unavailable');
    });
  });

  describe('confirmPayment', () => {
    function signaturePayload(orderId: string, paymentId: string) {
      return createHmac('sha256', KEY_SECRET)
        .update(`${orderId}|${paymentId}`)
        .digest('hex');
    }

    it('succeeds when the signature is valid', async () => {
      const adapter = new RazorpayPaymentAdapter(fullConfig());
      const signature = signaturePayload('order_abc123', 'pay_xyz789');

      const result = await adapter.confirmPayment({
        providerRef: 'order_abc123',
        payload: {
          razorpayPaymentId: 'pay_xyz789',
          razorpaySignature: signature,
        },
      });

      expect(result.success).toBe(true);
      expect(result.raw).toEqual({
        razorpayPaymentId: 'pay_xyz789',
        razorpayOrderId: 'order_abc123',
      });
    });

    it('fails when the signature does not match', async () => {
      const adapter = new RazorpayPaymentAdapter(fullConfig());

      const result = await adapter.confirmPayment({
        providerRef: 'order_abc123',
        payload: {
          razorpayPaymentId: 'pay_xyz789',
          razorpaySignature: 'tampered',
        },
      });

      expect(result.success).toBe(false);
      expect(result.failureReason).toBe(
        'Razorpay payment signature verification failed.',
      );
    });

    it('fails when the signature was computed for a different payment id', async () => {
      const adapter = new RazorpayPaymentAdapter(fullConfig());
      const signature = signaturePayload('order_abc123', 'pay_original');

      const result = await adapter.confirmPayment({
        providerRef: 'order_abc123',
        payload: {
          razorpayPaymentId: 'pay_different',
          razorpaySignature: signature,
        },
      });

      expect(result.success).toBe(false);
    });

    it('fails closed when razorpayPaymentId/razorpaySignature are missing, never throws', async () => {
      const adapter = new RazorpayPaymentAdapter(fullConfig());

      const result = await adapter.confirmPayment({
        providerRef: 'order_abc123',
      });

      expect(result.success).toBe(false);
      expect(result.failureReason).toBe(
        'Missing Razorpay payment verification fields.',
      );
    });

    it('never trusts a client-supplied simulateFailure-style field — only the signature matters', async () => {
      const adapter = new RazorpayPaymentAdapter(fullConfig());
      const signature = signaturePayload('order_abc123', 'pay_xyz789');

      const result = await adapter.confirmPayment({
        providerRef: 'order_abc123',
        payload: {
          razorpayPaymentId: 'pay_xyz789',
          razorpaySignature: signature,
          simulateFailure: true, // meaningless to this adapter — dev-adapter-only field
        },
      });

      expect(result.success).toBe(true);
    });
  });

  describe('refund', () => {
    it('converts the amount to paise and treats providerRef as a payment id', async () => {
      mockPaymentsRefund.mockResolvedValue({
        id: 'rfnd_1',
        status: 'processed',
      });
      const adapter = new RazorpayPaymentAdapter(fullConfig());

      const result = await adapter.refund({
        providerRef: 'pay_xyz789',
        amount: 250,
        currency: 'INR',
        reason: 'Return completed',
        idempotencyKey: 'refund-key-1',
      });

      expect(mockPaymentsRefund).toHaveBeenCalledWith('pay_xyz789', {
        amount: 25000,
        notes: {
          reason: 'Return completed',
          idempotencyKey: 'refund-key-1',
        },
      });
      expect(result.success).toBe(true);
      expect(result.providerRefundRef).toBe('rfnd_1');
    });

    it('reports failure when Razorpay returns a failed refund status', async () => {
      mockPaymentsRefund.mockResolvedValue({ id: 'rfnd_2', status: 'failed' });
      const adapter = new RazorpayPaymentAdapter(fullConfig());

      const result = await adapter.refund({
        providerRef: 'pay_xyz789',
        amount: 250,
        currency: 'INR',
        reason: 'Return completed',
      });

      expect(result.success).toBe(false);
      expect(result.failureReason).toBe('Razorpay refund failed.');
    });

    it('propagates Razorpay SDK/network refund failures to the caller', async () => {
      mockPaymentsRefund.mockRejectedValue(
        new Error('Razorpay refund API down'),
      );
      const adapter = new RazorpayPaymentAdapter(fullConfig());

      await expect(
        adapter.refund({
          providerRef: 'pay_xyz789',
          amount: 250,
          currency: 'INR',
          reason: 'Return completed',
        }),
      ).rejects.toThrow('Razorpay refund API down');
    });
  });

  describe('verifyWebhookSignature', () => {
    const payload = JSON.stringify({ event: 'payment.captured' });

    it('accepts a signature computed with the configured webhook secret', () => {
      const adapter = new RazorpayPaymentAdapter(fullConfig());
      const signature = createHmac('sha256', WEBHOOK_SECRET)
        .update(payload)
        .digest('hex');

      expect(adapter.verifyWebhookSignature(payload, signature)).toBe(true);
    });

    it('rejects a signature computed with the wrong secret', () => {
      const adapter = new RazorpayPaymentAdapter(fullConfig());
      const signature = createHmac('sha256', 'wrong-secret')
        .update(payload)
        .digest('hex');

      expect(adapter.verifyWebhookSignature(payload, signature)).toBe(false);
    });

    it('rejects a tampered payload even with an otherwise-valid signature', () => {
      const adapter = new RazorpayPaymentAdapter(fullConfig());
      const signature = createHmac('sha256', WEBHOOK_SECRET)
        .update(payload)
        .digest('hex');

      const tampered = JSON.stringify({ event: 'payment.failed' });
      expect(adapter.verifyWebhookSignature(tampered, signature)).toBe(false);
    });

    it('fails closed when no signature header is present', () => {
      const adapter = new RazorpayPaymentAdapter(fullConfig());
      expect(adapter.verifyWebhookSignature(payload, undefined)).toBe(false);
    });

    it('fails closed (rejects everything) when no webhook secret is configured', () => {
      const adapter = new RazorpayPaymentAdapter(
        fullConfig({ 'payments.webhookSecret': undefined }),
      );
      const signature = createHmac('sha256', 'whatever')
        .update(payload)
        .digest('hex');

      expect(adapter.verifyWebhookSignature(payload, signature)).toBe(false);
    });
  });
});
