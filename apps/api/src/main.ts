import { ConfigService } from '@nestjs/config';
import { createApp } from './create-app';

async function bootstrap() {
  const app = await createApp();
  const config = app.get(ConfigService);

  const port = config.get<number>('port') ?? 4000;
  await app.listen(port);

  console.log(`AI-Commerce API listening on http://localhost:${port}/api/v1`);
}

bootstrap().catch((error: unknown) => {
  console.error('AI-Commerce API failed to start:', error);
  process.exit(1);
});
