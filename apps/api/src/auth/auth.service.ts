import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService, type JwtSignOptions } from '@nestjs/jwt';
import { Role } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { createHash, randomBytes } from 'crypto';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import type { LoginDto } from './dto/login.dto';
import type { RegisterDto } from './dto/register.dto';

const BCRYPT_ROUNDS = 12;

type TokenPair = { accessToken: string; refreshToken: string };
type PublicUser = { id: string; email: string; name: string; roles: Role[] };

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly audit: AuditService,
  ) {}

  async register(dto: RegisterDto): Promise<TokenPair & { user: PublicUser }> {
    const email = dto.email.toLowerCase();
    const existing = await this.prisma.user.findUnique({ where: { email } });
    if (existing) {
      throw new ConflictException({
        code: 'EMAIL_ALREADY_REGISTERED',
        message: 'An account with this email already exists.',
      });
    }

    const passwordHash = await bcrypt.hash(dto.password, BCRYPT_ROUNDS);

    const user = await this.prisma.user.create({
      data: {
        email,
        passwordHash,
        name: dto.name,
        roles: { create: { role: Role.CUSTOMER } },
        profile: { create: {} },
      },
      include: { roles: true },
    });

    await this.audit.record({
      actorId: user.id,
      action: 'USER_REGISTERED',
      entityType: 'user',
      entityId: user.id,
    });

    const tokens = await this.issueTokens(user.id, user.email);
    return { user: this.toPublicUser(user), ...tokens };
  }

  async login(dto: LoginDto): Promise<TokenPair & { user: PublicUser }> {
    const email = dto.email.toLowerCase();
    const user = await this.prisma.user.findUnique({
      where: { email },
      include: { roles: true },
    });

    // Same error for "no such account" and "wrong password" — never reveal account existence.
    const invalidCredentials = () => {
      // Failed attempts are audited (no actorId — the caller isn't authenticated) so
      // credential-stuffing/brute-force patterns are visible after the fact, not just
      // throttled in the moment. The attempted email is logged deliberately: it's the
      // one signal that lets an admin see which accounts are being targeted.
      void this.audit.record({
        action: 'USER_LOGIN_FAILED',
        entityType: 'user',
        entityId: user?.id ?? null,
        metadata: { email },
      });
      return new UnauthorizedException({
        code: 'INVALID_CREDENTIALS',
        message: 'Incorrect email or password.',
      });
    };

    if (!user || !user.isActive || user.deletedAt) throw invalidCredentials();

    const valid = await bcrypt.compare(dto.password, user.passwordHash);
    if (!valid) throw invalidCredentials();

    const tokens = await this.issueTokens(user.id, user.email);
    await this.audit.record({
      actorId: user.id,
      action: 'USER_LOGIN',
      entityType: 'user',
      entityId: user.id,
    });
    return { user: this.toPublicUser(user), ...tokens };
  }

  /**
   * Refresh-token rotation: the presented token is always revoked, whether or not the
   * request succeeds. If it had already been revoked, that's a reuse/theft signal, so the
   * entire session chain for that user is revoked rather than just failing this one request.
   */
  async refresh(presentedToken: string): Promise<TokenPair> {
    const tokenHash = this.hashToken(presentedToken);
    const record = await this.prisma.refreshToken.findUnique({
      where: { tokenHash },
    });

    const invalid = () =>
      new UnauthorizedException({
        code: 'INVALID_REFRESH_TOKEN',
        message: 'Session expired. Please log in again.',
      });

    if (!record) throw invalid();

    if (record.revokedAt) {
      // A revoked token being presented again is a theft signal, not a routine error —
      // revoke the whole session chain and audit it so it's visible to security monitoring,
      // not just silently absorbed as another 401.
      await this.prisma.refreshToken.updateMany({
        where: { userId: record.userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      await this.audit.record({
        actorId: record.userId,
        action: 'REFRESH_TOKEN_REUSE_DETECTED',
        entityType: 'user',
        entityId: record.userId,
        metadata: { refreshTokenId: record.id },
      });
      throw invalid();
    }

    if (record.expiresAt < new Date()) throw invalid();

    await this.prisma.refreshToken.update({
      where: { id: record.id },
      data: { revokedAt: new Date() },
    });

    const user = await this.prisma.user.findUnique({
      where: { id: record.userId },
      select: {
        id: true,
        email: true,
        isActive: true,
        deletedAt: true,
      },
    });
    if (!user || !user.isActive || user.deletedAt) throw invalid();

    return this.issueTokens(user.id, user.email);
  }

  async logout(presentedToken: string): Promise<void> {
    const tokenHash = this.hashToken(presentedToken);
    await this.prisma.refreshToken.updateMany({
      where: { tokenHash, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  private async issueTokens(userId: string, email: string): Promise<TokenPair> {
    // Cast at the config boundary: the underlying `ms` duration-string type can't be
    // inferred from a generic env-sourced string, but jsonwebtoken validates it at runtime.
    const accessTtl = this.config.get<string>(
      'jwt.accessTtl',
    ) as JwtSignOptions['expiresIn'];
    const accessToken = await this.jwt.signAsync(
      { sub: userId, email },
      {
        secret: this.config.get<string>('jwt.accessSecret'),
        expiresIn: accessTtl,
      },
    );

    const refreshToken = randomBytes(48).toString('hex');
    const refreshTtlDays = this.config.get<number>('jwt.refreshTtlDays')!;
    const expiresAt = new Date(
      Date.now() + refreshTtlDays * 24 * 60 * 60 * 1000,
    );

    await this.prisma.refreshToken.create({
      data: { userId, tokenHash: this.hashToken(refreshToken), expiresAt },
    });

    return { accessToken, refreshToken };
  }

  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  private toPublicUser(user: {
    id: string;
    email: string;
    name: string;
    roles: { role: Role }[];
  }): PublicUser {
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      roles: user.roles.map((r) => r.role),
    };
  }
}
