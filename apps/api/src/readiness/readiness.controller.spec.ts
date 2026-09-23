import { describe, expect, it, vi } from 'vitest';
import { ReadinessController } from './readiness.controller';
import type { ReadinessService } from './readiness.service';

describe('ReadinessController', () => {
  it('delegates to the service and wraps the result with projectId/generatedAt', async () => {
    const service = {
      evaluate: vi.fn().mockResolvedValue({ ready: true, stages: [], blockers: [], warnings: [] }),
    };
    const controller = new ReadinessController(service as unknown as ReadinessService);
    const result = await controller.get('p');
    expect(service.evaluate).toHaveBeenCalledWith('p');
    expect(result).toMatchObject({
      projectId: 'p',
      ready: true,
      stages: [],
      blockers: [],
      warnings: [],
    });
    expect(typeof result.generatedAt).toBe('string');
  });
});
