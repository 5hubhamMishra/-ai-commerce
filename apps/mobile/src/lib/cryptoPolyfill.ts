import { randomUUID } from 'expo-crypto';

// React Native's Hermes JS engine does not ship a global `crypto` object — nothing in RN's JS
// core installs one, unlike a browser or Node.js. packages/api-client's orders.ts and
// payments.ts call `crypto.randomUUID()` directly for the Idempotency-Key header; this has
// always worked invisibly in Jest (Node's real WebCrypto) and in apps/web's browser, but would
// throw `crypto.randomUUID is not a function` on a real device/simulator without this. Must be
// installed before any code that might reach packages/api-client — see apps/mobile/index.ts,
// which imports this module first, before App.

type CryptoLike = { randomUUID?: () => string };

// Exported separately so Jest can exercise the branching logic directly (see
// cryptoPolyfill.test.ts) without depending on expo-crypto's native linkage, which Jest can
// never faithfully simulate — Node already has a real global crypto.randomUUID, so the
// "install" branch below is structurally unreachable when this whole file runs under Jest.
export function installCryptoPolyfill(target: { crypto?: CryptoLike }, provideRandomUUID: () => string): void {
  if (!target.crypto) target.crypto = {};
  // Feature-detected: only installs if missing, so this becomes a silent no-op the moment a
  // future RN/Hermes version ships native support.
  if (typeof target.crypto.randomUUID !== 'function') {
    target.crypto.randomUUID = provideRandomUUID;
  }
}

installCryptoPolyfill(globalThis as { crypto?: CryptoLike }, randomUUID);
