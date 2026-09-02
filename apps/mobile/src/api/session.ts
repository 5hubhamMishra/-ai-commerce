import * as SecureStore from 'expo-secure-store';

// Device Keychain/Keystore-backed storage, not AsyncStorage — refresh tokens are long-lived
// credentials and must not sit in plaintext-readable storage (spec: SECURITY REQUIREMENTS).
const ACCESS_TOKEN_KEY = 'ai_commerce_access_token';
const REFRESH_TOKEN_KEY = 'ai_commerce_refresh_token';

let storageQueue = Promise.resolve();

function enqueue<T>(operation: () => Promise<T>): Promise<T> {
  const next = storageQueue.then(operation, operation);
  storageQueue = next.then(() => undefined, () => undefined);
  return next;
}

export const session = {
  save(accessToken: string, refreshToken: string): Promise<void> {
    return enqueue(async () => {
      await SecureStore.setItemAsync(ACCESS_TOKEN_KEY, accessToken);
      await SecureStore.setItemAsync(REFRESH_TOKEN_KEY, refreshToken);
    });
  },
  getAccessToken(): Promise<string | null> {
    return enqueue(() => SecureStore.getItemAsync(ACCESS_TOKEN_KEY));
  },
  getRefreshToken(): Promise<string | null> {
    return enqueue(() => SecureStore.getItemAsync(REFRESH_TOKEN_KEY));
  },
  clear(): Promise<void> {
    return enqueue(async () => {
      await SecureStore.deleteItemAsync(ACCESS_TOKEN_KEY);
      await SecureStore.deleteItemAsync(REFRESH_TOKEN_KEY);
    });
  },
};
