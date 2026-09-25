import { describe, expect, it, vi } from 'vitest';
import { TraceabilityController } from './traceability.controller';
import type { TraceabilityService } from './traceability.service';

describe('TraceabilityController', () => {
  it('delegates to the service and wraps the result with projectId/generatedAt', async () => {
    const service = { buildGraph: vi.fn().mockResolvedValue({ nodes: [], edges: [] }) };
    const controller = new TraceabilityController(service as unknown as TraceabilityService);
    const result = await controller.get('p');
    expect(service.buildGraph).toHaveBeenCalledWith('p');
    expect(result).toMatchObject({ projectId: 'p', nodes: [], edges: [] });
    expect(typeof result.generatedAt).toBe('string');
  });
});
