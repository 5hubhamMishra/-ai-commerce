import configuration from './configuration';

describe('configuration', () => {
  const keys = ['NODE_ENV', 'EMBEDDING_PROVIDER', 'PAYMENT_PROVIDER'];
  const original = Object.fromEntries(
    keys.map((key) => [key, process.env[key]]),
  );

  afterEach(() => {
    for (const key of keys) {
      const value = original[key];
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  it('trims mode and provider selectors before runtime wiring uses them', () => {
    process.env.NODE_ENV = ' production ';
    process.env.EMBEDDING_PROVIDER = ' openai ';
    process.env.PAYMENT_PROVIDER = ' razorpay ';

    expect(configuration()).toMatchObject({
      env: 'production',
      embeddings: { provider: 'openai' },
      payments: { provider: 'razorpay' },
    });
  });
});
