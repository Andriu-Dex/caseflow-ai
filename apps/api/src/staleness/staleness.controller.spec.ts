import { describe, expect, it, vi } from 'vitest';
import { StalenessController } from './staleness.controller';
import type { StalenessService } from './staleness.service';

describe('StalenessController', () => {
  it('delegates to the service and wraps the result with projectId/generatedAt', async () => {
    const service = { analyzeProject: vi.fn().mockResolvedValue({ entries: [] }) };
    const controller = new StalenessController(service as unknown as StalenessService);
    const result = await controller.get('p');
    expect(service.analyzeProject).toHaveBeenCalledWith('p');
    expect(result).toMatchObject({ projectId: 'p', entries: [] });
    expect(typeof result.generatedAt).toBe('string');
  });
});
