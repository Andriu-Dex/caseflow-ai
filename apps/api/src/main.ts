import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { setupOpenApi } from './openapi/openapi';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  // Ensures the Prisma client disconnects cleanly on SIGTERM/SIGINT.
  app.enableShutdownHooks();
  // Interactive docs at /docs and JSON at /docs/openapi.json, non-production only.
  setupOpenApi(app);
  const port = Number(process.env.API_PORT ?? 3001);
  await app.listen(port);
}

void bootstrap();
