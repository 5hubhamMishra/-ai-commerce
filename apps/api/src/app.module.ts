import {
  MiddlewareConsumer,
  Module,
  NestModule,
  ValidationPipe,
} from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_FILTER, APP_GUARD, APP_PIPE } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AddressesModule } from './addresses/addresses.module';
import { AuditModule } from './audit/audit.module';
import { AuthModule } from './auth/auth.module';
import { GlobalExceptionFilter } from './common/filters/http-exception.filter';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { RolesGuard } from './common/guards/roles.guard';
import { RequestIdMiddleware } from './common/middleware/request-id.middleware';
import configuration from './config/configuration';
import { validateEnv } from './config/env.validation';
import { HealthModule } from './health/health.module';
import { PrismaModule } from './prisma/prisma.module';
import { ProfilesModule } from './profiles/profiles.module';
import { UsersModule } from './users/users.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
      validate: validateEnv,
    }),
    // Default rate limit; auth endpoints override with a tighter one (see auth.controller.ts).
    ThrottlerModule.forRoot({ throttlers: [{ ttl: 60_000, limit: 100 }] }),
    PrismaModule,
    AuditModule,
    HealthModule,
    AuthModule,
    UsersModule,
    ProfilesModule,
    AddressesModule,
  ],
  providers: [
    {
      provide: APP_PIPE,
      useValue: new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    },
    { provide: APP_FILTER, useClass: GlobalExceptionFilter },
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    // Order matters: authentication (who are you) must run before authorization (are you allowed).
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(RequestIdMiddleware).forRoutes('*');
  }
}
