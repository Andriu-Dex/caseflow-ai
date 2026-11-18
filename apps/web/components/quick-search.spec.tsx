import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TestProviders } from '../lib/test-utils';
import { OPEN_ARTIFACT_EVENT } from '../lib/linked-artifact';
import { QuickSearch } from './quick-search';

const mocks = vi.hoisted(() => ({ search: vi.fn(), push: vi.fn(), pathname: '/' }));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mocks.push }),
  usePathname: () => mocks.pathname,
}));
vi.mock('../lib/api', () => ({
  api: { artifacts: { search: (...args: unknown[]) => mocks.search(...args) } },
  restoreSession: vi.fn(),
}));

const pages = [
  { href: '/requirements', label: 'Requisitos' },
  { href: '/design/navigation', label: 'Navegación' },
];

describe('QuickSearch', () => {
  beforeEach(() => {
    mocks.push.mockReset();
    mocks.pathname = '/';
    mocks.search.mockResolvedValue({
      items: [
        {
          id: '11111111-1111-4111-8111-111111111111',
          type: 'REQUIREMENT',
          code: 'RF-001',
          title: 'Registrar reserva',
          status: 'APPROVED',
        },
      ],
    });
  });

  it('opens with Ctrl+K and jumps to an artifact by its code', async () => {
    render(<QuickSearch projectId="p1" pages={pages} />, { wrapper: TestProviders });
    await userEvent.keyboard('{Control>}k{/Control}');
    await userEvent.type(screen.getByRole('combobox'), 'rf-001');

    expect(await screen.findByText('Registrar reserva')).toBeInTheDocument();
    expect(mocks.search).toHaveBeenCalledWith('p1', 'rf-001');
    await userEvent.keyboard('{Enter}');
    expect(mocks.push).toHaveBeenCalledWith('/requirements?q=RF-001');
  });

  it('finds pages without accents and tells the open page which artifact to show', async () => {
    mocks.pathname = '/requirements';
    const heard = vi.fn();
    window.addEventListener(OPEN_ARTIFACT_EVENT, (event) =>
      heard((event as CustomEvent<string>).detail),
    );
    render(<QuickSearch projectId="p1" pages={pages} />, { wrapper: TestProviders });
    await userEvent.keyboard('{Control>}k{/Control}');
    await userEvent.type(screen.getByRole('combobox'), 'navegacion');
    expect(screen.getByRole('option', { name: /Navegación/ })).toBeInTheDocument();

    await userEvent.clear(screen.getByRole('combobox'));
    await userEvent.type(screen.getByRole('combobox'), 'reserva');
    await userEvent.click(await screen.findByRole('option', { name: /RF-001/ }));
    expect(heard).toHaveBeenCalledWith('RF-001');
  });
});
