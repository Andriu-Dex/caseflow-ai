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
    },
    structuredAnalysis: { list: (...args: unknown[]) => mocks.listBlueprints(...args) },
  },
  ApiError: class ApiError extends Error {},
}));

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
      { id: 'screen-1', screenLocalId: 's1', screenName: 'Inicio', imageUrl: '', htmlUrl: '' },
      { id: 'screen-2', screenLocalId: 's2', screenName: 'Catálogo', imageUrl: '', htmlUrl: '' },
      { id: 'screen-3', screenLocalId: 's3', screenName: 'Detalle', imageUrl: '', htmlUrl: '' },
    ],
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
    expect(within(dialog).getByRole('img', { name: 'Inicio' })).toBeInTheDocument();
    expect(within(dialog).getByText('1 / 3')).toBeInTheDocument();

    await user.click(within(dialog).getByRole('button', { name: /siguiente/i }));
    dialog = screen.getByRole('dialog');
    expect(within(dialog).getByRole('img', { name: 'Catálogo' })).toBeInTheDocument();

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
