import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import TraceabilityPage from './page';
import { TestProviders } from '../../lib/test-utils';

vi.mock('../../lib/api', () => ({
  api: {
    traceability: {
      get: vi.fn().mockResolvedValue({
        projectId: 'p1',
        generatedAt: new Date().toISOString(),
        nodes: [
          {
            id: 'v1',
            artifactId: 'a1',
            artifactType: 'REQUIREMENT',
            code: 'RF-001',
            versionNumber: 1,
            status: 'APPROVED',
            origin: 'MANUAL',
            title: 'Registrar pedido',
            isCurrent: true,
            generation: null,
            generator: null,
          },
        ],
        edges: [],
        truncated: true,
      }),
    },
  },
  ApiError: class ApiError extends Error {},
}));

beforeEach(() => {
  window.localStorage.setItem('caseflow.activeProjectId', 'p1');
});

describe('TraceabilityPage (behavior 16: truncation notice)', () => {
  it('shows a clear notice when the graph was bounded, never implying completeness', async () => {
    render(
      <TestProviders>
        <TraceabilityPage />
      </TestProviders>,
    );
    await waitFor(() => expect(screen.getByText(/fue acotado por tamaño/i)).toBeInTheDocument());
  });
});
