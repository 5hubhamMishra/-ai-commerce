import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const config = app.get(ConfigService);

  app.use(helmet());
  app.use(cookieParser());
  app.enableCors({
    origin: config.get<string>('webOrigin'),
    credentials: true,
  });
  // Health checks stay unversioned so load balancers/orchestrators don't need to track API versions.
  app.setGlobalPrefix('api/v1', { exclude: ['health', 'ready'] });

  const port = config.get<number>('port') ?? 4000;
  await app.listen(port);

  console.log(`AI-Commerce API listening on http://localhost:${port}/api/v1`);
}

bootstrap().catch((error: unknown) => {
  console.error('AI-Commerce API failed to start:', error);
  process.exit(1);
});
