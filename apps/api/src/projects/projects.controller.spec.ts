import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { ProjectsController } from './projects.controller';
import { ProjectsService } from './projects.service';

const workspaceId = '2f0c5f5e-3c7d-4a8e-9a55-1f6f0f3f6a11';
const projectId = '7b1d3c4e-5f60-4a71-8b92-a3b4c5d6e7f8';

describe('ProjectsController (validation and routing)', () => {
  let app: INestApplication;
  const service = { create: vi.fn(), list: vi.fn(), get: vi.fn() };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [ProjectsController],
      providers: [{ provide: ProjectsService, useValue: service }],
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

  it('POST /projects validates the body and delegates to the service', async () => {
    service.create.mockResolvedValue({ id: projectId });

    const ok = await request(app.getHttpServer())
      .post('/projects')
      .send({ workspaceId, name: '  Nuevo  ' });
    const invalid = await request(app.getHttpServer()).post('/projects').send({ name: '' });

    expect(ok.status).toBe(201);
    expect(service.create).toHaveBeenCalledTimes(1);
    expect(service.create).toHaveBeenCalledWith({ workspaceId, name: 'Nuevo' });
    expect(invalid.status).toBe(400);
    expect(invalid.body.message).toBe('La solicitud no es válida.');
  });

  it('GET /projects requires workspaceId and applies pagination defaults', async () => {
    service.list.mockResolvedValue({ items: [], limit: 50, offset: 0 });

    const missing = await request(app.getHttpServer()).get('/projects');
    const ok = await request(app.getHttpServer()).get('/projects').query({ workspaceId });

    expect(missing.status).toBe(400);
    expect(ok.status).toBe(200);
    expect(service.list).toHaveBeenCalledWith(workspaceId, 50, 0);
  });

  it('GET /projects/:projectId rejects a non-UUID id before reaching the service', async () => {
    service.get.mockResolvedValue({ id: projectId });

    const bad = await request(app.getHttpServer()).get('/projects/not-a-uuid');
    const ok = await request(app.getHttpServer()).get(`/projects/${projectId}`);

    expect(bad.status).toBe(400);
    expect(ok.status).toBe(200);
    expect(service.get).toHaveBeenCalledTimes(1);
    expect(service.get).toHaveBeenCalledWith(projectId);
  });
});
