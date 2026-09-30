import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import type { MockupJobResponse } from '@caseflow-ai/contracts';
import MockupsPage, { pollMockupJob } from './page';
import { TestProviders } from '../../../lib/test-utils';

const mocks = vi.hoisted(() => ({
  listMockups: vi.fn(),
  getPreview: vi.fn(),
  listBlueprints: vi.fn(),
  refine: vi.fn(),
  refineScreen: vi.fn(),
  getJob: vi.fn(),
  downloadAllUrl: vi.fn((projectId: string, mockupId: string) => `/${projectId}/${mockupId}.zip`),
  screenImageUrl: vi.fn(
    (projectId: string, mockupId: string, screenId: string) =>
      `/${projectId}/${mockupId}/${screenId}.png`,
  ),
  screenHtmlUrl: vi.fn(
    (projectId: string, mockupId: string, screenId: string) =>
      `/${projectId}/${mockupId}/${screenId}.html`,
  ),
}));

vi.mock('../../../lib/api', () => ({
  api: {
    mockups: {
      downloadAllUrl: mocks.downloadAllUrl,
      list: (...args: unknown[]) => mocks.listMockups(...args),
      getPreview: (...args: unknown[]) => mocks.getPreview(...args),
      screenImageUrl: mocks.screenImageUrl,
      screenHtmlUrl: mocks.screenHtmlUrl,
      transition: vi.fn(),
      refine: (...args: unknown[]) => mocks.refine(...args),
      refineScreen: (...args: unknown[]) => mocks.refineScreen(...args),
      getJob: (...args: unknown[]) => mocks.getJob(...args),
    },
    structuredAnalysis: { list: (...args: unknown[]) => mocks.listBlueprints(...args) },
  },
  ApiError: class ApiError extends Error {},
  restoreSession: vi.fn(),
  downloadFile: vi.fn(),
  fetchBlob: vi.fn(async () => new Blob(['png'], { type: 'image/png' })),
}));

// jsdom implements neither; images are fetched with the token and shown via object URLs.
URL.createObjectURL = vi.fn(() => 'blob:mock');
URL.revokeObjectURL = vi.fn();

vi.mock('../../../components/artifact-actions', () => ({
  ApproveAllButton: () => null,
  ArchiveButton: () => null,
  EmptyState: ({ title, children }: { title: string; children: ReactNode }) => (
    <div>
      {title}
      {children}
    </div>
  ),
  approveDirectly: vi.fn(),
  isPendingApproval: () => false,
}));

function stitchScreen(id: string, screenName: string, editable: boolean) {
  return {
    id,
    screenLocalId: id,
    screenName,
    imageUrl: '',
    htmlUrl: '',
    editable,
    refinementPrompt: null,
  };
}

beforeEach(() => {
  window.localStorage.setItem('caseflow.activeProjectId', 'p1');
  mocks.listMockups.mockResolvedValue({
    items: [
      {
        id: 'mockup-1',
        projectId: 'p1',
        code: 'MCK-001',
        uiBlueprintVersionId: 'blueprint-version-1',
        deviceType: 'DESKTOP',
        version: {
          id: 'mockup-version-1',
          versionNumber: 1,
          status: 'GENERATED',
          origin: 'SYSTEM_GENERATED',
          createdAt: new Date().toISOString(),
        },
        createdAt: new Date().toISOString(),
      },
    ],
  });
  mocks.listBlueprints.mockResolvedValue({ items: [] });
  mocks.getPreview.mockResolvedValue({
    id: 'mockup-1',
    projectId: 'p1',
    code: 'MCK-001',
    versionId: 'mockup-version-1',
    uiBlueprintVersionId: 'blueprint-version-1',
    deviceType: 'DESKTOP',
    generatorKind: 'STITCH',
    svg: null,
    screens: [
      stitchScreen('screen-1', 'Inicio', true),
      stitchScreen('screen-2', 'Catálogo', true),
      stitchScreen('screen-3', 'Detalle', false),
    ],
    refinementPrompt: null,
    createdAt: new Date().toISOString(),
  });
});

function job(status: MockupJobResponse['status']): MockupJobResponse {
  return { status } as MockupJobResponse;
}

describe('pollMockupJob', () => {
  it('returns a completed job without waiting', async () => {
    const getJob = vi.fn().mockResolvedValue(job('COMPLETED'));
    const delay = vi.fn();
    await expect(pollMockupJob(getJob, () => 0, delay)).resolves.toEqual({
      timedOut: false,
      job: job('COMPLETED'),
    });
    expect(delay).not.toHaveBeenCalled();
  });

  it('reports queue and running states as the job progresses', async () => {
    const statuses: MockupJobResponse['status'][] = [];
    const getJob = vi
      .fn()
      .mockResolvedValueOnce(job('QUEUED'))
      .mockResolvedValueOnce(job('RUNNING'))
      .mockResolvedValueOnce(job('COMPLETED'));
    const delay = vi.fn().mockResolvedValue(undefined);

    await pollMockupJob(
      getJob,
      () => 0,
      delay,
      (status) => statuses.push(status),
    );

    expect(statuses).toEqual(['QUEUED', 'RUNNING', 'COMPLETED']);
  });

  it.each(['QUEUED', 'RUNNING'] as const)(
    'stops polling after six minutes while the job is %s',
    async (status) => {
      let elapsed = 0;
      const getJob = vi.fn().mockResolvedValue(job(status));
      const delay = vi.fn(async (milliseconds: number) => {
        expect(milliseconds).toBe(2_000);
        elapsed = 6 * 60_000;
      });
      await expect(pollMockupJob(getJob, () => elapsed, delay)).resolves.toEqual({
        timedOut: true,
        status,
      });
      expect(getJob).toHaveBeenCalledTimes(2);
      expect(delay).toHaveBeenCalledTimes(1);
    },
  );
});

