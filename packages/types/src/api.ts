/** Matches the API error contract in docs/API.md — every endpoint fails in this shape. */
export type ApiError = {
  error: {
    code: string;
    message: string;
    requestId: string;
    details: Record<string, unknown>;
  };
};

export type AuthTokens = {
  accessToken: string;
  refreshToken: string;
};
