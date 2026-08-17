import { ConflictException, Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

export type IdempotentResult<T> = {
  statusCode: number;
  body: T;
};

/**
 * Enforces "a retry must not create duplicate business effects" (spec: IDEMPOTENCY)
 * for operations such as order creation, payment creation/confirmation, and refunds.
 *
 * A row is inserted as a "claim" *before* the wrapped operation runs. The unique
 * constraint on (userId, scope, key) is what actually prevents two concurrent
 * requests carrying the same key from both executing — a plain check-then-act
 * (read, see nothing, proceed) has a race window that would defeat the whole point.
 */
@Injectable()
export class IdempotencyService {
  constructor(private readonly prisma: PrismaService) {}

  async run<T>(
    userId: string,
    scope: string,
    key: string,
    operation: () => Promise<IdempotentResult<T>>,
  ): Promise<IdempotentResult<T> & { replayed: boolean }> {
    try {
      await this.prisma.idempotencyKey.create({
        data: { userId, scope, key },
      });
    } catch {
      // Unique violation: a claim already exists — either finished (replay the
      // stored response) or still in flight (tell the client to retry shortly).
      const existing = await this.prisma.idempotencyKey.findUnique({
        where: { userId_scope_key: { userId, scope, key } },
      });
      if (existing && existing.statusCode !== null) {
        return {
          statusCode: existing.statusCode,
          body: existing.responseBody as T,
          replayed: true,
        };
      }
      throw new ConflictException({
        code: 'REQUEST_IN_PROGRESS',
        message:
          'A request with this idempotency key is already being processed.',
      });
    }

    try {
      const result = await operation();
      await this.prisma.idempotencyKey.update({
        where: { userId_scope_key: { userId, scope, key } },
        data: {
          statusCode: result.statusCode,
          responseBody: result.body as Prisma.InputJsonValue,
        },
      });
      return { ...result, replayed: false };
    } catch (error) {
      // Release the claim so a genuine retry (after a transient failure) can
      // actually re-attempt the operation instead of being stuck forever.
      await this.prisma.idempotencyKey
        .delete({ where: { userId_scope_key: { userId, scope, key } } })
        .catch(() => undefined);
      throw error;
    }
  }
}
