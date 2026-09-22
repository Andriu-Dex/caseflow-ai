import { describe, expect, it, vi } from 'vitest';
import { RequirementsController } from './requirements.controller';
import type { RequirementsService } from './requirements.service';
describe('RequirementsController', () => {
  it('delegates every semantic route', async () => {
    const s = {
      create: vi.fn(),
      list: vi.fn(),
      get: vi.fn(),
      version: vi.fn(),
      generate: vi.fn(),
      getGeneration: vi.fn(),
      accept: vi.fn(),
      transition: vi.fn(),
    };
    for (const fn of Object.values(s)) fn.mockResolvedValue({});
    const c = new RequirementsController(s as unknown as RequirementsService);
    const body = {
      requirementType: 'FUNCTIONAL' as const,
      name: 'N',
      description: 'D',
      priority: 'HIGH' as const,
      actors: [],
      preconditions: [],
      postconditions: [],
      dependencyArtifactIds: [],
    };
    await c.create('p', body);
    await c.list('p');
    await c.get('p', 'r');
    await c.version('p', 'r', body);
    await c.generate('p', { sourceContextVersionId: 'v' });
    await c.generation('p', 'g');
    await c.accept('p', 'g', { candidateIds: ['c'] });
    await c.transition('p', 'r', 'v', { status: 'IN_REVIEW' });
    expect(Object.values(s).every((fn) => fn.mock.calls.length === 1)).toBe(true);
  });
});
