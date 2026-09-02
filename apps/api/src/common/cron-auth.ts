import { timingSafeEqual } from 'node:crypto';

export function isAuthorizedCronRequest(
  authHeader: string | string[] | undefined,
  secret: string | undefined,
): boolean {
  const normalizedSecret = secret?.trim();
  if (!normalizedSecret || typeof authHeader !== 'string') return false;

  const expected = Buffer.from(`Bearer ${normalizedSecret}`);
  const received = Buffer.from(authHeader);
  return (
    expected.length === received.length && timingSafeEqual(expected, received)
  );
}
