import { describe, expect, it } from 'vitest';
import {
  UI_BATCH_SIZE,
  fillMissingScreens,
  finishUiBlueprint,
  mergeUiBatch,
  nodesWithoutScreen,
  planUiBatches,
  type NavNode,
  type Screen,
} from './ui-blueprint-batches';

const node = (
  localId: string,
  kind: NavNode['kind'] = 'LIST',
  extra: Partial<NavNode> = {},
): NavNode => ({
  localId,
  label: `Vista ${localId}`,
  viewName: `Vista ${localId}`,
  kind,
  relatedUseCaseCodes: [],
  ...extra,
});
const screen = (localId: string, nodeId?: string, extra: Partial<Screen> = {}): Screen => ({
  localId,
  name: `Pantalla ${localId}`,
  purpose: 'Para algo.',
  targetActors: [],
  relatedUseCaseCodes: [],
  navigationNodeLocalId: nodeId,
  sections: [],
  primaryActions: [],
  secondaryActions: [],
  principalData: [],
  forms: [],
  states: [],
  ...extra,
});
const options = (known: string[] = []) => ({
  knownNodeIds: new Set(known),
  useCaseCodes: new Set(['CU-001']),
  sourceCodes: new Set(['CU-001', 'NAV-001']),
});

describe('planUiBatches', () => {
  it('batches the views, not the sections that only group them', () => {
    const nodes = [
      node('s', 'SECTION'),
      ...Array.from({ length: UI_BATCH_SIZE + 1 }, (_, i) => node(`n${i}`)),
    ];
    const plan = planUiBatches(nodes);
    expect(plan).toHaveLength(2);
    expect(plan.flat().map((n) => n.localId)).not.toContain('s');
    expect(plan[1]).toHaveLength(1);
  });
});

describe('mergeUiBatch', () => {
  const targets = [node('a'), node('b')];

  it('adds the screens of a batch to those already drawn', () => {
    const first = mergeUiBatch(
      [],
      { screens: [screen('sa', 'a'), screen('sb', 'b')] },
      targets,
      options(),
    );
    const second = mergeUiBatch(
      first,
      { screens: [screen('sc', 'c')] },
      [node('c')],
      options(['a', 'b']),
    );
    expect(second.map((s) => s.localId)).toEqual(['sa', 'sb', 'sc']);
    expect(first).toHaveLength(2);
  });

  it('allows several screens for one view', () => {
    const merged = mergeUiBatch(
      [],
      { screens: [screen('list', 'a'), screen('form', 'a'), screen('b', 'b')] },
      targets,
      options(),
    );
    expect(merged).toHaveLength(3);
    expect(nodesWithoutScreen(merged, targets)).toEqual([]);
  });

  it('drops a repeat of a view already drawn, and refuses a view that does not exist', () => {
    const merged = mergeUiBatch(
      [],
      { screens: [screen('x', 'old'), screen('sa', 'a')] },
      [node('a')],
      options(['old']),
    );
    expect(merged.map((s) => s.localId)).toEqual(['sa']);
    expect(() => mergeUiBatch([], { screens: [screen('x', 'nope')] }, targets, options())).toThrow(
      'no es de este lote',
    );
    expect(() => mergeUiBatch([], { screens: [screen('x')] }, targets, options())).toThrow(
      'no indica',
    );
  });

  it('keeps every local id unique across batches', () => {
    const first = mergeUiBatch([], { screens: [screen('s', 'a')] }, [node('a')], options());
    const second = mergeUiBatch(
      first,
      { screens: [screen('s', 'b')] },
      [node('b')],
      options(['a']),
    );
    expect(second.map((s) => s.localId)).toEqual(['s', 's-2']);
  });

  it('drops what a screen cites that the selection does not have, instead of failing the run', () => {
    const merged = mergeUiBatch(
      [],
      {
        screens: [
          screen('s', 'a', {
            relatedUseCaseCodes: ['CU-001', 'CU-999'],
            relatedSourceCodes: ['NAV-001', 'RF-999'],
          }),
        ],
      },
      targets,
      options(),
    );
    expect(merged[0]!.relatedUseCaseCodes).toEqual(['CU-001']);
    expect(merged[0]!.relatedSourceCodes).toEqual(['NAV-001']);
  });
});

describe('fillMissingScreens and finishUiBlueprint', () => {
  it('draws a plain screen for a view the model never answered, from the navigation tree', () => {
    const missing = [
      node('a', 'LIST', {
        viewName: 'Pedidos',
        description: 'Lista los pedidos.',
        relatedUseCaseCodes: ['CU-001'],
      }),
    ];
    const done = fillMissingScreens([], missing);
    expect(done[0]).toMatchObject({
      localId: 'screen-a',
      name: 'Pedidos',
      purpose: 'Lista los pedidos.',
      navigationNodeLocalId: 'a',
      relatedUseCaseCodes: ['CU-001'],
    });
    expect(nodesWithoutScreen(done, missing)).toEqual([]);
  });

  it('checks the whole blueprint once it is assembled', () => {
    expect(finishUiBlueprint([screen('a', 'a')]).screens).toHaveLength(1);
    expect(() => finishUiBlueprint([screen('a', 'a'), screen('a', 'b')])).toThrow('inválidas');
  });
});
