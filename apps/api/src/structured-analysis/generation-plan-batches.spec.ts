import { describe, expect, it } from 'vitest';
import {
  PLAN_BATCH_SIZE,
  cleanOutline,
  fillMissingScreens,
  finishGenerationPlan,
  mergePlanBatch,
  modulesWithoutScreen,
  planDetailBatches,
  type PlanCodes,
  type PlanModule,
} from './generation-plan-batches';

const codes: PlanCodes = {
  requirements: new Set(['RF-001']),
  useCases: new Set(['CU-001']),
  sources: new Set(['RF-001', 'CU-001']),
};
const mod = (localId: string, extra: Partial<PlanModule> = {}): PlanModule => ({
  localId,
  name: `Módulo ${localId}`,
  purpose: 'Propósito.',
  entityNames: [],
  relatedRequirementCodes: [],
  relatedUseCaseCodes: [],
  ...extra,
});
const outline = (modules: PlanModule[]) => ({
  summary: 'Resumen.',
  modules,
  actors: [],
  integrations: [],
  authentication: { required: false, roles: [] },
  technicalConstraints: [],
  risks: [],
});
const screen = (name: string, moduleLocalId?: string) => ({
  name,
  moduleLocalId,
  purpose: 'Pantalla.',
});

describe('planDetailBatches', () => {
  it('cuts the modules into batches in their order', () => {
    const modules = Array.from({ length: PLAN_BATCH_SIZE + 1 }, (_, i) => mod(`m${i}`));
    const batches = planDetailBatches(modules);
    expect(batches.map((batch) => batch.length)).toEqual([PLAN_BATCH_SIZE, 1]);
  });
});

describe('cleanOutline', () => {
  it('drops citations the selection does not support and keeps use cases among the sources', () => {
    const cleaned = cleanOutline(
      outline([
        mod('m', {
          relatedRequirementCodes: ['RF-001', 'RF-999'],
          relatedUseCaseCodes: ['CU-001', 'CU-999'],
          relatedSourceCodes: ['RF-001', 'XX-1'],
        }),
      ]),
      codes,
    );
    expect(cleaned.modules[0]).toMatchObject({
      relatedRequirementCodes: ['RF-001'],
      relatedUseCaseCodes: ['CU-001'],
      relatedSourceCodes: ['RF-001', 'CU-001'],
    });
  });
  it('keeps each entity in one module, the first that lists it', () => {
    const cleaned = cleanOutline(
      outline([
        mod('a', { name: 'A', entityNames: ['Usuario', 'Sesión'] }),
        mod('b', { name: 'B', entityNames: ['usuario', 'Rol'] }),
      ]),
      codes,
    );
    expect(cleaned.modules.map((module) => module.entityNames)).toEqual([
      ['Usuario', 'Sesión'],
      ['Rol'],
    ]);
  });
  it('makes module ids unique and refuses a repeated name', () => {
    const cleaned = cleanOutline(outline([mod('m'), mod('m', { name: 'Otro' })]), codes);
    expect(cleaned.modules.map((module) => module.localId)).toEqual(['m', 'm-2']);
    expect(() =>
      cleanOutline(outline([mod('a', { name: 'X' }), mod('b', { name: 'x' })]), codes),
    ).toThrow('repite');
  });
});

describe('mergePlanBatch', () => {
  const modules = [mod('a'), mod('b')];
  const all = new Set(['a', 'b', 'c']);
  const empty = { workflows: [], screens: [] };
  const flow = (name: string) => ({
    localId: 'f',
    name,
    steps: ['Paso'],
    relatedUseCaseCodes: ['CU-001', 'CU-999'],
  });
  it('adds workflows and screens, drops repeats and unknown citations', () => {
    const first = mergePlanBatch(
      empty,
      { workflows: [flow('Alta')], screens: [screen('Lista', 'a')] },
      modules,
      codes,
      all,
    );
    expect(first.workflows[0]).toMatchObject({
      relatedUseCaseCodes: ['CU-001'],
      relatedSourceCodes: ['CU-001'],
    });
    const second = mergePlanBatch(
      first,
      {
        workflows: [flow('alta'), flow('Baja')],
        screens: [screen('Lista', 'a'), screen('Otra', 'b')],
      },
      modules,
      codes,
      all,
    );
    expect(second.workflows.map((w) => w.localId)).toEqual(['f', 'f-2']);
    expect(second.screens.map((s) => s.name)).toEqual(['Lista', 'Otra']);
  });
  it('drops a screen of a module of another batch and refuses one of no module', () => {
    const merged = mergePlanBatch(
      empty,
      { workflows: [], screens: [screen('Fuera', 'c')] },
      modules,
      codes,
      all,
    );
    expect(merged.screens).toEqual([]);
    const refuse = (value: ReturnType<typeof screen>) =>
      mergePlanBatch(empty, { workflows: [], screens: [value] }, modules, codes, all);
    expect(() => refuse(screen('Z', 'nope'))).toThrow('no existe');
    expect(() => refuse(screen('Z'))).toThrow('no indica');
  });
});

describe('completing the plan', () => {
  it('makes a screen for a module the model drew none for, and checks the whole plan', () => {
    const modules = [mod('a'), mod('b')];
    const drawn = mergePlanBatch(
      { workflows: [], screens: [] },
      { workflows: [], screens: [screen('Lista', 'a')] },
      modules,
      codes,
      new Set(['a', 'b']),
    );
    const missing = modulesWithoutScreen(drawn, modules);
    expect(missing.map((module) => module.localId)).toEqual(['b']);
    const filled = fillMissingScreens(drawn, missing);
    expect(filled.screens[1]).toMatchObject({ name: 'Módulo b', moduleLocalId: 'b' });
    expect(modulesWithoutScreen(filled, modules)).toEqual([]);
    expect(finishGenerationPlan(outline(modules), filled).screens).toHaveLength(2);
  });
});
