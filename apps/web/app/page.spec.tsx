import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import HomePage from './page';
import { TestProviders } from '../lib/test-utils';

vi.mock('../lib/api', () => ({
  api: {
    projects: { get: vi.fn().mockResolvedValue({ id: 'p1', name: 'Proyecto Demo' }) },
    readiness: {
      get: vi.fn().mockResolvedValue({
        projectId: 'p1',
        generatedAt: new Date().toISOString(),
        ready: false,
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
            summary: 'Falta aprobar el contexto.',
            blockers: ['Se requiere un Contexto APPROVED.'],
            warnings: [],
            nextAction: 'Aprobar el Contexto.',
          },
        ],
        blockers: ['Se requiere un Contexto APPROVED.'],
        warnings: [],
      }),
    },
    staleness: {
      get: vi.fn().mockResolvedValue({
        projectId: 'p1',
        generatedAt: new Date().toISOString(),
        entries: [
          {
            artifactId: 'ctx',
            artifactVersionId: 'ctx-v1',
            artifactType: 'PROJECT_CONTEXT',
            code: 'CTX-001',
            versionNumber: 1,
            impactState: 'NEWER_APPROVED_KNOWLEDGE_AVAILABLE',
            reasons: [],
          },
        ],
      }),
    },
  },
  ApiError: class ApiError extends Error {},
}));

beforeEach(() => {
  window.localStorage.setItem('caseflow.activeProjectId', 'p1');
});

describe('HomePage', () => {
  it('consumes backend readiness rather than recomputing it (behavior 4)', async () => {
    render(
      <TestProviders>
        <HomePage />
      </TestProviders>,
    );
    await waitFor(() => expect(screen.getByText(/no listo todavía/i)).toBeInTheDocument());
  });

  it('surfaces the staleness/potential-impact warning with careful wording (behaviors 5, 18)', async () => {
    render(
      <TestProviders>
        <HomePage />
      </TestProviders>,
    );
    await waitFor(() =>
      expect(
        screen.getByText(/hay conocimiento aprobado más reciente disponible/i),
      ).toBeInTheDocument(),
    );
    expect(screen.queryByText(/invalid|incorrect|broken/i)).not.toBeInTheDocument();
  });
});
