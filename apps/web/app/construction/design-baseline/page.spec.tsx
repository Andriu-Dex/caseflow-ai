import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import DesignBaselinePage from './page';
import { TestProviders } from '../../../lib/test-utils';

const mocks = vi.hoisted(() => ({
  listStructured: vi.fn(),
  listMockups: vi.fn(),
  listBaselines: vi.fn(),
  create: vi.fn(),
}));

vi.mock('../../../lib/api', () => ({
  api: {
    structuredAnalysis: { list: (...args: unknown[]) => mocks.listStructured(...args) },
    mockups: { list: (...args: unknown[]) => mocks.listMockups(...args) },
    designBaselines: {
      list: (...args: unknown[]) => mocks.listBaselines(...args),
      create: (...args: unknown[]) => mocks.create(...args),
    },
    readiness: { get: vi.fn(async () => ({ stages: [] })) },
  },
  ApiError: class ApiError extends Error {},
  restoreSession: vi.fn(),
}));

const approved = (kind: string, n: number) => ({
  id: `${kind}-a`,
  code: `${kind}-00${n}`,
  title: kind,
  version: { id: `${kind}-v${n}`, versionNumber: n, status: 'APPROVED' },
});

beforeEach(() => {
  window.localStorage.setItem('caseflow.activeProjectId', 'p1');
  mocks.listStructured.mockImplementation(async (_: string, kind: string) => ({
    items:
      kind === 'UI_BLUEPRINT'
        ? [approved(kind, 1), approved(kind, 2)]
        : kind.endsWith('ARCHITECTURE')
          ? []
          : [approved(kind, 1)],
  }));
  mocks.listMockups.mockResolvedValue({
    items: [
      {
        code: 'MCK-001',
        uiBlueprintVersionId: 'UI_BLUEPRINT-v1',
        designThemeVersionId: 'DESIGN_THEME-v1',
        version: { id: 'mock-v1', versionNumber: 1, status: 'APPROVED' },
      },
      {
        code: 'MCK-002',
        uiBlueprintVersionId: 'UI_BLUEPRINT-v2',
        designThemeVersionId: 'DESIGN_THEME-v1',
        version: { id: 'mock-v2', versionNumber: 1, status: 'APPROVED' },
      },
    ],
  });
  mocks.listBaselines.mockResolvedValue({ items: [] });
  mocks.create.mockResolvedValue({});
});

describe('DesignBaselinePage', () => {
  it('freezes the selected approved versions with the mockup of the chosen UI blueprint', async () => {
    const user = userEvent.setup();
    render(
      <TestProviders>
        <DesignBaselinePage />
      </TestProviders>,
    );
    const approve = await screen.findByRole('button', { name: /aprobar y congelar/i });
    expect(approve).toBeDisabled();

    await user.selectOptions(await screen.findByLabelText(/Plano de interfaz/), 'UI_BLUEPRINT-v2');
    expect(screen.getByRole('option', { name: 'MCK-002 (v1)' })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: 'MCK-001 (v1)' })).not.toBeInTheDocument();

    await user.type(screen.getByPlaceholderText(/Nombre/), 'Diseño v1');
    await user.click(approve);
    await waitFor(() => expect(mocks.create).toHaveBeenCalled());
    expect(mocks.create).toHaveBeenCalledWith('p1', {
      label: 'Diseño v1',
      note: undefined,
      versions: {
        GENERATION_PLAN: 'GENERATION_PLAN-v1',
        CONCEPTUAL_DOMAIN_MODEL: 'CONCEPTUAL_DOMAIN_MODEL-v1',
        CLASS_DIAGRAM: 'CLASS_DIAGRAM-v1',
        NAVIGATION_TREE: 'NAVIGATION_TREE-v1',
        UI_BLUEPRINT: 'UI_BLUEPRINT-v2',
        DESIGN_THEME: 'DESIGN_THEME-v1',
        MOCKUP: 'mock-v2',
      },
    });
  });

  // DEC-118/DEC-121: older projects without a theme or class diagram keep
  // freezing their unthemed mockup.
  it('freezes a design without a theme when the project has none', async () => {
    const user = userEvent.setup();
    mocks.listStructured.mockImplementation(async (_: string, kind: string) => ({
      items:
        kind === 'DESIGN_THEME' || kind === 'CLASS_DIAGRAM' || kind.endsWith('ARCHITECTURE')
          ? []
          : [approved(kind, 1)],
    }));
    mocks.listMockups.mockResolvedValue({
      items: [
        {
          code: 'MCK-001',
          uiBlueprintVersionId: 'UI_BLUEPRINT-v1',
          designThemeVersionId: null,
          version: { id: 'mock-v1', versionNumber: 1, status: 'APPROVED' },
        },
      ],
    });
    render(
      <TestProviders>
        <DesignBaselinePage />
      </TestProviders>,
    );
    await user.type(await screen.findByPlaceholderText(/Nombre/), 'Diseño v1');
    await user.click(screen.getByRole('button', { name: /aprobar y congelar/i }));
    await waitFor(() => expect(mocks.create).toHaveBeenCalled());
    expect(mocks.create.mock.calls[0]![1].versions).toEqual({
      GENERATION_PLAN: 'GENERATION_PLAN-v1',
      CONCEPTUAL_DOMAIN_MODEL: 'CONCEPTUAL_DOMAIN_MODEL-v1',
      NAVIGATION_TREE: 'NAVIGATION_TREE-v1',
      UI_BLUEPRINT: 'UI_BLUEPRINT-v1',
      MOCKUP: 'mock-v1',
    });
  });

  it('explains what is missing instead of allowing an incomplete design gate', async () => {
    mocks.listStructured.mockImplementation(async (_: string, kind: string) => ({
      items: kind === 'GENERATION_PLAN' ? [] : [approved(kind, 1)],
    }));
    render(
      <TestProviders>
        <DesignBaselinePage />
      </TestProviders>,
    );
    expect(
      await screen.findByText(/Aún no hay una versión aprobada de plan de generación/),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /aprobar y congelar/i })).toBeDisabled();
  });
});
