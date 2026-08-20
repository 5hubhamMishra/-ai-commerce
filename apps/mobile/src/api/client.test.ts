import { ApiError, authApi, usersApi } from "./client";

function mockFetchOnce(status: number, body: unknown) {
  globalThis.fetch = jest.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
  }) as jest.Mock;
}

describe("authApi", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("login posts credentials and returns the real response shape", async () => {
    mockFetchOnce(200, {
      user: { id: "u1", email: "a@example.com" },
      accessToken: "access-1",
      refreshToken: "refresh-1",
    });

    const result = await authApi.login("a@example.com", "password123");

    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining("/auth/login"),
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ email: "a@example.com", password: "password123" }),
      }),
    );
    expect(result.accessToken).toBe("access-1");
  });

  it("register posts name/email/password", async () => {
    mockFetchOnce(201, {
      user: { id: "u1", email: "a@example.com" },
      accessToken: "access-1",
      refreshToken: "refresh-1",
    });

    await authApi.register("a@example.com", "password123", "Ada");

    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining("/auth/register"),
      expect.objectContaining({
        body: JSON.stringify({ email: "a@example.com", password: "password123", name: "Ada" }),
      }),
    );
  });

  it("throws an ApiError with the server's real code/message on a non-2xx response", async () => {
    mockFetchOnce(401, {
      error: { code: "INVALID_CREDENTIALS", message: "Invalid email or password.", requestId: "req-1", details: {} },
    });

    await expect(authApi.login("a@example.com", "wrong")).rejects.toMatchObject({
      code: "INVALID_CREDENTIALS",
      message: "Invalid email or password.",
    });
    await expect(authApi.login("a@example.com", "wrong")).rejects.toBeInstanceOf(ApiError);
  });

  it("falls back to a generic error when the error body isn't the documented shape", async () => {
    mockFetchOnce(500, {});
    await expect(authApi.login("a@example.com", "x")).rejects.toThrow("Request failed with status 500");
  });

  it("logout returns undefined for a 204 No Content response, not a JSON parse error", async () => {
    globalThis.fetch = jest.fn().mockResolvedValue({ ok: true, status: 204 }) as jest.Mock;
    await expect(authApi.logout("refresh-1")).resolves.toBeUndefined();
  });

  it("attaches the bearer token for authenticated requests", async () => {
    mockFetchOnce(200, { id: "u1", email: "a@example.com", name: "Ada" });
    await usersApi.me("access-token-xyz");

    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining("/users/me"),
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: "Bearer access-token-xyz" }),
      }),
    );
  });
});
