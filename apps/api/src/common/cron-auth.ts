export function isAuthorizedCronRequest(
  authHeader: string | string[] | undefined,
  secret: string | undefined,
): boolean {
  const normalizedSecret = secret?.trim();
  return Boolean(
    normalizedSecret &&
    typeof authHeader === 'string' &&
    authHeader === `Bearer ${normalizedSecret}`,
  );
}
