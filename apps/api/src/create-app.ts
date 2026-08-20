import { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { AbstractHttpAdapter } from '@nestjs/core';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { AppModule } from './app.module';

/**
 * Shared app-construction logic between the traditional entrypoint (main.ts,
 * `app.listen()`) and the Vercel serverless entrypoint (api/index.ts, `app.init()` with
 * requests forwarded to the underlying Express instance) — kept in one place so the two
 * never drift (helmet/CORS/prefix config previously only lived in main.ts).
 */
export async function createApp(
  httpAdapter?: AbstractHttpAdapter,
): Promise<INestApplication> {
  const app = httpAdapter
    ? await NestFactory.create(AppModule, httpAdapter)
    : await NestFactory.create(AppModule);
  const config = app.get(ConfigService);

  app.use(helmet());
  app.use(cookieParser());
  app.enableCors({
    origin: config.get<string>('webOrigin'),
    credentials: true,
  });
  // Health checks stay unversioned so load balancers/orchestrators don't need to track API versions.
  app.setGlobalPrefix('api/v1', { exclude: ['health', 'ready'] });

  return app;
}
