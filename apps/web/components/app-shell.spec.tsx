import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AppShell } from './app-shell';
import { TestProviders } from '../lib/test-utils';

const mocks = vi.hoisted(() => ({ readinessGet: vi.fn() }));

vi.mock('next/navigation', () => ({ usePathname: () => '/' }));

vi.mock('../lib/api', () => ({
  api: { readiness: { get: (...args: unknown[]) => mocks.readinessGet(...args) } },
  ApiError: class ApiError extends Error {},
  restoreSession: vi.fn(),
}));

beforeEach(() => {
  window.localStorage.setItem('caseflow.activeProjectId', 'p1');
});

describe('AppShell construction group', () => {
  it('collapses Construction into a locked row while planning is incomplete', async () => {
    mocks.readinessGet.mockResolvedValue({ ready: false, stages: [] });
    render(
      <TestProviders>
        <AppShell>content</AppShell>
      </TestProviders>,
    );
    expect(await screen.findByRole('button', { name: /Construcción/ })).toBeInTheDocument();
    expect(screen.getByText('bloqueada')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Generación de código/ })).not.toBeInTheDocument();
  });

  it('shows a guidance message instead of navigating when clicked while locked', async () => {
    mocks.readinessGet.mockResolvedValue({ ready: false, stages: [] });
    render(
      <TestProviders>
        <AppShell>content</AppShell>
      </TestProviders>,
    );
    await userEvent.click(await screen.findByRole('button', { name: /Construcción/ }));
    expect(await screen.findByText(/Complete los 11 pasos de planificación/)).toBeInTheDocument();
  });

  it('expands the five Construction links once planning is complete (ready: true)', async () => {
    mocks.readinessGet.mockResolvedValue({ ready: true, stages: [] });
    render(
      <TestProviders>
        <AppShell>content</AppShell>
      </TestProviders>,
    );
    await waitFor(() =>
      expect(screen.getByRole('link', { name: /Generación de código/ })).toBeInTheDocument(),
    );
    expect(screen.queryByRole('button', { name: /Construcción/ })).not.toBeInTheDocument();
    for (const label of [
      'Plan de generación',
      'Modelo conceptual',
      'Aprobación de diseño',
      'Plan de implementación',
      'Generación de código',
    ])
      expect(screen.getByRole('link', { name: new RegExp(label) })).toBeInTheDocument();
  });

  it('places Construction after Trazabilidad, never between two numbered planning steps', async () => {
    mocks.readinessGet.mockResolvedValue({ ready: true, stages: [] });
    render(
      <TestProviders>
        <AppShell>content</AppShell>
      </TestProviders>,
    );
    await waitFor(() =>
      expect(screen.getByRole('link', { name: /Generación de código/ })).toBeInTheDocument(),
    );
    const links = screen.getAllByRole('link').map((el) => el.textContent ?? '');
    const traceabilityIndex = links.findIndex((t) => /Trazabilidad/.test(t));
    const constructionIndex = links.findIndex((t) => /Plan de generación/.test(t));
    expect(traceabilityIndex).toBeGreaterThan(-1);
    expect(constructionIndex).toBeGreaterThan(traceabilityIndex);
  });
});