describe('MockupsPage refinement', () => {
  it('sends the instruction to refine a Stitch mockup and clears it once a new version exists', async () => {
    const user = userEvent.setup();
    mocks.refine.mockResolvedValue(job('QUEUED'));
    mocks.getJob.mockResolvedValue(job('COMPLETED'));
    render(
      <TestProviders>
        <MockupsPage />
      </TestProviders>,
    );
    const input = await screen.findByLabelText('Editar todas las pantallas');
    const submit = screen.getByRole('button', { name: /aplicar cambios/i });
    expect(submit).toBeDisabled();
    await user.type(input, 'Usa tonos verdes');
    await user.click(submit);
    await waitFor(() => expect(input).toHaveValue(''));
    expect(mocks.refine).toHaveBeenCalledWith('p1', 'mockup-1', 'Usa tonos verdes');
  });

  it('edits a single screen from its own dialog and only offers it for editable screens', async () => {
    const user = userEvent.setup();
    mocks.refineScreen.mockResolvedValue(job('QUEUED'));
    mocks.getJob.mockResolvedValue(job('COMPLETED'));
    render(
      <TestProviders>
        <MockupsPage />
      </TestProviders>,
    );
    await user.click(
      await screen.findByRole('button', { name: 'Editar la pantalla Catálogo con instrucciones' }),
    );
    expect(
      screen.queryByRole('button', { name: 'Editar la pantalla Detalle con instrucciones' }),
    ).not.toBeInTheDocument();
    expect(screen.getByText(/regenere el boceto completo una vez/i)).toBeInTheDocument();

    const dialog = screen.getByRole('dialog');
    await user.type(
      within(dialog).getByLabelText('Instrucciones para esta pantalla'),
      'Agrega un buscador',
    );
    await user.click(within(dialog).getByRole('button', { name: /aplicar cambios/i }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(mocks.refineScreen).toHaveBeenCalledWith(
      'p1',
      'mockup-1',
      'screen-2',
      'Agrega un buscador',
    );
    expect(mocks.refine).not.toHaveBeenCalled();
  });

  it('explains that an internal wireframe cannot be refined instead of offering the form', async () => {
    mocks.getPreview.mockResolvedValue({
      id: 'mockup-1',
      generatorKind: 'INTERNAL_WIREFRAME',
      svg: '<svg></svg>',
      screens: null,
      refinementPrompt: null,
    });
    render(
      <TestProviders>
        <MockupsPage />
      </TestProviders>,
    );
    expect(await screen.findByText(/no puede editarse con instrucciones/i)).toBeInTheDocument();
    expect(screen.queryByLabelText('Editar todas las pantallas')).not.toBeInTheDocument();
  });
});

describe('MockupsPage screen gallery', () => {
  it('opens a large screen viewer and navigates with buttons and keyboard arrows', async () => {
    const user = userEvent.setup();
    render(
      <TestProviders>
        <MockupsPage />
      </TestProviders>,
    );

    const firstScreen = await screen.findByRole('button', { name: 'Ampliar pantalla Inicio' });
    expect(screen.getByRole('button', { name: 'Ampliar pantalla Catálogo' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Ampliar pantalla Detalle' })).toBeInTheDocument();

    await user.click(firstScreen);
    let dialog = screen.getByRole('dialog');
    expect(await within(dialog).findByRole('img', { name: 'Inicio' })).toBeInTheDocument();
    expect(mocks.screenImageUrl).toHaveBeenCalledWith('p1', 'mockup-1', 'screen-1');
    expect(within(dialog).getByText('1 / 3')).toBeInTheDocument();

    await user.click(within(dialog).getByRole('button', { name: /siguiente/i }));
    dialog = screen.getByRole('dialog');
    expect(await within(dialog).findByRole('img', { name: 'Catálogo' })).toBeInTheDocument();

    fireEvent.keyDown(window, { key: 'ArrowRight' });
    await waitFor(() =>
      expect(
        within(screen.getByRole('dialog')).getByRole('img', { name: 'Detalle' }),
      ).toBeInTheDocument(),
    );
    fireEvent.keyDown(window, { key: 'ArrowRight' });
    await waitFor(() =>
      expect(
        within(screen.getByRole('dialog')).getByRole('img', { name: 'Inicio' }),
      ).toBeInTheDocument(),
    );
  });
});
