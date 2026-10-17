import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ReadinessPage from './page';
import { TestProviders } from '../../lib/test-utils';

const getReadiness = vi.fn();
const getConsistency = vi.fn();

vi.mock('../../lib/api', () => ({
  api: {
    readiness: { get: (...args: unknown[]) => getReadiness(...args) },
    consistency: { get: (...args: unknown[]) => getConsistency(...args) },
    export: {
      url: (projectId: string, format: string) =>
        `http://localhost:3001/projects/${projectId}/export?format=${format}`,
    },
  },
  ApiError: class ApiError extends Error {},
  restoreSession: vi.fn(),
  downloadFile: (...args: unknown[]) => downloadFile(...args),
  fetchBlob: (...args: unknown[]) => fetchBlob(...args),
}));

const downloadFile = vi.fn();
const fetchBlob = vi.fn();

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
  getConsistency.mockReset().mockResolvedValue({ totalArtifacts: 5, issues: [] });
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
    let rejectDownload!: (reason: Error) => void;
    downloadFile.mockReturnValue(new Promise((_, reject) => (rejectDownload = reject)));
    render(
      <TestProviders>
        <ReadinessPage />
      </TestProviders>,
    );
    const button = await screen.findByRole('button', { name: /datos estructurados \(json\)/i });
    await user.click(button);
    expect(await screen.findByText(/generando…/i)).toBeInTheDocument();

    expect(downloadFile).toHaveBeenCalledWith(
      'http://localhost:3001/projects/p1/export?format=json',
      'proyecto-p1.json',
    );

    rejectDownload(new Error('boom'));
    await waitFor(() => expect(button).not.toBeDisabled());
    expect(
      screen.getByRole('button', { name: /datos estructurados \(json\)/i }),
    ).toBeInTheDocument();
  });

  it('opens the HTML document in a preview first, without downloading it', async () => {
    const user = userEvent.setup();
    // jsdom's Blob lacks text(); browsers implement it.
    fetchBlob.mockResolvedValue({ text: async () => '<h1>Proyecto</h1>' });
    render(
      <TestProviders>
        <ReadinessPage />
      </TestProviders>,
    );
    await user.click(
      await screen.findByRole('button', { name: /documento del proyecto \(html\)/i }),
    );
    expect(await screen.findByTitle('Documento del proyecto')).toHaveAttribute(
      'srcdoc',
      '<h1>Proyecto</h1>',
    );
    expect(fetchBlob).toHaveBeenCalledWith('http://localhost:3001/projects/p1/export?format=html');
    expect(downloadFile).not.toHaveBeenCalled();
  });

  it('filters stages between all, completed, and pending', async () => {
    getReadiness.mockResolvedValueOnce({
      ...oneStageSatisfied,
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
        {
          key: 'CONTEXT',
          label: 'Contexto del proyecto',
          satisfied: false,
          summary: 'requiere revisión',
          blockers: ['Falta contexto'],
          warnings: [],
          nextAction: null,
        },
      ],
    });

    const user = userEvent.setup();
    render(
      <TestProviders>
        <ReadinessPage />
      </TestProviders>,
    );

    expect(await screen.findByText('Fuentes del proyecto')).toBeInTheDocument();
    expect(screen.getByText('Contexto del proyecto')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Completadas \(1\)/i }));
    expect(screen.getByText('Fuentes del proyecto')).toBeInTheDocument();
    expect(screen.queryByText('Contexto del proyecto')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Pendientes \(1\)/i }));
    expect(screen.queryByText('Fuentes del proyecto')).not.toBeInTheDocument();
    expect(screen.getByText('Contexto del proyecto')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Todas \(2\)/i }));
    expect(screen.getByText('Fuentes del proyecto')).toBeInTheDocument();
    expect(screen.getByText('Contexto del proyecto')).toBeInTheDocument();
  });

  it('renders consistency report with issues, severity badges, and affected artifact links', async () => {
    getConsistency.mockResolvedValueOnce({
      totalArtifacts: 8,
      issues: [
        {
          rule: 'Mockup Association',
          severity: 'ERROR',
          message: 'Toda pantalla de plano debe tener un boceto asociado.',
          affectedArtifactIds: ['art1-screens'],
        },
      ],
    });

    render(
      <TestProviders>
        <ReadinessPage />
      </TestProviders>,
    );

    expect(await screen.findByText(/\[Asociación de boceto\]/i)).toBeInTheDocument();
    expect(
      screen.getByText('Toda pantalla de plano debe tener un boceto asociado.'),
    ).toBeInTheDocument();
    expect(screen.getByText('Crítico')).toBeInTheDocument();
    expect(screen.getByText('art1')).toBeInTheDocument();
    expect(screen.getByText('art1').closest('a')).toHaveAttribute(
      'href',
      '/projects/p1/artifacts/art1-screens',
    );
  });
});
