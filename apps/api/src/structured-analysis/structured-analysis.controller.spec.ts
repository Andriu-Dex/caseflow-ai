import { describe, expect, it, vi } from 'vitest';
import {
  NavigationController,
  SoftwareArchitectureController,
  SystemArchitectureController,
  UiBlueprintController,
} from './structured-analysis.controller';
import type { StructuredAnalysisService } from './structured-analysis.service';

const METHOD_NAMES = [
  'create',
  'list',
  'generate',
  'getGeneration',
  'accept',
  'get',
  'version',
  'transition',
  'getDiagram',
] as const;

function fakeService() {
  return Object.fromEntries(
    METHOD_NAMES.map((name) => [name, vi.fn().mockResolvedValue({})]),
  ) as unknown as StructuredAnalysisService;
}

const navigationBody = {
  title: 'T',
  content: {
    nodes: [
      {
        localId: 'home',
        label: 'Home',
        viewName: 'Home',
        kind: 'HOME' as const,
        relatedUseCaseCodes: [],
      },
    ],
  },
};
const softwareArchitectureBody = {
  title: 'T',
  content: {
    style: 'Modular monolith',
    components: [{ localId: 'api', name: 'API', responsibilities: [] }],
    dependencies: [],
    decisions: [],
  },
};
const systemArchitectureBody = {
  title: 'T',
  content: {
    boundary: 'Sistema',
    nodes: [{ localId: 'srv', name: 'Servidor', kind: 'RUNTIME' as const, responsibilities: [] }],
    links: [],
  },
};
const uiBlueprintBody = {
  title: 'T',
  content: {
    screens: [
      {
        localId: 'home',
        name: 'Inicio',
        purpose: 'Ver el panel',
        targetActors: [],
        relatedUseCaseCodes: [],
        sections: [],
        primaryActions: [],
        secondaryActions: [],
        principalData: [],
        forms: [],
        states: [],
      },
    ],
  },
};

describe('Structured Analysis controllers (delegation)', () => {
  it('NavigationController delegates every route, including its diagram route', async () => {
    const service = fakeService();
    const controller = new NavigationController(service);
    await controller.create('p', navigationBody);
    await controller.list('p');
    await controller.generate('p', { sourceVersionIds: ['s'] });
    await controller.generation('p', 'g');
    await controller.accept('p', 'g', { candidateIds: ['c'] });
    await controller.get('p', 'n');
    await controller.version('p', 'n', navigationBody);
    await controller.transition('p', 'n', 'v', { status: 'IN_REVIEW' });
    await controller.diagram('p', 'n');
    expect(service.create).toHaveBeenCalledWith(
      'p',
      'NAVIGATION_TREE',
      'T',
      navigationBody.content,
    );
    expect(service.getDiagram).toHaveBeenCalledWith('p', 'NAVIGATION_TREE', 'n');
    expect(service.transition).toHaveBeenCalledWith('p', 'NAVIGATION_TREE', 'n', 'v', 'IN_REVIEW');
  });

  it('SoftwareArchitectureController delegates every route, including its diagram route', async () => {
    const service = fakeService();
    const controller = new SoftwareArchitectureController(service);
    await controller.create('p', softwareArchitectureBody);
    await controller.list('p');
    await controller.generate('p', { sourceVersionIds: ['s'] });
    await controller.generation('p', 'g');
    await controller.accept('p', 'g', { candidateIds: ['c'] });
    await controller.get('p', 'a');
    await controller.version('p', 'a', softwareArchitectureBody);
    await controller.transition('p', 'a', 'v', { status: 'IN_REVIEW' });
    await controller.diagram('p', 'a');
    expect(service.create).toHaveBeenCalledWith(
      'p',
      'SOFTWARE_ARCHITECTURE',
      'T',
      softwareArchitectureBody.content,
    );
    expect(service.getDiagram).toHaveBeenCalledWith('p', 'SOFTWARE_ARCHITECTURE', 'a');
  });

  it('SystemArchitectureController delegates every route, including its diagram route', async () => {
    const service = fakeService();
    const controller = new SystemArchitectureController(service);
    await controller.create('p', systemArchitectureBody);
    await controller.list('p');
    await controller.generate('p', { sourceVersionIds: ['s'] });
    await controller.generation('p', 'g');
    await controller.accept('p', 'g', { candidateIds: ['c'] });
    await controller.get('p', 'a');
    await controller.version('p', 'a', systemArchitectureBody);
    await controller.transition('p', 'a', 'v', { status: 'IN_REVIEW' });
    await controller.diagram('p', 'a');
    expect(service.create).toHaveBeenCalledWith(
      'p',
      'SYSTEM_ARCHITECTURE',
      'T',
      systemArchitectureBody.content,
    );
    expect(service.getDiagram).toHaveBeenCalledWith('p', 'SYSTEM_ARCHITECTURE', 'a');
  });

  it('UiBlueprintController delegates every route (no diagram route for this kind)', async () => {
    const service = fakeService();
    const controller = new UiBlueprintController(service);
    await controller.create('p', uiBlueprintBody);
    await controller.list('p');
    await controller.generate('p', { sourceVersionIds: ['s'] });
    await controller.generation('p', 'g');
    await controller.accept('p', 'g', { candidateIds: ['c'] });
    await controller.get('p', 'b');
    await controller.version('p', 'b', uiBlueprintBody);
    await controller.transition('p', 'b', 'v', { status: 'IN_REVIEW' });
    expect(service.create).toHaveBeenCalledWith('p', 'UI_BLUEPRINT', 'T', uiBlueprintBody.content);
    expect(service.getDiagram).not.toHaveBeenCalled();
  });
});
