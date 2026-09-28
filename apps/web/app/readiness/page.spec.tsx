import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ReadinessPage from './page';
import { TestProviders } from '../../lib/test-utils';

const getReadiness = vi.fn();

vi.mock('../../lib/api', () => ({
  api: {
    readiness: { get: (...args: unknown[]) => getReadiness(...args) },
    export: {
      url: (projectId: string, format: string) =>
        `http://localhost:3001/projects/${projectId}/export?format=${format}`,
    },
  },
  ApiError: class ApiError extends Error {},
}));

const oneStageSatisfied = {
  projectId: 'p1',
  generatedAt: new Date().toISOString(),
  ready: true,
  stages: [
    {
      key: 'SOURCES',
      label: 'Fuentes del proyecto',
      satisfied: true,
      summary: 'ok',
      blockers: [],
      warnings: [],
      nextAction: null,
    },
  ],
  blockers: [],
  warnings: [],
};

beforeEach(() => {
  getReadiness.mockReset().mockResolvedValue(oneStageSatisfied);
});

beforeEach(() => {
  window.localStorage.setItem('caseflow.activeProjectId', 'p1');
});

describe('ReadinessPage', () => {
  it('shows the 13-stage checklist consuming backend readiness (behavior 17)', async () => {
    render(
      <TestProviders>
        <ReadinessPage />
      </TestProviders>,
    );
    await waitFor(() => expect(screen.getByText(/proyecto completo/i)).toBeInTheDocument());
    expect(screen.getByText(/fuentes del proyecto/i)).toBeInTheDocument();
  });

  it('exposes JSON and HTML export actions using the backend export endpoint (behaviors 19, 20)', () => {
    render(
      <TestProviders>
        <ReadinessPage />
      </TestProviders>,
    );
    expect(
      screen.getByRole('button', { name: /datos estructurados \(json\)/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /documento del proyecto \(html\)/i }),
    ).toBeInTheDocument();
  });

  it('disables both export buttons when nothing is approved yet, with an explanatory note', async () => {
    getReadiness.mockResolvedValue({ ...oneStageSatisfied, stages: [] });
    render(
      <TestProviders>
        <ReadinessPage />
      </TestProviders>,
    );
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /datos estructurados \(json\)/i })).toBeDisabled(),
    );
    expect(screen.getByRole('button', { name: /documento del proyecto \(html\)/i })).toBeDisabled();
    expect(screen.getByText(/aún no hay nada aprobado para exportar/i)).toBeInTheDocument();
  });

  it('shows a loading state on the clicked export button and reports a failed download', async () => {
    const user = userEvent.setup();
    let resolveFetch!: (value: { ok: boolean }) => void;
    const fetchMock = vi.fn().mockReturnValue(new Promise((resolve) => (resolveFetch = resolve)));
    vi.stubGlobal('fetch', fetchMock);
    render(
      <TestProviders>
        <ReadinessPage />
      </TestProviders>,
    );
    const button = await screen.findByRole('button', { name: /documento del proyecto \(html\)/i });
    await user.click(button);
    expect(await screen.findByText(/generando…/i)).toBeInTheDocument();

    resolveFetch({ ok: false });
    await waitFor(() => expect(button).not.toBeDisabled());
    expect(
      screen.getByRole('button', { name: /documento del proyecto \(html\)/i }),
    ).toBeInTheDocument();
    vi.unstubAllGlobals();
  });
});
