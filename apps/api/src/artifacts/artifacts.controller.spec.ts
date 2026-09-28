import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { ArtifactsController } from './artifacts.controller';
import { ArtifactsService } from './artifacts.service';

const projectId = '7b1d3c4e-5f60-4a71-8b92-a3b4c5d6e7f8';
const artifactId = '9c2e4d5f-6071-4b82-9ca3-b4c5d6e7f809';

describe('ArtifactsController (validation and routing)', () => {
  let app: INestApplication;
  const service = { createArtifact: vi.fn(), getArtifact: vi.fn(), createVersion: vi.fn() };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [ArtifactsController],
      providers: [{ provide: ArtifactsService, useValue: service }],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
  });

  beforeEach(() => {
    vi.resetAllMocks();
  });

  afterAll(async () => {
    await app.close();
  });

  it('POST creates a MANUAL artifact: the body cannot set origin or status', async () => {
    service.createArtifact.mockResolvedValue({ id: artifactId });

    const ok = await request(app.getHttpServer())
      .post(`/projects/${projectId}/artifacts`)
      .send({ type: 'REQUIREMENT', title: 'RF' });
    const smuggled = await request(app.getHttpServer())
      .post(`/projects/${projectId}/artifacts`)
      .send({ type: 'REQUIREMENT', title: 'RF', origin: 'AI_GENERATED' });

    expect(ok.status).toBe(201);
    expect(service.createArtifact).toHaveBeenCalledTimes(1);
    expect(service.createArtifact).toHaveBeenCalledWith(projectId, {
      type: 'REQUIREMENT',
      title: 'RF',
      metadataAuxiliary: {},
    });
    expect(smuggled.status).toBe(400);
  });

  it('GET requires both ids to be UUIDs and always passes the project scope', async () => {
    service.getArtifact.mockResolvedValue({ id: artifactId });

    const bad = await request(app.getHttpServer()).get(`/projects/${projectId}/artifacts/nope`);
    const ok = await request(app.getHttpServer()).get(
      `/projects/${projectId}/artifacts/${artifactId}`,
    );

    expect(bad.status).toBe(400);
    expect(ok.status).toBe(200);
    expect(service.getArtifact).toHaveBeenCalledTimes(1);
    expect(service.getArtifact).toHaveBeenCalledWith(projectId, artifactId);
  });

  it('POST versions validates the body and passes the project scope', async () => {
    service.createVersion.mockResolvedValue({ versionNumber: 2 });

    const ok = await request(app.getHttpServer())
      .post(`/projects/${projectId}/artifacts/${artifactId}/versions`)
      .send({ title: 'v2' });
    const invalid = await request(app.getHttpServer())
      .post(`/projects/${projectId}/artifacts/${artifactId}/versions`)
      .send({ title: '' });

    expect(ok.status).toBe(201);
    expect(service.createVersion).toHaveBeenCalledTimes(1);
    expect(service.createVersion).toHaveBeenCalledWith(projectId, artifactId, {
      title: 'v2',
      metadataAuxiliary: {},
    });
    expect(invalid.status).toBe(400);
  });
});
