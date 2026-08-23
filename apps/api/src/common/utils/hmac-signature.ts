import { createHmac, timingSafeEqual } from 'node:crypto';

/** Shared by every payment provider adapter's webhook verification (dev-simulated and real):
 *  `HMAC-SHA256(secret, payload)` hex digest, compared in constant time. Fails closed (false)
 *  when the secret or signature is missing — never treats "unconfigured" as "trust everything". */
export function verifyHmacSignature(
  secret: string | undefined,
  payload: string,
  signature: string | undefined,
): boolean {
  if (!secret || !signature) return false;

  const expected = createHmac('sha256', secret).update(payload).digest('hex');
  const expectedBuf = Buffer.from(expected, 'hex');
  const signatureBuf = Buffer.from(signature, 'hex');
  if (expectedBuf.length !== signatureBuf.length) return false;
  return timingSafeEqual(expectedBuf, signatureBuf);
}
