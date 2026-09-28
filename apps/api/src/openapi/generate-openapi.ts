import 'reflect-metadata';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { createOpenApiDocument, renderOpenApiDocument } from './openapi';

// Writes the OpenAPI document without starting the HTTP server or opening a
// database connection (Nest preview mode does not instantiate providers).
//
// Usage: node dist/openapi/generate-openapi.js [outputPath]
// Default output: openapi/openapi.json relative to the current directory.
async function generate(): Promise<void> {
  const outputPath = resolve(process.argv[2] ?? 'openapi/openapi.json');
  const app = await NestFactory.create(AppModule, {
    preview: true,
    abortOnError: false,
    logger: false,
  });

  const document = createOpenApiDocument(app);
  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, renderOpenApiDocument(document), 'utf8');
  console.log(`OpenAPI document written to ${outputPath}`);
}

generate().catch((error: unknown) => {
  console.error('Failed to generate the OpenAPI document:');
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
