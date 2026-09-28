import { describe, expect, it, vi } from 'vitest';
import { UseCasesController } from './use-cases.controller';
import type { UseCasesService } from './use-cases.service';
describe('UseCasesController', () => {
  it('delegates semantic routes', async () => {
    const service = Object.fromEntries(
      [
        'create',
        'list',
        'academicValidation',
        'generate',
        'getGeneration',
        'accept',
        'get',
        'version',
        'transition',
      ].map((name) => [name, vi.fn().mockResolvedValue({})]),
    );
    const controller = new UseCasesController(service as unknown as UseCasesService);
    const body = {
      name: 'N',
      objective: 'O',
      primaryActor: 'U',
      secondaryActors: [],
      preconditions: [],
      postconditions: [],
      mainFlow: [{ actor: 'U', action: 'A' }],
      alternativeFlows: [],
      relatedRequirementVersionIds: ['r'],
    };
    await controller.create('p', body);
    await controller.list('p');
    await controller.academic('p');
    await controller.generate('p', { requirementVersionIds: ['r'] });
    await controller.generation('p', 'g');
    await controller.accept('p', 'g', { candidateIds: ['c'] });
    await controller.get('p', 'u');
    await controller.version('p', 'u', body);
    await controller.transition('p', 'u', 'v', { status: 'IN_REVIEW' });
    expect(Object.values(service).every((fn) => fn.mock.calls.length === 1)).toBe(true);
  });
});
