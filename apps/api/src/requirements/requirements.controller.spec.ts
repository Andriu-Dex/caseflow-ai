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
    const documents = { generate: vi.fn().mockResolvedValue(Buffer.from('document')) };
    for (const fn of Object.values(s)) fn.mockResolvedValue({});
    const jobs = { start: vi.fn(), latest: vi.fn(), get: vi.fn() };
    const bulk = { apply: vi.fn().mockResolvedValue({ affected: 1, skipped: 0 }) };
    const c = new RequirementsController(
      s as unknown as RequirementsService,
      documents as never,
      jobs as never,
      bulk as never,
    );
    await c.bulk('p', { action: 'ARCHIVE', requirementIds: ['r'] }, { user: { id: 'u' } });
    expect(bulk.apply).toHaveBeenCalledWith('p', 'ARCHIVE', ['r'], 'u');
    await c.startGeneration('p', { sourceContextVersionId: 'v' }, { user: { id: 'u' } });
    await c.latestGeneration('p');
    await c.generationJob('p', 'j');
    expect(jobs.start).toHaveBeenCalledWith('p', 'v', 'u');
    expect(jobs.latest).toHaveBeenCalledWith('p');
    expect(jobs.get).toHaveBeenCalledWith('p', 'j');
    const body = {
      requirementType: 'FUNCTIONAL' as const,
      name: 'N',
      description: 'D',
      priority: 'HIGH' as const,
      actors: [],
      preconditions: [],
      postconditions: [],
      dependencyArtifactIds: [],
      origin: null,
    };
    await c.create('p', body);
    await c.list('p');
    await c.get('p', 'r');
    await c.version('p', 'r', body);
    await c.generate('p', { sourceContextVersionId: 'v' });
    await c.generation('p', 'g');
    await c.accept('p', 'g', { candidateIds: ['c'] });
    await c.transition('p', 'r', 'v', { status: 'IN_REVIEW' });
    await c.exportDocument('p', 'pdf', { setHeader: vi.fn() } as never);
    expect(Object.values(s).every((fn) => fn.mock.calls.length === 1)).toBe(true);
    expect(documents.generate).toHaveBeenCalledWith('p', 'pdf');
  });
});
