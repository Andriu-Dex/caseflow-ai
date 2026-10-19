import { afterEach, describe, expect, it, vi } from 'vitest';
import { FakeStorageProvider } from '@caseflow-ai/integrations';
import { FirstDeliverableSnapshotService } from '../first-deliverable/first-deliverable-snapshot.service';
import { MockupsService } from './mockups.service';

// The part of the screen-by-screen generation (DEC-146, DEC-147) that decides
// the menu each screen shows and what happens when Stitch fails.

const node = (localId: string, label: string, kind: string, parentLocalId?: string) => ({
  viewName: label,
  localId,
  label,
  kind,
  ...(parentLocalId ? { parentLocalId } : {}),
});
const tree = {
  nodes: [
    node('home', 'Inicio', 'HOME'),
    node('sales', 'Ventas', 'SECTION', 'home'),
    node('sale-new', 'Nueva venta', 'VIEW', 'sales'),
    node('stock', 'Inventario', 'SECTION', 'home'),
    node('login', 'Acceso', 'AUTH', 'home'),
    node('logout', 'Cerrar sesión', 'OTHER', 'home'),
  ],
};
const screens = [
  { localId: 's-home', name: 'Inicio', navigationNodeLocalId: 'home' },
  { localId: 's-sale', name: 'Nueva venta', navigationNodeLocalId: 'sale-new' },
  { localId: 's-stock', name: 'Stock', navigationNodeLocalId: 'stock' },
  { localId: 's-login', name: 'Acceso', navigationNodeLocalId: 'login' },
  { localId: 's-free', name: 'Suelta' },
];
const content = { screens } as never;

function build(options: { tree?: unknown; approved?: boolean } = {}) {
  const prisma = {
    project: { findUnique: vi.fn().mockResolvedValue({ name: 'RestGuest' }) },
    structuredAnalysisDetail: {
      findUnique: vi
        .fn()
        .mockResolvedValue(options.tree === undefined ? null : { content: options.tree }),
    },
  };
  vi.spyOn(FirstDeliverableSnapshotService.prototype, 'approvedArtifactVersion').mockResolvedValue(
    (options.approved === false ? null : { versionId: 'nav-1' }) as never,
  );
  const service = new MockupsService(prisma as never, {} as never, new FakeStorageProvider(), {
    add: vi.fn(),
  } as never);
  const appContext = (
    service as unknown as {
      appContext: (
        projectId: string,
        content: unknown,
      ) => Promise<{
        appName: string;
        menu: string[];
        activeMenuByScreen: Record<string, string | null>;
      }>;
    }
  ).appContext.bind(service);
  return { prisma, appContext };
}

afterEach(() => vi.restoreAllMocks());

describe('the application context of a mockup', () => {
  it('names the application after the project and builds the menu from the approved navigation', async () => {
    const { appContext } = build({ tree });
    const context = await appContext('p1', content);
    expect(context.appName).toBe('RestGuest');
    // Under the home, without the sign-in and actions such as signing out.
    expect(context.menu).toEqual(['Ventas', 'Inventario']);
  });

  it('marks the entry each screen belongs to: its own, its ancestor, the first for the home, none for the rest', async () => {
    const { appContext } = build({ tree });
    const { activeMenuByScreen } = await appContext('p1', content);
    expect(activeMenuByScreen).toEqual({
      's-home': 'Ventas',
      's-sale': 'Ventas',
      's-stock': 'Inventario',
      's-login': null,
      's-free': null,
    });
  });

  it('uses the top-level nodes when the tree has no home', async () => {
    const flat = { nodes: [node('a', 'Uno', 'VIEW'), node('b', 'Dos', 'VIEW', 'a')] };
    const { appContext } = build({ tree: flat });
    const context = await appContext('p1', {
      screens: [{ localId: 's', name: 'S', navigationNodeLocalId: 'b' }],
    });
    expect(context.menu).toEqual(['Uno']);
    expect(context.activeMenuByScreen).toEqual({ s: 'Uno' });
  });

  it('gives an empty menu with no approved navigation, an unreadable one, or no project', async () => {
    for (const options of [{ approved: false }, { tree: { nodes: 'mal' } }, { tree: undefined }]) {
      const { appContext } = build(options);
      const context = await appContext('p1', content);
      expect(context.menu).toEqual([]);
      expect(Object.values(context.activeMenuByScreen).every((value) => value === null)).toBe(true);
    }
    const { prisma, appContext } = build({ tree });
    prisma.project.findUnique.mockResolvedValue(null);
    expect((await appContext('p1', content)).appName).toBe('Aplicación');
  });
});
