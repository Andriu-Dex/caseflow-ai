import { describe, expect, it, vi } from 'vitest';
import type { ProjectContextRequest } from '@caseflow-ai/contracts';
import { ProjectContextController } from './project-context.controller';
import type { ProjectContextService } from './project-context.service';

const projectId = '7b1d3c4e-5f60-4a71-8b92-a3b4c5d6e7f8';
const input: ProjectContextRequest = {
  problemStatement: 'Problema',
  objective: 'Objetivo',
  scopeItems: [],
  actors: [],
  needs: [],
  constraints: [],
  businessRules: [],
};
const response = { artifactId: 'artifact' };

describe('ProjectContextController', () => {
  const service = { create: vi.fn(), getCurrent: vi.fn(), createVersion: vi.fn() };
  const controller = new ProjectContextController(service as unknown as ProjectContextService);

  it('delegates semantic context operations with the project scope', async () => {
    service.create.mockResolvedValue(response);
    service.getCurrent.mockResolvedValue(response);
    service.createVersion.mockResolvedValue(response);

    expect(await controller.create(projectId, input)).toBe(response);
    expect(await controller.get(projectId)).toBe(response);
    expect(await controller.createVersion(projectId, input)).toBe(response);
    expect(service.create).toHaveBeenCalledWith(projectId, input);
    expect(service.getCurrent).toHaveBeenCalledWith(projectId);
    expect(service.createVersion).toHaveBeenCalledWith(projectId, input);
  });
});
