import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { PrismaService } from '../../prisma/prisma.service';
import type { AuthenticatedUser } from '../../common/types/authenticated-user';

type AccessTokenPayload = { sub: string; email: string };

/**
 * Roles are looked up fresh from the database on every request rather than embedded in the
 * JWT payload, so a role change or deactivation takes effect immediately instead of waiting
 * for the (short-lived) access token to expire.
 */
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    config: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.get<string>('jwt.accessSecret')!,
    });
  }

  async validate(payload: AccessTokenPayload): Promise<AuthenticatedUser> {
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      include: { roles: true },
    });
    if (!user || !user.isActive || user.deletedAt) {
      throw new UnauthorizedException({
        code: 'SESSION_INVALID',
        message: 'Session is no longer valid.',
      });
    }
    return {
      id: user.id,
      email: user.email,
      roles: user.roles.map((r) => r.role),
    };
  }
}
