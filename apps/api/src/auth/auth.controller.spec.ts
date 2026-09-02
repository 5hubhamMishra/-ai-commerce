import { AuthController } from './auth.controller';

describe('AuthController refresh cookie policy', () => {
  const originalNodeEnv = process.env.NODE_ENV;
  const setRefreshCookie = (
    controller: AuthController,
    response: { cookie: jest.Mock },
  ) =>
    (
      controller as unknown as {
        setRefreshCookie: (res: typeof response, token: string) => void;
      }
    ).setRefreshCookie(response, 'refresh-token');

  afterEach(() => {
    process.env.NODE_ENV = originalNodeEnv;
  });

  it('allows credentialed cross-origin refreshes in production', () => {
    process.env.NODE_ENV = 'production';
    const response = { cookie: jest.fn() };

    setRefreshCookie(new AuthController({} as never), response);

    expect(response.cookie).toHaveBeenCalledWith(
      'refresh_token',
      'refresh-token',
      expect.objectContaining({
        httpOnly: true,
        secure: true,
        sameSite: 'none',
      }),
    );
  });

  it('keeps local HTTP development compatible with browser cookie rules', () => {
    process.env.NODE_ENV = 'development';
    const response = { cookie: jest.fn() };

    setRefreshCookie(new AuthController({} as never), response);

    expect(response.cookie).toHaveBeenCalledWith(
      'refresh_token',
      'refresh-token',
      expect.objectContaining({ secure: false, sameSite: 'lax' }),
    );
  });
});
