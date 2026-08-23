import { installCryptoPolyfill } from './cryptoPolyfill';

// This only proves the polyfill's own install/skip branching logic is correct — it cannot and
// does not prove expo-crypto's native ExpoCrypto.randomUUID() binding actually works at
// runtime. Node's Jest environment already has a real global crypto.randomUUID, so the
// "install" branch would never even be reached if this file imported the real module import at
// the top level instead of exercising installCryptoPolyfill directly with a fake target.
describe('installCryptoPolyfill', () => {
  it('installs randomUUID when the target has no crypto object at all', () => {
    const target: { crypto?: { randomUUID?: () => string } } = {};
    const provide = jest.fn(() => 'fake-uuid');

    installCryptoPolyfill(target, provide);

    expect(target.crypto?.randomUUID?.()).toBe('fake-uuid');
  });

  it('installs randomUUID when crypto exists but randomUUID is missing', () => {
    const target: { crypto?: { randomUUID?: () => string } } = { crypto: {} };

    installCryptoPolyfill(target, () => 'fake-uuid');

    expect(target.crypto?.randomUUID?.()).toBe('fake-uuid');
  });

  it('does not overwrite an existing native randomUUID', () => {
    const native = () => 'native-uuid';
    const target = { crypto: { randomUUID: native } };

    installCryptoPolyfill(target, () => 'fake-uuid');

    expect(target.crypto.randomUUID).toBe(native);
  });
});
