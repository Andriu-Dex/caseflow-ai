import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { MockupPreviewResponse } from '@caseflow-ai/contracts';
import { TestProviders } from '../lib/test-utils';
import { PrototypeDialog } from './prototype-dialog';

const mocks = vi.hoisted(() => ({ list: vi.fn(), fetchBlob: vi.fn() }));
vi.mock('../lib/api', () => ({
  api: {
    structuredAnalysis: { list: (...args: unknown[]) => mocks.list(...args) },
    mockups: { screenHtmlUrl: (_p: string, _m: string, id: string) => `/html/${id}` },
  },
  fetchBlob: (...args: unknown[]) => mocks.fetchBlob(...args),
  restoreSession: vi.fn(),
}));

const approved = (content: unknown) => ({
  items: [{ version: { id: 'ui-v1', status: 'APPROVED' }, content }],
});
mocks.list.mockImplementation(async (_project: string, kind: string) =>
  kind === 'NAVIGATION_TREE'
    ? approved({
        nodes: [
          { localId: 'home', label: 'Inicio' },
          { localId: 'sales', label: 'Ventas', parentLocalId: 'home' },
          { localId: 'stock', label: 'Inventario', parentLocalId: 'home' },
        ],
      })
    : approved({
        screens: [
          {
            localId: 's-home',
            name: 'Inicio',
            purpose: 'Elegir una opción',
            navigationNodeLocalId: 'home',
          },
          {
            localId: 's-sales',
            name: 'Ventas',
            purpose: 'Cobrar',
            targetActors: ['Cajero'],
            navigationNodeLocalId: 'sales',
            primaryActions: ['Registrar venta'],
          },
          {
            localId: 's-stock',
            name: 'Inventario',
            purpose: 'Ver saldos',
            targetActors: ['Bodeguero'],
            navigationNodeLocalId: 'stock',
          },
        ],
      }),
);
mocks.fetchBlob.mockImplementation(async (url: string) => ({ text: async () => `<p>${url}</p>` }));

const mockup = {
  id: 'm1',
  code: 'MCK-001',
  uiBlueprintVersionId: 'ui-v1',
  screens: ['s-home', 's-sales', 's-stock'].map((id) => ({
    id: `id-${id}`,
    screenLocalId: id,
    screenName: id,
    imageUrl: '',
    htmlUrl: '',
    editable: false,
    refinementPrompt: null,
  })),
} as unknown as MockupPreviewResponse;

describe('PrototypeDialog', () => {
  it('walks the approved screens by the navigation tree and by role', async () => {
    render(<PrototypeDialog open onOpenChange={() => undefined} projectId="p1" mockup={mockup} />, {
      wrapper: TestProviders,
    });
    expect(await screen.findByText('Elegir una opción')).toBeInTheDocument();
    expect(await screen.findByTitle('s-home')).toBeInTheDocument();
    expect(screen.getByText('1 / 3')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Pantalla siguiente' }));
    expect(screen.getByText('Acciones principales: Registrar venta')).toBeInTheDocument();
    expect(screen.getByLabelText('Ruta en la navegación')).toHaveTextContent('Inicio › Ventas');
    // Sibling screens are one click away.
    await userEvent.click(
      within(screen.getByRole('region', { name: 'Pantalla' })).getByRole('button', {
        name: 'Inventario',
      }),
    );
    expect(screen.getByText('Ver saldos')).toBeInTheDocument();

    await userEvent.selectOptions(screen.getByRole('combobox'), 'Cajero');
    const tree = screen.getByRole('navigation', { name: 'Árbol de navegación' });
    expect(tree).toHaveTextContent('Ventas');
    expect(tree).not.toHaveTextContent('Inventario');
    expect(screen.getByText('1 / 2')).toBeInTheDocument();
  });
});
