import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TestProviders } from '../../../lib/test-utils';
import { ManualImplementationDialog } from './manual-implementation-dialog';

const mocks = vi.hoisted(() => ({ manual: vi.fn(), onImported: vi.fn() }));

vi.mock('../../../lib/api', () => ({
  api: { generationRuns: { manual: (...args: unknown[]) => mocks.manual(...args) } },
  ApiError: class ApiError extends Error {},
  restoreSession: vi.fn(),
}));

describe('ManualImplementationDialog', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.manual.mockResolvedValue({ id: 'run-manual' });
  });

  it('uploads the ZIP with the approved implementation plan', async () => {
    const user = userEvent.setup();
    render(
      <ManualImplementationDialog
        projectId="project-1"
        implementationPlanVersionId="plan-1"
        onImported={mocks.onImported}
      />,
      { wrapper: TestProviders },
    );

    await user.click(screen.getByRole('button', { name: 'Importar implementación manual' }));
    expect(
      screen.getByText(
        /El proyecto se valida en el sandbox como uno generado, sin IA ni reparación automática/,
      ),
    ).toBeVisible();
    const input = screen.getByLabelText('Archivo ZIP');
    const file = new File(['archive'], 'project.zip', { type: 'application/zip' });
    await user.upload(input, file);
    await user.click(screen.getByRole('button', { name: 'Importar implementación' }));

    await waitFor(() => expect(mocks.manual).toHaveBeenCalledWith('project-1', 'plan-1', file));
    await waitFor(() => expect(mocks.onImported).toHaveBeenCalledWith('run-manual'));
  });
});
