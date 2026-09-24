import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { UseCaseManualForm } from './use-case-manual-form';
import {
  NavigationManualForm,
  SoftwareArchitectureManualForm,
  SystemArchitectureManualForm,
  UiBlueprintManualForm,
} from './structured-manual-forms';
import { DataModelManualForm } from './data-model-manual-form';
import { TestProviders } from '../lib/test-utils';

const useCasesCreate = vi.fn().mockResolvedValue({});
const dataModelsCreate = vi.fn().mockResolvedValue({});
const structuredCreate = vi.fn().mockResolvedValue({});

vi.mock('../lib/api', () => ({
  api: {
    useCases: { create: (...args: unknown[]) => useCasesCreate(...args) },
    dataModels: { create: (...args: unknown[]) => dataModelsCreate(...args) },
    structuredAnalysis: { create: (...args: unknown[]) => structuredCreate(...args) },
  },
  ApiError: class ApiError extends Error {},
}));

// Manual-fallback tests (spec: CASEflow must remain functional without a
// configured AI provider). None of these call a real AI provider — each
// asserts the manual creation path calls the backend's manual create()
// endpoint directly, with no generation/candidate step involved.
describe('manual non-AI creation fallbacks (behavior 22)', () => {
  it('creates a Use Case manually without any AI generation step', async () => {
    const user = userEvent.setup();
    const requirement = {
      id: 'r1',
      code: 'RF-001',
      requirement: { name: 'Registrar pedido' },
      version: { id: 'rv1', status: 'APPROVED' },
    } as unknown as Parameters<typeof UseCaseManualForm>[0]['approvedRequirements'][number];

    render(
      <TestProviders>
        <UseCaseManualForm
          projectId="p1"
          approvedRequirements={[requirement]}
          onCreated={vi.fn()}
          onCancel={vi.fn()}
        />
      </TestProviders>,
    );

    await user.type(screen.getByLabelText(/^nombre$/i), 'Registrar pedido');
    await user.type(screen.getByLabelText(/objetivo/i), 'Registrar un pedido nuevo');
    await user.type(screen.getByLabelText(/actor primario/i), 'Cliente');
    await user.type(screen.getByLabelText(/actor del paso 1/i), 'Cliente');
    await user.type(screen.getByLabelText(/acción del paso 1/i), 'Envía el pedido');
    await user.click(screen.getByLabelText(/RF-001/i));
    await user.click(screen.getByRole('button', { name: /crear caso de uso/i }));

    await waitFor(() => expect(useCasesCreate).toHaveBeenCalledTimes(1));
    expect(useCasesCreate).toHaveBeenCalledWith(
      'p1',
      expect.objectContaining({ name: 'Registrar pedido', relatedRequirementVersionIds: ['rv1'] }),
    );
  });

  it('creates a Data Model manually with a structured entity editor, never Mermaid', async () => {
    const user = userEvent.setup();
    render(
      <TestProviders>
        <DataModelManualForm projectId="p1" onCreated={vi.fn()} onCancel={vi.fn()} />
      </TestProviders>,
    );
    await user.type(screen.getByLabelText(/título/i), 'Modelo de Pedidos');
    await user.type(screen.getByPlaceholderText(/nombre de la entidad/i), 'Pedido');
    await user.type(screen.getByPlaceholderText('nombre'), 'id');
    await user.click(screen.getByRole('button', { name: /crear modelo de datos/i }));

    await waitFor(() => expect(dataModelsCreate).toHaveBeenCalledTimes(1));
    const call = dataModelsCreate.mock.calls[0] as [
      string,
      { entities: { name: string; attributes: { name: string }[] }[] },
    ];
    expect(call[1].entities[0]?.name).toBe('Pedido');
    expect(call[1].entities[0]?.attributes[0]?.name).toBe('id');
  });

  it('creates a Navigation tree manually without requiring Mermaid authoring', async () => {
    const user = userEvent.setup();
    render(
      <TestProviders>
        <NavigationManualForm projectId="p1" onCreated={vi.fn()} onCancel={vi.fn()} />
      </TestProviders>,
    );
    await user.type(screen.getByPlaceholderText(/título/i), 'Navegación principal');
    await user.type(screen.getByPlaceholderText('Etiqueta'), 'Inicio');
    await user.type(screen.getByPlaceholderText(/nombre de pantalla/i), 'HomeView');
    await user.click(screen.getByRole('button', { name: /^crear$/i }));

    await waitFor(() => expect(structuredCreate).toHaveBeenCalledTimes(1));
    expect(structuredCreate).toHaveBeenCalledWith(
      'p1',
      'NAVIGATION_TREE',
      'Navegación principal',
      expect.objectContaining({ nodes: expect.any(Array) }),
    );
  });

  it('creates a Software Architecture manually without requiring PlantUML authoring', async () => {
    const user = userEvent.setup();
    render(
      <TestProviders>
        <SoftwareArchitectureManualForm projectId="p1" onCreated={vi.fn()} onCancel={vi.fn()} />
      </TestProviders>,
    );
    await user.type(screen.getByPlaceholderText(/título/i), 'Arquitectura');
    await user.type(screen.getByPlaceholderText(/estilo/i), 'Monolito modular');
    await user.type(screen.getByPlaceholderText(/nombre del componente/i), 'API');
    await user.click(screen.getByRole('button', { name: /^crear$/i }));

    await waitFor(() => expect(structuredCreate).toHaveBeenCalledTimes(1));
    expect(structuredCreate).toHaveBeenCalledWith(
      'p1',
      'SOFTWARE_ARCHITECTURE',
      'Arquitectura',
      expect.objectContaining({ style: 'Monolito modular' }),
    );
  });

  it('creates a System Architecture manually without requiring PlantUML authoring', async () => {
    const user = userEvent.setup();
    render(
      <TestProviders>
        <SystemArchitectureManualForm projectId="p1" onCreated={vi.fn()} onCancel={vi.fn()} />
      </TestProviders>,
    );
    await user.type(screen.getByPlaceholderText(/título/i), 'Sistema');
    await user.type(screen.getByPlaceholderText(/límite del sistema/i), 'Sistema de pedidos');
    await user.type(screen.getByPlaceholderText(/^nombre$/i), 'API Gateway');
    await user.click(screen.getByRole('button', { name: /^crear$/i }));

    await waitFor(() => expect(structuredCreate).toHaveBeenCalledTimes(1));
    expect(structuredCreate).toHaveBeenCalledWith(
      'p1',
      'SYSTEM_ARCHITECTURE',
      'Sistema',
      expect.objectContaining({ boundary: 'Sistema de pedidos' }),
    );
  });

  it('creates a UI Blueprint manually without raw JSON editing', async () => {
    const user = userEvent.setup();
    render(
      <TestProviders>
        <UiBlueprintManualForm projectId="p1" onCreated={vi.fn()} onCancel={vi.fn()} />
      </TestProviders>,
    );
    await user.type(screen.getByPlaceholderText(/título/i), 'Blueprint');
    await user.type(screen.getByPlaceholderText(/nombre de pantalla/i), 'Pantalla de pedido');
    await user.type(screen.getByPlaceholderText(/propósito/i), 'Crear un pedido');
    await user.click(screen.getByRole('button', { name: /^crear$/i }));

    await waitFor(() => expect(structuredCreate).toHaveBeenCalledTimes(1));
    expect(structuredCreate).toHaveBeenCalledWith(
      'p1',
      'UI_BLUEPRINT',
      'Blueprint',
      expect.objectContaining({ screens: expect.any(Array) }),
    );
  });
});
