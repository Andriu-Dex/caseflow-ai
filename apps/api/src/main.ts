import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { setupOpenApi } from './openapi/openapi';
import cookieParser from 'cookie-parser';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { configureBodyLimits } from './common/body-limits';
import { trustProxySetting } from './common/trust-proxy';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  configureBodyLimits(app);
  // The client address (rate limits) is the connection's unless the proxies are named.
  const trustedProxies = trustProxySetting(process.env.TRUSTED_PROXIES);
  if (trustedProxies !== undefined) app.set('trust proxy', trustedProxies);
  app.use(cookieParser());
  // Ensures the Prisma client disconnects cleanly on SIGTERM/SIGINT.
  app.enableShutdownHooks();
  // The web app is a separate origin in local dev (port 3000 vs 3001) and in
  // any real deployment; restrict to the configured origin, never a wildcard.
  app.enableCors({
    origin: process.env.WEB_ORIGIN ?? 'http://localhost:3000',
    credentials: true,
  });
  // Interactive docs at /docs and JSON at /docs/openapi.json, non-production only.
  setupOpenApi(app);
  const port = Number(process.env.API_PORT ?? 3001);
  // API_HOST=127.0.0.1 keeps the desktop edition's API off the network.
  await app.listen(port, process.env.API_HOST ?? '0.0.0.0');
}

void bootstrap();
