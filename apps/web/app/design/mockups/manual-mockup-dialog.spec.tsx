import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TestProviders } from '../../../lib/test-utils';
import { ManualMockupDialog } from './manual-mockup-dialog';

const mocks = vi.hoisted(() => ({ importManual: vi.fn(), onImported: vi.fn() }));

vi.mock('../../../lib/api', () => ({
  api: { mockups: { importManual: (...args: unknown[]) => mocks.importManual(...args) } },
  ApiError: class ApiError extends Error {},
  restoreSession: vi.fn(),
}));

describe('ManualMockupDialog', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.importManual.mockResolvedValue({ id: 'mockup-1', code: 'MCK-001' });
  });

  async function upload(target?: string) {
    const user = userEvent.setup();
    render(
      <ManualMockupDialog
        projectId="project-1"
        uiBlueprintVersionId="blueprint-1"
        deviceType="DESKTOP"
        mockups={[{ id: 'mockup-1', code: 'MCK-001' }]}
        onImported={mocks.onImported}
      />,
      { wrapper: TestProviders },
    );
    await user.click(screen.getByRole('button', { name: 'Importar boceto hecho a mano' }));
    if (target !== undefined)
      await user.selectOptions(screen.getByLabelText('Guardar como'), target);
    const file = new File(['archive'], 'bocetos.zip', { type: 'application/zip' });
    await user.upload(screen.getByLabelText('Archivo ZIP'), file);
    await user.click(screen.getByRole('button', { name: 'Importar boceto' }));
    return file;
  }

  it('imports the ZIP as the next version of the chosen mockup', async () => {
    const file = await upload();
    await waitFor(() =>
      expect(mocks.importManual).toHaveBeenCalledWith(
        'project-1',
        { uiBlueprintVersionId: 'blueprint-1', deviceType: 'DESKTOP', mockupId: 'mockup-1' },
        file,
      ),
    );
    await waitFor(() => expect(mocks.onImported).toHaveBeenCalled());
  });

  it('imports the ZIP as a new mockup when asked', async () => {
    const file = await upload('');
    await waitFor(() =>
      expect(mocks.importManual).toHaveBeenCalledWith(
        'project-1',
        { uiBlueprintVersionId: 'blueprint-1', deviceType: 'DESKTOP', mockupId: undefined },
        file,
      ),
    );
  });
});
