import { describe, expect, it } from 'vitest';
import { buildPrototype, forRole, rolesOf } from './prototype';

const tree = [
  { localId: 'home', label: 'Inicio' },
  { localId: 'sales', label: 'Ventas', parentLocalId: 'home' },
  { localId: 'new-sale', label: 'Registrar venta', parentLocalId: 'sales' },
  { localId: 'stock', label: 'Inventario', parentLocalId: 'home' },
];
const blueprint = [
  { localId: 's-home', name: 'Inicio', purpose: 'Elegir', navigationNodeLocalId: 'home' },
  {
    localId: 's-new-sale',
    name: 'Registrar venta',
    purpose: 'Cobrar',
    targetActors: ['Cajero'],
    navigationNodeLocalId: 'new-sale',
    primaryActions: ['Confirmar venta'],
  },
  {
    localId: 's-stock',
    name: 'Existencias',
    purpose: 'Ver saldos',
    targetActors: ['Bodeguero'],
    navigationNodeLocalId: 'stock',
  },
  { localId: 's-help', name: 'Ayuda', purpose: 'Consultar', targetActors: ['Cajero'] },
];
const mockup = ['s-home', 's-new-sale', 's-stock', 's-help'].map((id) => ({
  id: `m-${id}`,
  screenLocalId: id,
  screenName: id,
  htmlUrl: `/html/${id}`,
}));

describe('prototype (DEC-175)', () => {
  it('walks the tree in order with each node screen, and keeps loose screens apart', () => {
    const nodes = buildPrototype(tree, blueprint, mockup);
    expect(nodes.map((n) => [n.label, n.depth, n.screen?.id ?? null])).toEqual([
      ['Inicio', 0, 'm-s-home'],
      ['Ventas', 1, null],
      ['Registrar venta', 2, 'm-s-new-sale'],
      ['Inventario', 1, 'm-s-stock'],
      ['Otras pantallas', 0, null],
      ['Ayuda', 1, 'm-s-help'],
    ]);
    expect(nodes[2]!.screen).toMatchObject({ purpose: 'Cobrar', actions: ['Confirmar venta'] });
    expect(rolesOf(nodes)).toEqual(['Bodeguero', 'Cajero']);
  });

  it('shows a role its screens, the ones for everyone and the sections leading to them', () => {
    const nodes = forRole(buildPrototype(tree, blueprint, mockup), 'Cajero');
    expect(nodes.map((n) => n.label)).toEqual([
      'Inicio',
      'Ventas',
      'Registrar venta',
      'Otras pantallas',
      'Ayuda',
    ]);
  });
});
