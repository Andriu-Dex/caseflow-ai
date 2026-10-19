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
  cancelJob: vi.fn(),
  create: vi.fn(),
  latestJob: vi.fn<(...args: unknown[]) => Promise<{ job: MockupJobResponse | null }>>(
    async () => ({
      job: null,
    }),
  ),
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
      create: (...args: unknown[]) => mocks.create(...args),
      refine: (...args: unknown[]) => mocks.refine(...args),
      refineScreen: (...args: unknown[]) => mocks.refineScreen(...args),
      getJob: (...args: unknown[]) => mocks.getJob(...args),
      cancelJob: (...args: unknown[]) => mocks.cancelJob(...args),
      latestJob: (...args: unknown[]) => mocks.latestJob(...args),
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
    'stops polling after two hours while the job is %s',
    async (status) => {
      let elapsed = 0;
      const getJob = vi.fn().mockResolvedValue(job(status));
      const delay = vi.fn(async (milliseconds: number) => {
        expect(milliseconds).toBe(2_000);
        elapsed = 2 * 60 * 60_000;
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

  it('filters screens in real time using the search input and restores them when cleared', async () => {
    const user = userEvent.setup();
    render(
      <TestProviders>
        <MockupsPage />
      </TestProviders>,
    );

    expect(await screen.findByText('Inicio')).toBeInTheDocument();
    expect(screen.getByText('Catálogo')).toBeInTheDocument();
    expect(screen.getByText('Detalle')).toBeInTheDocument();
    expect(screen.getByText(/Mostrando/)).toHaveTextContent('Mostrando 3 de 3 pantallas');

    const searchInput = screen.getByLabelText('Buscar pantalla en el boceto');
    await user.type(searchInput, 'Catálogo');

    expect(screen.getByText('Catálogo')).toBeInTheDocument();
    expect(screen.queryByText('Inicio')).not.toBeInTheDocument();
    expect(screen.queryByText('Detalle')).not.toBeInTheDocument();
    expect(screen.getByText(/Mostrando/)).toHaveTextContent('Mostrando 1 de 3 pantallas');

    const clearBtn = screen.getByRole('button', { name: 'Borrar búsqueda' });
    await user.click(clearBtn);

    expect(screen.getByText('Inicio')).toBeInTheDocument();
    expect(screen.getByText('Catálogo')).toBeInTheDocument();
    expect(screen.getByText('Detalle')).toBeInTheDocument();
  });

  it('shows empty search state when no screen matches query', async () => {
    const user = userEvent.setup();
    render(
      <TestProviders>
        <MockupsPage />
      </TestProviders>,
    );

    await screen.findByText('Inicio');
    const searchInput = screen.getByLabelText('Buscar pantalla en el boceto');
    await user.type(searchInput, 'InexistenteXYZ');

    expect(screen.getByText('No se encontraron pantallas')).toBeInTheDocument();
    expect(screen.getByText(/No hay ninguna pantalla que coincida con/i)).toBeInTheDocument();

    const resetBtn = screen.getByRole('button', { name: 'Limpiar búsqueda' });
    await user.click(resetBtn);
    expect(screen.getByText('Inicio')).toBeInTheDocument();
  });
});

describe('MockupsPage refinement suggestions and options', () => {
  it('populates refinement input when clicking suggestion chips', async () => {
    const user = userEvent.setup();
    render(
      <TestProviders>
        <MockupsPage />
      </TestProviders>,
    );

    const input = await screen.findByLabelText('Editar todas las pantallas');
    expect(input).toHaveValue('');

    const suggestionBtn = screen.getByRole('button', {
      name: /\+ Paleta con mayor contraste y legibilidad/i,
    });
    await user.click(suggestionBtn);

    expect(input).toHaveValue('Paleta con mayor contraste y legibilidad');

    const secondSuggestion = screen.getByRole('button', {
      name: /\+ Tipografía moderna con jerarquía clara/i,
    });
    await user.click(secondSuggestion);
    expect(input).toHaveValue(
      'Paleta con mayor contraste y legibilidad, Tipografía moderna con jerarquía clara',
    );
  });
});

describe('MockupsPage generation and badges', () => {
  it('renders approved blueprint with device toggle and allows switching to mobile', async () => {
    mocks.listBlueprints.mockResolvedValueOnce({
      items: [
        {
          id: 'bp-1',
          code: 'UI-001',
          title: 'Plano Principal',
          content: { screens: [{ id: 's1' }, { id: 's2' }] },
          version: { id: 'bp-v1', status: 'APPROVED' },
        },
      ],
    });

    render(
      <TestProviders>
        <MockupsPage />
      </TestProviders>,
    );

    expect(await screen.findByText('UI-001')).toBeInTheDocument();
    expect(screen.getByText('Plano Principal')).toBeInTheDocument();
    expect(screen.getByText('2 pantallas')).toBeInTheDocument();

    const desktopRadio = screen.getByRole('radio', { name: /Escritorio/i });
    const mobileRadio = screen.getByRole('radio', { name: /Móvil/i });

    expect(desktopRadio).toHaveAttribute('aria-checked', 'true');
    expect(mobileRadio).toHaveAttribute('aria-checked', 'false');

    fireEvent.click(mobileRadio);
    expect(mobileRadio).toHaveAttribute('aria-checked', 'true');
    expect(desktopRadio).toHaveAttribute('aria-checked', 'false');
  });

  it('renders mockup header badges for code, device and version', async () => {
    render(
      <TestProviders>
        <MockupsPage />
      </TestProviders>,
    );

    expect(await screen.findByText('MCK-001')).toBeInTheDocument();
    expect(screen.getByText('v1')).toBeInTheDocument();
    expect(screen.getAllByText('Escritorio').length).toBeGreaterThan(0);
  });
});

describe('MockupsPage background generation (DEC-146)', () => {
  it('follows a generation still running when the page opens, showing the screens done', async () => {
    const running = {
      id: 'job-9',
      status: 'RUNNING',
      completedScreens: 2,
      totalScreens: 5,
      errorMessage: null,
    } as MockupJobResponse;
    mocks.latestJob.mockResolvedValueOnce({ job: running });
    mocks.getJob
      .mockResolvedValueOnce(running)
      .mockResolvedValue({ ...running, status: 'COMPLETED', completedScreens: 5 });
    render(
      <TestProviders>
        <MockupsPage />
      </TestProviders>,
    );
    expect(await screen.findByText(/2 de 5 pantallas listas/)).toBeInTheDocument();
    const bar = screen.getByRole('progressbar');
    expect(bar).toHaveAttribute('aria-valuenow', '2');
    expect(bar).toHaveAttribute('aria-valuemax', '5');
    await waitFor(() => expect(mocks.getJob).toHaveBeenCalledWith('p1', 'job-9'));
  });

  it('offers to continue a generation that stopped with screens already drawn', async () => {
    const user = userEvent.setup();
    const stopped = {
      id: 'job-8',
      status: 'FAILED',
      completedScreens: 76,
      totalScreens: 77,
      uiBlueprintVersionId: 'blueprint-version-1',
      deviceType: 'DESKTOP',
      errorMessage: 'Faltan 1 de 77 pantallas. Vuelva a generar el boceto.',
    } as MockupJobResponse;
    mocks.latestJob.mockResolvedValueOnce({ job: stopped });
    mocks.create.mockResolvedValue({ ...stopped, status: 'QUEUED' });
    mocks.getJob.mockResolvedValue({ ...stopped, status: 'COMPLETED', completedScreens: 77 });
    render(
      <TestProviders>
        <MockupsPage />
      </TestProviders>,
    );
    expect(await screen.findByText(/76 de 77/)).toBeInTheDocument();
    expect(screen.getByText(/Faltan 1 de 77 pantallas/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Continuar la generación' }));
    expect(mocks.create).toHaveBeenCalledWith('p1', 'blueprint-version-1', 'DESKTOP');
  });

  it('scrolls a screen with the wheel and zooms it only with Ctrl + wheel, in the dialog', async () => {
    const user = userEvent.setup();
    render(
      <TestProviders>
        <MockupsPage />
      </TestProviders>,
    );
    await user.click(await screen.findByRole('button', { name: 'Ampliar pantalla Inicio' }));
    const box = await screen.findByLabelText(/Vista ampliable/);
    await waitFor(() => expect(screen.getByText('100%')).toBeInTheDocument());

    // The plain wheel does not zoom.
    fireEvent.wheel(box, { deltaY: -100 });
    expect(screen.getByText('100%')).toBeInTheDocument();
    // Ctrl + wheel does, up and down. The native listener is attached a moment
    // after the dialog opens, so the first wheel is repeated until it is there.
    await waitFor(() => {
      fireEvent.wheel(box, { deltaY: -100, ctrlKey: true });
      expect(screen.getByText('125%')).toBeInTheDocument();
    });
    fireEvent.wheel(box, { deltaY: 100, ctrlKey: true });
    expect(screen.getByText('100%')).toBeInTheDocument();
  });

  it('asks before generating a mockup with Stitch, with the screens and the time, and does nothing if cancelled', async () => {
    const user = userEvent.setup();
    mocks.listBlueprints.mockResolvedValue({
      items: [
        {
          id: 'bp-1',
          code: 'UI-002',
          version: { id: 'bp-version-1', status: 'APPROVED' },
          content: { screens: Array.from({ length: 77 }, (_, i) => ({ localId: `s${i}` })) },
        },
      ],
    });
    mocks.create.mockResolvedValue({ id: 'job-1', status: 'QUEUED' });
    mocks.getJob.mockResolvedValue({ id: 'job-1', status: 'COMPLETED' });
    render(
      <TestProviders>
        <MockupsPage />
      </TestProviders>,
    );
    await user.click(await screen.findByRole('button', { name: /Generar boceto/ }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText(/77 pantallas de escritorio/)).toBeInTheDocument();
    expect(within(dialog).getByText(/unos 40 minutos/)).toBeInTheDocument();
    expect(within(dialog).getByText(/créditos de Stitch/)).toBeInTheDocument();
    expect(mocks.create).not.toHaveBeenCalled();

    await user.click(within(dialog).getByRole('button', { name: 'Cancelar' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(mocks.create).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: /Generar boceto/ }));
    await user.click(
      within(await screen.findByRole('dialog')).getByRole('button', { name: 'Generar boceto' }),
    );
    await waitFor(() => expect(mocks.create).toHaveBeenCalledWith('p1', 'bp-version-1', 'DESKTOP'));
  });

  it('cancels a running generation after asking, and offers to continue what was drawn', async () => {
    const user = userEvent.setup();
    mocks.listBlueprints.mockResolvedValue({
      items: [
        {
          id: 'bp-1',
          code: 'UI-002',
          version: { id: 'bp-version-1', status: 'APPROVED' },
          content: { screens: [{ localId: 's1' }, { localId: 's2' }] },
        },
      ],
    });
    const base = {
      id: 'job-1',
      uiBlueprintVersionId: 'bp-version-1',
      deviceType: 'DESKTOP',
      totalScreens: 2,
      completedScreens: 1,
    };
    let cancelled = false;
    mocks.create.mockResolvedValue({ ...base, status: 'RUNNING' });
    mocks.getJob.mockImplementation(async () =>
      cancelled
        ? {
            ...base,
            status: 'CANCELLED',
            errorMessage: 'Se canceló con 1 de 2 pantallas generadas.',
          }
        : { ...base, status: 'RUNNING' },
    );
    mocks.cancelJob.mockImplementation(async () => {
      cancelled = true;
      return { ...base, status: 'CANCELLED' };
    });
    render(
      <TestProviders>
        <MockupsPage />
      </TestProviders>,
    );
    await user.click(await screen.findByRole('button', { name: /Generar boceto/ }));
    await user.click(
      within(await screen.findByRole('dialog')).getByRole('button', { name: 'Generar boceto' }),
    );
    await user.click(await screen.findByRole('button', { name: 'Cancelar la generación' }));
    expect(mocks.cancelJob).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Sí, cancelar' }));
    expect(mocks.cancelJob).toHaveBeenCalledWith('p1', 'job-1');
    expect(
      await screen.findByRole('button', { name: 'Continuar la generación' }, { timeout: 5000 }),
    ).toBeInTheDocument();
  }, 10_000);
});
