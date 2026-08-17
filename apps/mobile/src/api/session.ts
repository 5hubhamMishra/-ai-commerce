import * as SecureStore from 'expo-secure-store';

// Device Keychain/Keystore-backed storage, not AsyncStorage — refresh tokens are long-lived
// credentials and must not sit in plaintext-readable storage (spec: SECURITY REQUIREMENTS).
const ACCESS_TOKEN_KEY = 'ai_commerce_access_token';
const REFRESH_TOKEN_KEY = 'ai_commerce_refresh_token';

export const session = {
  async save(accessToken: string, refreshToken: string): Promise<void> {
    await SecureStore.setItemAsync(ACCESS_TOKEN_KEY, accessToken);
    await SecureStore.setItemAsync(REFRESH_TOKEN_KEY, refreshToken);
  },
  getAccessToken(): Promise<string | null> {
    return SecureStore.getItemAsync(ACCESS_TOKEN_KEY);
  },
  getRefreshToken(): Promise<string | null> {
    return SecureStore.getItemAsync(REFRESH_TOKEN_KEY);
  },
  async clear(): Promise<void> {
    await SecureStore.deleteItemAsync(ACCESS_TOKEN_KEY);
    await SecureStore.deleteItemAsync(REFRESH_TOKEN_KEY);
  },
};
