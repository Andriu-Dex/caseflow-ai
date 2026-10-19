import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import BaselinesPage from './page';
import { TestProviders } from '../../lib/test-utils';
import type { BaselineResponse } from '@caseflow-ai/contracts';

const listBaselines = vi.fn();
const createBaseline = vi.fn();
const downloadFile = vi.fn();
const fetchBlob = vi.fn();

vi.mock('../../lib/api', () => ({
  api: {
    baselines: {
      list: (...args: unknown[]) => listBaselines(...args),
      create: (...args: unknown[]) => createBaseline(...args),
      exportHtmlUrl: (projectId: string, id: string) =>
        `http://localhost:3001/projects/${projectId}/baselines/${id}/export?format=html`,
      exportJsonUrl: (projectId: string, id: string) =>
        `http://localhost:3001/projects/${projectId}/baselines/${id}/export?format=json`,
    },
  },
  ApiError: class ApiError extends Error {},
  restoreSession: vi.fn(),
  currentUserId: () => 'u1',
  downloadFile: (...args: unknown[]) => downloadFile(...args),
  fetchBlob: (...args: unknown[]) => fetchBlob(...args),
}));

const writeTextMock = vi.fn().mockResolvedValue(undefined);
Object.defineProperty(navigator, 'clipboard', {
  value: { writeText: writeTextMock },
  writable: true,
  configurable: true,
});

const mockBaselines: BaselineResponse[] = [
  {
    id: '00000000-0000-0000-0000-000000000001',
    projectId: 'p1',
    label: 'v1.0.0',
    description: 'Primera línea base oficial con requisitos y modelos aprobados.',
    createdAt: '2026-10-18T10:00:00.000Z',
    createdByUserId: '11111111-1111-1111-1111-111111111111',
    user: {
      id: '11111111-1111-1111-1111-111111111111',
      email: 'lead@example.com',
      displayName: 'Arquitecto Principal',
    },
    entries: [
      {
        id: '22222222-2222-2222-2222-222222222221',
        baselineId: '00000000-0000-0000-0000-000000000001',
        artifactId: '33333333-3333-3333-3333-333333333331',
        artifactVersionId: '44444444-4444-4444-4444-444444444441',
      },
      {
        id: '22222222-2222-2222-2222-222222222222',
        baselineId: '00000000-0000-0000-0000-000000000001',
        artifactId: '33333333-3333-3333-3333-333333333332',
        artifactVersionId: '44444444-4444-4444-4444-444444444442',
      },
    ],
  },
  {
    id: '00000000-0000-0000-0000-000000000002',
    projectId: 'p1',
    label: 'v1.1.0-alpha',
    description: 'Bocetos y plano de interfaz congelados.',
    createdAt: '2026-10-18T14:00:00.000Z',
    createdByUserId: '11111111-1111-1111-1111-111111111111',
    user: {
      id: '11111111-1111-1111-1111-111111111111',
      email: 'lead@example.com',
      displayName: 'Arquitecto Principal',
    },
    entries: [
      {
        id: '22222222-2222-2222-2222-222222222223',
        baselineId: '00000000-0000-0000-0000-000000000002',
        artifactId: '33333333-3333-3333-3333-333333333333',
        artifactVersionId: '44444444-4444-4444-4444-444444444443',
      },
    ],
  },
];

beforeEach(() => {
  window.localStorage.setItem('caseflow.activeProjectId', 'p1');
  listBaselines.mockReset().mockResolvedValue(mockBaselines);
  createBaseline.mockReset().mockResolvedValue(mockBaselines[0]);
  downloadFile.mockReset().mockResolvedValue(undefined);
  fetchBlob
    .mockReset()
    .mockResolvedValue(new Blob(['<html>Snapshot</html>'], { type: 'text/html' }));
});

