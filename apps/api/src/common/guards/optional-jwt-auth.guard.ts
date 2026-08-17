import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

/**
 * For routes that must work for anonymous visitors but should still identify
 * a logged-in caller when possible (the behavioral event collector — spec:
 * "anonymous tracking" alongside "user sessions"). Combine with `@Public()`
 * (bypasses the mandatory global JwtAuthGuard) plus
 * `@UseGuards(OptionalJwtAuthGuard)` on the same route: this guard still runs
 * the real Passport JWT strategy and populates `request.user` when a valid
 * token is present, but — unlike the default `AuthGuard('jwt')` — never
 * throws and never blocks the request when the token is missing, expired, or
 * otherwise invalid. The request-supplied `userId` this makes available is
 * never trusted for anything security-sensitive; it exists only to
 * optionally attribute an already-anonymous-safe write (a behavioral event)
 * to a real identity when one is genuinely proven.
 */
@Injectable()
export class OptionalJwtAuthGuard extends AuthGuard('jwt') {
  handleRequest<TUser = unknown>(_err: unknown, user: TUser): TUser {
    return user;
  }
}
