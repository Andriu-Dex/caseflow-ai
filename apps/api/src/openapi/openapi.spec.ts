import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { OpenAPIObject } from '@nestjs/swagger';
import {
  createArtifactRequestSchema,
  createArtifactVersionRequestSchema,
  createProjectRequestSchema,
  projectContextRequestSchema,
} from '@caseflow-ai/contracts';
import request from 'supertest';
import { afterEach, describe, expect, it } from 'vitest';
import { AppModule } from '../app.module';
import { PrismaService } from '../database/prisma.service';
import {
  API_VERSION,
  createOpenApiDocument,
  OPENAPI_JSON_PATH,
  renderOpenApiDocument,
  setupOpenApi,
} from './openapi';
import { toOpenApiSchema } from './zod-openapi';

// The real application modules are used; only the database client is replaced,
// so the document is generated without any infrastructure.
async function createApp(): Promise<INestApplication> {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(PrismaService)
    .useValue({})
    .compile();
  return moduleRef.createNestApplication();
}

const PROJECT = '/projects/{projectId}';
const ARTIFACTS = '/projects/{projectId}/artifacts';
const ARTIFACT = '/projects/{projectId}/artifacts/{artifactId}';
const VERSIONS = '/projects/{projectId}/artifacts/{artifactId}/versions';
const CONTEXT = '/projects/{projectId}/context';
const CONTEXT_VERSIONS = '/projects/{projectId}/context/versions';

