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

  it('delegates the diagram view to the service', async () => {
    const diagram = { source: 'flowchart TD', sourceFormat: 'MERMAID_FLOWCHART', svg: '<svg/>' };
    const service = { buildDiagram: vi.fn().mockResolvedValue(diagram) };
    const controller = new TraceabilityController(service as unknown as TraceabilityService);
    await expect(controller.diagram('p')).resolves.toBe(diagram);
    expect(service.buildDiagram).toHaveBeenCalledWith('p');
  });

  it('streams the diagram PNG with the right headers', async () => {
    const png = Buffer.from('png-bytes');
    const service = { getDiagramPng: vi.fn().mockResolvedValue(png) };
    const controller = new TraceabilityController(service as unknown as TraceabilityService);
    const response = { setHeader: vi.fn() } as unknown as Parameters<
      typeof controller.diagramPng
    >[1];
    const result = await controller.diagramPng('p', response);
    expect(service.getDiagramPng).toHaveBeenCalledWith('p');
    expect(response.setHeader).toHaveBeenCalledWith(
      'Content-Disposition',
      'attachment; filename="trazabilidad.png"',
    );
    expect(response.setHeader).toHaveBeenCalledWith('Content-Type', 'image/png');
    expect(result.getStream().read()).toEqual(png);
  });
});