describe('BaselinesPage', () => {
  it('renders empty state and initial KPIs when no baselines exist', async () => {
    listBaselines.mockResolvedValueOnce([]);

    render(
      <TestProviders>
        <BaselinesPage />
      </TestProviders>,
    );

    expect(
      await screen.findByRole('heading', { name: /Líneas Base/i, level: 1 }),
    ).toBeInTheDocument();
    expect(screen.getByText('Total Líneas Base')).toBeInTheDocument();
    expect(screen.getAllByText('0')).toHaveLength(2);
    expect(screen.getByText('Sin capturas previas')).toBeInTheDocument();
    expect(screen.getByText('No hay líneas base creadas aún')).toBeInTheDocument();
    expect(screen.getByText(/Inmutabilidad Garantizada/i)).toBeInTheDocument();
  });

  it('renders existing baselines with KPI metrics, tags and entry counts', async () => {
    render(
      <TestProviders>
        <BaselinesPage />
      </TestProviders>,
    );

    expect(await screen.findAllByText('v1.0.0')).toHaveLength(2);
    expect(screen.getByText('v1.1.0-alpha')).toBeInTheDocument();
    expect(screen.getByText(/2 artefactos congelados/i)).toBeInTheDocument();
    expect(screen.getByText(/1 artefacto congelado/i)).toBeInTheDocument();
    expect(
      screen.getByText('Primera línea base oficial con requisitos y modelos aprobados.'),
    ).toBeInTheDocument();
    expect(screen.getAllByText('Arquitecto Principal').length).toBeGreaterThanOrEqual(2);
  });

  it('filters baselines in real time by search query and restores with clear button', async () => {
    const user = userEvent.setup();

    render(
      <TestProviders>
        <BaselinesPage />
      </TestProviders>,
    );

    expect(await screen.findAllByText('v1.0.0')).toHaveLength(2);
    expect(screen.getByText('v1.1.0-alpha')).toBeInTheDocument();

    const searchInput = screen.getByPlaceholderText(/Buscar por etiqueta o descripción/i);
    await user.type(searchInput, 'alpha');

    expect(screen.getByText('v1.1.0-alpha')).toBeInTheDocument();
    // In the list v1.0.0 is hidden, but remains in the top KPI card as latest baseline
    expect(screen.getAllByText('v1.0.0')).toHaveLength(1);
    expect(screen.getByText(/Mostrando 1 de 2 líneas base/i)).toBeInTheDocument();

    // Clear search
    const clearButton = screen.getByLabelText(/Limpiar búsqueda/i);
    await user.click(clearButton);

    expect(screen.getAllByText('v1.0.0')).toHaveLength(2);
    expect(screen.getByText('v1.1.0-alpha')).toBeInTheDocument();
  });

  it('creates a new baseline using suggested label chip and form submission', async () => {
    const user = userEvent.setup();

    render(
      <TestProviders>
        <BaselinesPage />
      </TestProviders>,
    );

    expect(await screen.findAllByText('v1.0.0')).toHaveLength(2);

    const addBtn = screen.getByRole('button', { name: /Crear línea base/i });
    await user.click(addBtn);

    expect(screen.getByText('Crear nueva línea base')).toBeInTheDocument();

    // Click suggested chip 'Sprint-1'
    const sprintChip = screen.getByRole('button', { name: 'Sprint-1' });
    await user.click(sprintChip);

    const descInput = screen.getByPlaceholderText(/Describa el motivo del congelamiento/i);
    await user.type(descInput, 'Cierre de Sprint 1');

    const submitBtn = screen.getByRole('button', { name: /Crear Línea Base/i });
    await user.click(submitBtn);

    await waitFor(() => {
      expect(createBaseline).toHaveBeenCalledWith('p1', {
        label: 'Sprint-1',
        description: 'Cierre de Sprint 1',
      });
    });
  });

  it('triggers HTML and JSON export on button clicks', async () => {
    const user = userEvent.setup();

    render(
      <TestProviders>
        <BaselinesPage />
      </TestProviders>,
    );

    expect(await screen.findAllByText('v1.0.0')).toHaveLength(2);

    // Trigger HTML Download
    const downloadHtmlButtons = screen.getAllByRole('button', { name: /Descargar HTML/i });
    await user.click(downloadHtmlButtons[0]!);

    await waitFor(() => {
      expect(downloadFile).toHaveBeenCalledWith(
        'http://localhost:3001/projects/p1/baselines/00000000-0000-0000-0000-000000000001/export?format=html',
        'baseline-v1_0_0.html',
      );
    });

    // Trigger JSON Download
    const downloadJsonButtons = screen.getAllByRole('button', { name: /^JSON$/i });
    await user.click(downloadJsonButtons[0]!);

    await waitFor(() => {
      expect(downloadFile).toHaveBeenCalledWith(
        'http://localhost:3001/projects/p1/baselines/00000000-0000-0000-0000-000000000001/export?format=json',
        'baseline-v1_0_0.json',
      );
    });
  });

  it('expands details view and copies baseline UUID', async () => {
    const user = userEvent.setup();
    const writeSpy = vi.spyOn(navigator.clipboard, 'writeText');

    render(
      <TestProviders>
        <BaselinesPage />
      </TestProviders>,
    );

    expect(await screen.findAllByText('v1.0.0')).toHaveLength(2);

    const detailButtons = screen.getAllByRole('button', { name: /Ver detalles/i });
    await user.click(detailButtons[0]!);

    expect(screen.getByText('ID de la línea base:')).toBeInTheDocument();
    expect(screen.getByText('00000000-0000-0000-0000-000000000001')).toBeInTheDocument();

    const copyBtn = screen.getByTitle('Copiar ID');
    await user.click(copyBtn);

    expect(writeSpy).toHaveBeenCalledWith('00000000-0000-0000-0000-000000000001');
  });

  it('opens HTML preview dialog when clicking Vista Previa HTML', async () => {
    const user = userEvent.setup();

    render(
      <TestProviders>
        <BaselinesPage />
      </TestProviders>,
    );

    expect(await screen.findAllByText('v1.0.0')).toHaveLength(2);

    const previewButtons = screen.getAllByRole('button', { name: /Vista Previa HTML/i });
    await user.click(previewButtons[0]!);

    expect(await screen.findByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('Línea base v1.0.0')).toBeInTheDocument();
  });

  it('shows empty search state when search query matches nothing and restores on reset', async () => {
    const user = userEvent.setup();

    render(
      <TestProviders>
        <BaselinesPage />
      </TestProviders>,
    );

    expect(await screen.findAllByText('v1.0.0')).toHaveLength(2);

    const searchInput = screen.getByPlaceholderText(/Buscar por etiqueta o descripción/i);
    await user.type(searchInput, 'inexistente');

    expect(
      screen.getByText(/No se encontraron líneas base que coincidan con/i),
    ).toBeInTheDocument();

    const clearButtons = screen.getAllByRole('button', { name: /Limpiar búsqueda/i });
    await user.click(clearButtons[1] || clearButtons[0]!);

    expect(screen.getAllByText('v1.0.0')).toHaveLength(2);
  });
});
