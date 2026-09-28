import type { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule, type OpenAPIObject } from '@nestjs/swagger';

// Kept equal to the root package.json version (asserted by a unit test).
export const API_VERSION = '0.1.0';

export const OPENAPI_UI_PATH = 'docs';
export const OPENAPI_JSON_PATH = 'docs/openapi.json';

export function createOpenApiDocument(app: INestApplication): OpenAPIObject {
  const config = new DocumentBuilder()
    .setTitle('CASEFlow AI API')
    .setDescription('REST API of the CASEFlow AI I-CASE platform.')
    .setVersion(API_VERSION)
    .build();

  return SwaggerModule.createDocument(app, config);
}

// Deterministic serialization for client generation: same routes and contracts
// always produce byte-identical output.
export function renderOpenApiDocument(document: OpenAPIObject): string {
  return `${JSON.stringify(document, null, 2)}\n`;
}

// Interactive documentation is only served outside production.
export function setupOpenApi(app: INestApplication): boolean {
  if (process.env.NODE_ENV === 'production') {
    return false;
  }
  SwaggerModule.setup(OPENAPI_UI_PATH, app, createOpenApiDocument(app), {
    jsonDocumentUrl: OPENAPI_JSON_PATH,
  });
  return true;
}
