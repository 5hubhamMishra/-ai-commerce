import { authApi, configureApiClient } from '@ai-commerce/api-client';
import { session } from './session';
import { configureMobileApiClient, getAccessToken, mobileRefresh, setAccessToken } from './apiClient';

jest.mock('@ai-commerce/api-client', () => ({
  authApi: { refresh: jest.fn() },
  configureApiClient: jest.fn(),
}));
jest.mock('./session', () => ({
  session: { save: jest.fn(), getRefreshToken: jest.fn() },
}));

describe('apiClient', () => {
  afterEach(() => {
    jest.clearAllMocks();
    setAccessToken(null);
  });

  describe('mobileRefresh', () => {
    it('resolves null without calling the API when there is no stored refresh token', async () => {
      (session.getRefreshToken as jest.Mock).mockResolvedValue(null);

      await expect(mobileRefresh()).resolves.toBeNull();
      expect(authApi.refresh).not.toHaveBeenCalled();
    });

    it('exchanges the stored refresh token and persists the rotated pair on success', async () => {
      (session.getRefreshToken as jest.Mock).mockResolvedValue('refresh-old');
      (authApi.refresh as jest.Mock).mockResolvedValue({
        accessToken: 'access-new',
        refreshToken: 'refresh-new',
      });

      await expect(mobileRefresh()).resolves.toBe('access-new');
      expect(authApi.refresh).toHaveBeenCalledWith('refresh-old');
      expect(session.save).toHaveBeenCalledWith('access-new', 'refresh-new');
      expect(getAccessToken()).toBe('access-new');
    });

    it('resolves null instead of throwing when the refresh call fails', async () => {
      (session.getRefreshToken as jest.Mock).mockResolvedValue('refresh-old');
      (authApi.refresh as jest.Mock).mockRejectedValue(new Error('expired'));

      await expect(mobileRefresh()).resolves.toBeNull();
      expect(session.save).not.toHaveBeenCalled();
    });
  });

  describe('getAccessToken/setAccessToken', () => {
    it('reads back whatever was last set, in-memory only', () => {
      expect(getAccessToken()).toBeNull();
      setAccessToken('token-1');
      expect(getAccessToken()).toBe('token-1');
    });
  });

  describe('configureMobileApiClient', () => {
    it('wires the shared api-client with mobile transport (refresh + base URL) and the given onAuthExpired', () => {
      const onAuthExpired = jest.fn();
      configureMobileApiClient(onAuthExpired);

      expect(configureApiClient).toHaveBeenCalledWith(
        expect.objectContaining({
          getAccessToken,
          setAccessToken,
          onAuthExpired,
          refresh: mobileRefresh,
        }),
      );
    });
  });
});
