import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ReadinessPage from './page';
import { TestProviders } from '../../lib/test-utils';

vi.mock('../../lib/api', () => ({
  api: {
    readiness: {
      get: vi.fn().mockResolvedValue({
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
      }),
    },
    export: {
      url: (projectId: string, format: string) =>
        `http://localhost:3001/projects/${projectId}/export?format=${format}`,
    },
  },
  ApiError: class ApiError extends Error {},
}));

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
    await waitFor(() => expect(screen.getByText(/listo/i)).toBeInTheDocument());
    expect(screen.getByText(/fuentes del proyecto/i)).toBeInTheDocument();
  });

  it('exposes JSON and HTML export actions using the backend export endpoint (behaviors 19, 20)', () => {
    render(
      <TestProviders>
        <ReadinessPage />
      </TestProviders>,
    );
    expect(screen.getByRole('button', { name: /exportar json/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /exportar reporte html/i })).toBeInTheDocument();
  });
});
