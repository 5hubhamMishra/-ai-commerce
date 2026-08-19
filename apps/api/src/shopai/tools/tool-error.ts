import { HttpException } from '@nestjs/common';

/** Extracts a compact, safe-to-show message from a thrown NestJS exception
 *  — never the raw stack trace or internal error shape, matching the
 *  "sanitized result" step of the tool-calling pipeline. */
export function describeError(error: unknown): string {
  if (error instanceof HttpException) {
    const body = error.getResponse();
    if (typeof body === 'object' && body !== null && 'message' in body) {
      const message = (body as { message?: unknown }).message;
      if (typeof message === 'string') return message;
    }
    return error.message;
  }
  if (error instanceof Error) return error.message;
  return 'An unexpected error occurred.';
}