describe('OpenAPI contract', () => {
  let app: INestApplication;
  let document: OpenAPIObject;
  const originalEnv = process.env.NODE_ENV;

  afterEach(async () => {
    process.env.NODE_ENV = originalEnv;
    await app.close();
  });

  async function load(): Promise<OpenAPIObject> {
    app = await createApp();
    document = createOpenApiDocument(app);
    return document;
  }

  const operation = (path: string, method: string) => {
    // The OpenAPI document is navigated as loosely typed JSON in these assertions.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const item = document.paths[path] as Record<string, any> | undefined;
    return item?.[method];
  };

  it('documents exactly the implemented routes and methods', async () => {
    await load();

    const routes = Object.entries(document.paths)
      .flatMap(([path, item]) =>
        Object.keys(item)
          .filter((key) => ['get', 'post', 'put', 'patch', 'delete'].includes(key))
          .map((method) => `${method.toUpperCase()} ${path}`),
      )
      .sort();

    expect(routes).toEqual(
      [
        'GET /health/live',
        'POST /projects',
        'GET /projects',
        `GET ${PROJECT}`,
        `POST ${ARTIFACTS}`,
        `GET ${ARTIFACT}`,
        `POST ${VERSIONS}`,
        `GET ${CONTEXT}`,
        `POST ${CONTEXT}`,
        `POST ${CONTEXT_VERSIONS}`,
        'GET /projects/{projectId}/requirements',
        'GET /projects/{projectId}/requirements/generations/{generationId}',
        'GET /projects/{projectId}/requirements/{requirementId}',
        'POST /projects/{projectId}/requirements',
        'POST /projects/{projectId}/requirements/generate',
        'POST /projects/{projectId}/requirements/generations/{generationId}/accept',
        'POST /projects/{projectId}/requirements/{requirementId}/versions',
        'POST /projects/{projectId}/requirements/{requirementId}/versions/{versionId}/transition',
      ].sort(),
    );
    expect(Object.keys(document.paths)).not.toContain('/health/ready');
  });

  it('describes the API with a stable version and unique operation ids', async () => {
    await load();

    expect(document.openapi).toMatch(/^3\./);
    expect(document.info.version).toBe(API_VERSION);
    const rootPackage = JSON.parse(
      readFileSync(join(__dirname, '..', '..', '..', '..', 'package.json'), 'utf8'),
    ) as { version: string };
    expect(API_VERSION).toBe(rootPackage.version);

    const ids = Object.values(document.paths).flatMap((item) =>
      Object.values(item as Record<string, { operationId?: string }>).map((op) => op.operationId),
    );
    expect(ids.sort()).toEqual([
      'acceptRequirementCandidates',
      'createArtifact',
      'createArtifactVersion',
      'createProject',
      'createProjectContext',
      'createProjectContextVersion',
      'createRequirement',
      'createRequirementVersion',
      'generateRequirements',
      'getArtifact',
      'getHealthLive',
      'getProject',
      'getProjectContext',
      'getRequirement',
      'getRequirementGeneration',
      'listProjects',
      'listRequirements',
      'transitionArtifactVersion',
    ]);
  });

  it('derives request bodies from the zod contracts, so they cannot diverge', async () => {
    await load();
    const body = (path: string) =>
      operation(path, 'post').requestBody.content['application/json'].schema;

    expect(body('/projects')).toEqual(toOpenApiSchema(createProjectRequestSchema, 'input'));
    expect(body(ARTIFACTS)).toEqual(toOpenApiSchema(createArtifactRequestSchema, 'input'));
    expect(body(VERSIONS)).toEqual(toOpenApiSchema(createArtifactVersionRequestSchema, 'input'));
    expect(body(CONTEXT)).toEqual(toOpenApiSchema(projectContextRequestSchema, 'input'));
    expect(body(CONTEXT_VERSIONS)).toEqual(toOpenApiSchema(projectContextRequestSchema, 'input'));

    expect(body('/projects').required).toEqual(['workspaceId', 'name']);
    expect(body(ARTIFACTS).required).toEqual(['type', 'title']);
    expect(body(ARTIFACTS).additionalProperties).toBe(false);
  });

  it('does not expose the artifact code prefix, status or origin as request fields', async () => {
    await load();
    const properties = Object.keys(
      operation(ARTIFACTS, 'post').requestBody.content['application/json'].schema.properties,
    );

    expect(properties.sort()).toEqual(['metadataAuxiliary', 'title', 'type']);
  });

  it('documents path and query parameters', async () => {
    await load();
    const params = (path: string, method: string) =>
      operation(path, method).parameters.map(
        (p: { name: string; in: string; required: boolean }) => `${p.in}:${p.name}:${p.required}`,
      );

    expect(params(PROJECT, 'get')).toEqual(['path:projectId:true']);
    expect(params(ARTIFACT, 'get').sort()).toEqual(['path:artifactId:true', 'path:projectId:true']);
    expect(params(VERSIONS, 'post').sort()).toEqual([
      'path:artifactId:true',
      'path:projectId:true',
    ]);
    expect(params(CONTEXT, 'get')).toEqual(['path:projectId:true']);
    expect(params(CONTEXT_VERSIONS, 'post')).toEqual(['path:projectId:true']);
    expect(params('/projects', 'get').sort()).toEqual([
      'query:limit:false',
      'query:offset:false',
      'query:workspaceId:true',
    ]);
    const projectId = operation(PROJECT, 'get').parameters[0];
    expect(projectId.schema).toMatchObject({ type: 'string', format: 'uuid' });
  });

  it('documents success and error status codes per operation', async () => {
    await load();
    const statuses = (path: string, method: string) =>
      Object.keys(operation(path, method).responses).sort();

    expect(statuses('/health/live', 'get')).toEqual(['200']);
    expect(statuses('/projects', 'post')).toEqual(['201', '400', '404']);
    expect(statuses('/projects', 'get')).toEqual(['200', '400']);
    expect(statuses(PROJECT, 'get')).toEqual(['200', '400', '404']);
    expect(statuses(ARTIFACTS, 'post')).toEqual(['201', '400', '404', '422']);
    expect(statuses(ARTIFACT, 'get')).toEqual(['200', '400', '404']);
    expect(statuses(VERSIONS, 'post')).toEqual(['201', '400', '404']);
    expect(statuses(CONTEXT, 'post')).toEqual(['201', '400', '404', '409']);
    expect(statuses(CONTEXT, 'get')).toEqual(['200', '400', '404']);
    expect(statuses(CONTEXT_VERSIONS, 'post')).toEqual(['201', '400', '404']);
  });

  it('describes response schemas', async () => {
    await load();
    const schema = (path: string, method: string, status: string) =>
      operation(path, method).responses[status].content['application/json'].schema;

    expect(schema('/health/live', 'get', '200').required).toEqual(['status']);
    expect(schema('/projects', 'post', '201').required).toEqual(
      expect.arrayContaining(['id', 'workspaceId', 'name', 'createdAt']),
    );
    expect(Object.keys(schema('/projects', 'get', '200').properties)).toEqual([
      'items',
      'limit',
      'offset',
    ]);
    const artifact = schema(ARTIFACTS, 'post', '201');
    expect(artifact.properties.currentVersion.properties.status.enum).toEqual([
      'DRAFT',
      'GENERATED',
      'IN_REVIEW',
      'APPROVED',
      'CHANGES_REQUESTED',
    ]);
    expect(schema(VERSIONS, 'post', '201').properties.versionNumber.type).toBe('integer');
    expect(schema(ARTIFACT, 'get', '404').properties.message.type).toBe('string');
    expect(schema(CONTEXT, 'post', '201').properties.type.enum).toEqual(['PROJECT_CONTEXT']);
    expect(
      schema(CONTEXT, 'post', '201').properties.scopeItems.items.properties.position.type,
    ).toBe('integer');
  });

  it('does not leak database or implementation internals', async () => {
    await load();
    const text = JSON.stringify(document);

    expect(text).not.toMatch(/prisma|artifact_versions|workspace_id|project_code_counters|stack/i);
  });

  it('renders deterministically for client generation', async () => {
    await load();
    const first = renderOpenApiDocument(document);
    await app.close();
    app = await createApp();
    const second = renderOpenApiDocument(createOpenApiDocument(app));

    expect(second).toBe(first);
    expect(JSON.parse(first)).toEqual(document);
  });

  it('serves interactive docs and the JSON document outside production', async () => {
    process.env.NODE_ENV = 'development';
    app = await createApp();
    expect(setupOpenApi(app)).toBe(true);
    await app.init();

    const json = await request(app.getHttpServer()).get(`/${OPENAPI_JSON_PATH}`);
    expect(json.status).toBe(200);
    expect(Object.keys(json.body.paths)).toContain('/projects');
  });

  it('serves no interactive docs in production', async () => {
    process.env.NODE_ENV = 'production';
    app = await createApp();
    expect(setupOpenApi(app)).toBe(false);
    await app.init();

    const json = await request(app.getHttpServer()).get(`/${OPENAPI_JSON_PATH}`);
    const ui = await request(app.getHttpServer()).get('/docs');
    expect(json.status).toBe(404);
    expect(ui.status).toBe(404);
  });
});
