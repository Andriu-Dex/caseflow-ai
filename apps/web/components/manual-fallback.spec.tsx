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
  it('creates a Use Case manually, including an alternative flow, without any AI generation step', async () => {
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
    await user.click(screen.getByText(/agregar flujo alternativo/i));
    await user.type(screen.getByLabelText(/nombre del flujo alternativo 1/i), 'Pago rechazado');
    await user.type(screen.getByLabelText(/condición del flujo alternativo 1/i), 'El pago falla');
    await user.type(
      screen.getByLabelText(/pasos del flujo alternativo 1/i),
      'Sistema: Notifica el rechazo',
    );
    await user.click(screen.getByLabelText(/RF-001/i));
    await user.click(screen.getByRole('button', { name: /crear caso de uso/i }));

    await waitFor(() => expect(useCasesCreate).toHaveBeenCalledTimes(1));
    const [, payload] = useCasesCreate.mock.calls[0] as [
      string,
      {
        name: string;
        relatedRequirementVersionIds: string[];
        alternativeFlows: { name: string; condition: string; steps: unknown[] }[];
      },
    ];
    expect(payload.name).toBe('Registrar pedido');
    expect(payload.relatedRequirementVersionIds).toEqual(['rv1']);
    expect(payload.alternativeFlows).toEqual([
      {
        name: 'Pago rechazado',
        condition: 'El pago falla',
        steps: [{ actor: 'Sistema', action: 'Notifica el rechazo' }],
      },
    ]);
  });

  it('creates a Data Model manually with entity/attribute descriptions, never Mermaid', async () => {
    const user = userEvent.setup();
    render(
      <TestProviders>
        <DataModelManualForm projectId="p1" onCreated={vi.fn()} onCancel={vi.fn()} />
      </TestProviders>,
    );
    await user.type(screen.getByLabelText(/título/i), 'Modelo de Pedidos');
    await user.type(screen.getByPlaceholderText(/nombre de la entidad/i), 'Pedido');
    await user.type(screen.getByPlaceholderText('Descripción (opcional)'), 'Un pedido de compra');
    await user.type(screen.getByPlaceholderText('nombre'), 'id');
    await user.type(
      screen.getByLabelText(/descripción del atributo 1 de la entidad 1/i),
      'Identificador único',
    );
    await user.click(screen.getByRole('button', { name: /crear modelo de datos/i }));

    await waitFor(() => expect(dataModelsCreate).toHaveBeenCalledTimes(1));
    const [, input] = dataModelsCreate.mock.calls[0] as [
      string,
      {
        entities: {
          name: string;
          description?: string;
          attributes: { name: string; description?: string }[];
        }[];
      },
    ];
    expect(input.entities[0]?.name).toBe('Pedido');
    expect(input.entities[0]?.description).toBe('Un pedido de compra');
    expect(input.entities[0]?.attributes[0]?.name).toBe('id');
  });

  it('creates a Data Model relationship with name, cardinalities and description reaching the payload', async () => {
    const user = userEvent.setup();
    render(
      <TestProviders>
        <DataModelManualForm projectId="p1" onCreated={vi.fn()} onCancel={vi.fn()} />
      </TestProviders>,
    );
    await user.type(screen.getByLabelText(/título/i), 'Modelo');
    const entityNameInputs = () => screen.getAllByPlaceholderText(/nombre de la entidad/i);
    await user.type(entityNameInputs()[0]!, 'Pedido');
    await user.type(screen.getAllByPlaceholderText('nombre')[0]!, 'id');
    await user.click(screen.getByRole('button', { name: /agregar entidad/i }));
    await user.type(entityNameInputs()[1]!, 'Cliente');
    await user.type(screen.getAllByPlaceholderText('nombre')[1]!, 'id');

    await user.click(screen.getByRole('button', { name: /agregar relación/i }));
    const selects = screen.getAllByRole('combobox');
    // Order: entity-1 attribute type, entity-2 attribute type, then the
    // relationship's source entity / source cardinality / target entity /
    // target cardinality selects.
    await user.selectOptions(selects[2]!, 'Pedido');
    await user.selectOptions(selects[4]!, 'Cliente');
    await user.type(screen.getByLabelText(/nombre de la relación 1/i), 'pertenece a');
    await user.type(
      screen.getByLabelText(/descripción de la relación 1/i),
      'Cada pedido pertenece a un cliente',
    );
    await user.click(screen.getByRole('button', { name: /crear modelo de datos/i }));

    await waitFor(() => expect(dataModelsCreate).toHaveBeenCalledTimes(1));
    const [, input] = dataModelsCreate.mock.calls[0] as [
      string,
      {
        relationships: {
          sourceCardinality: string;
          targetCardinality: string;
          name?: string;
          description?: string;
        }[];
      },
    ];
    expect(input.relationships).toHaveLength(1);
    expect(input.relationships[0]).toMatchObject({
      sourceCardinality: 'ONE',
      targetCardinality: 'ONE_OR_MORE',
      name: 'pertenece a',
      description: 'Cada pedido pertenece a un cliente',
    });
  });

  it('creates a Navigation node with a description and related Use Case codes, without requiring Mermaid', async () => {
    const user = userEvent.setup();
    render(
      <TestProviders>
        <NavigationManualForm projectId="p1" onCreated={vi.fn()} onCancel={vi.fn()} />
      </TestProviders>,
    );
    await user.type(screen.getByPlaceholderText(/título/i), 'Navegación principal');
    await user.type(screen.getByPlaceholderText('Etiqueta'), 'Inicio');
    await user.type(screen.getByPlaceholderText(/nombre de pantalla/i), 'HomeView');
    await user.type(
      screen.getByPlaceholderText(/^descripción \(opcional\)$/i),
      'Pantalla de bienvenida',
    );
    await user.type(screen.getByPlaceholderText(/casos de uso relacionados/i), 'CU-001, CU-002');
    await user.click(screen.getByRole('button', { name: /^crear$/i }));

    await waitFor(() => expect(structuredCreate).toHaveBeenCalledTimes(1));
    const [, , , content] = structuredCreate.mock.calls[0] as [
      string,
      string,
      string,
      { nodes: { description?: string; relatedUseCaseCodes: string[] }[] },
    ];
    expect(content.nodes[0]?.description).toBe('Pantalla de bienvenida');
    expect(content.nodes[0]?.relatedUseCaseCodes).toEqual(['CU-001', 'CU-002']);
  });

  it('creates a Software Architecture with a dependency, a decision and a layer association', async () => {
    const user = userEvent.setup();
    render(
      <TestProviders>
        <SoftwareArchitectureManualForm projectId="p1" onCreated={vi.fn()} onCancel={vi.fn()} />
      </TestProviders>,
    );
    await user.type(screen.getByPlaceholderText(/título/i), 'Arquitectura');
    await user.type(screen.getByPlaceholderText(/estilo/i), 'Monolito modular');
    const nameInputs = () => screen.getAllByPlaceholderText(/nombre del componente/i);
    await user.type(nameInputs()[0]!, 'API');
    await user.type(screen.getAllByPlaceholderText(/capa \(opcional\)/i)[0]!, 'Presentación');
    await user.click(screen.getByRole('button', { name: /agregar componente/i }));
    await user.type(nameInputs()[1]!, 'Base de datos');

    await user.click(screen.getByRole('button', { name: /agregar dependencia/i }));
    await user.selectOptions(
      screen.getByLabelText(/componente origen de la dependencia 1/i),
      'API',
    );
    await user.selectOptions(
      screen.getByLabelText(/componente destino de la dependencia 1/i),
      'Base de datos',
    );
    await user.type(screen.getByLabelText(/decisiones de arquitectura/i), 'Usar PostgreSQL');
    await user.click(screen.getByRole('button', { name: /^crear$/i }));

    await waitFor(() => expect(structuredCreate).toHaveBeenCalledTimes(1));
    const [, , , content] = structuredCreate.mock.calls[0] as [
      string,
      string,
      string,
      {
        components: { name: string; layerLocalId?: string }[];
        dependencies: { fromLocalId: string; toLocalId: string }[];
        decisions: string[];
      },
    ];
    expect(content.components[0]?.layerLocalId).toBe('Presentación');
    expect(content.dependencies).toHaveLength(1);
    expect(content.decisions).toEqual(['Usar PostgreSQL']);
  });

  it('creates a System Architecture with a communication link (protocol and description)', async () => {
    const user = userEvent.setup();
    render(
      <TestProviders>
        <SystemArchitectureManualForm projectId="p1" onCreated={vi.fn()} onCancel={vi.fn()} />
      </TestProviders>,
    );
    await user.type(screen.getByPlaceholderText(/título/i), 'Sistema');
    await user.type(screen.getByPlaceholderText(/límite del sistema/i), 'Sistema de pedidos');
    const nameInputs = () => screen.getAllByPlaceholderText(/^nombre$/i);
    await user.type(nameInputs()[0]!, 'API Gateway');
    await user.click(screen.getByRole('button', { name: /agregar nodo/i }));
    await user.type(nameInputs()[1]!, 'Base de datos');

    await user.click(screen.getByRole('button', { name: /agregar enlace/i }));
    await user.selectOptions(screen.getByLabelText(/nodo origen del enlace 1/i), 'API Gateway');
    await user.selectOptions(screen.getByLabelText(/nodo destino del enlace 1/i), 'Base de datos');
    await user.type(screen.getByPlaceholderText(/protocolo/i), 'TCP');
    await user.type(screen.getByPlaceholderText(/^descripción \(opcional\)$/i), 'Consultas SQL');
    await user.click(screen.getByRole('button', { name: /^crear$/i }));

    await waitFor(() => expect(structuredCreate).toHaveBeenCalledTimes(1));
    const [, , , content] = structuredCreate.mock.calls[0] as [
      string,
      string,
      string,
      {
        links: {
          fromLocalId: string;
          toLocalId: string;
          protocol?: string;
          description?: string;
        }[];
      },
    ];
    expect(content.links).toHaveLength(1);
    expect(content.links[0]).toMatchObject({ protocol: 'TCP', description: 'Consultas SQL' });
  });

  it('creates a UI Blueprint screen with related Use Cases, navigation reference, sections, actions, data, forms and states', async () => {
    const user = userEvent.setup();
    render(
      <TestProviders>
        <UiBlueprintManualForm projectId="p1" onCreated={vi.fn()} onCancel={vi.fn()} />
      </TestProviders>,
    );
    await user.type(screen.getByPlaceholderText(/título/i), 'Blueprint');
    await user.type(screen.getByPlaceholderText(/nombre de pantalla/i), 'Pantalla de pedido');
    await user.type(screen.getByPlaceholderText(/propósito/i), 'Crear un pedido');
    await user.type(screen.getByPlaceholderText(/casos de uso relacionados/i), 'CU-001');
    await user.type(screen.getByPlaceholderText(/nodo de navegación relacionado/i), 'n1');
    await user.type(screen.getByPlaceholderText(/secciones/i), 'Encabezado, Formulario');
    await user.type(screen.getByPlaceholderText(/acciones principales/i), 'Guardar');
    await user.type(screen.getByPlaceholderText(/acciones secundarias/i), 'Cancelar');
    await user.type(screen.getByPlaceholderText(/datos mostrados/i), 'Total del pedido');
    await user.type(screen.getByPlaceholderText(/formularios\/entradas/i), 'Formulario de pedido');
    await user.type(screen.getByPlaceholderText(/estados relevantes/i), 'Cargando, Error');
    await user.click(screen.getByRole('button', { name: /^crear$/i }));

    await waitFor(() => expect(structuredCreate).toHaveBeenCalledTimes(1));
    const [, , , content] = structuredCreate.mock.calls[0] as [
      string,
      string,
      string,
      {
        screens: {
          relatedUseCaseCodes: string[];
          navigationNodeLocalId?: string;
          sections: string[];
          secondaryActions: string[];
          principalData: string[];
          forms: string[];
          states: string[];
        }[];
      },
    ];
    const screen0 = content.screens[0]!;
    expect(screen0.relatedUseCaseCodes).toEqual(['CU-001']);
    expect(screen0.navigationNodeLocalId).toBe('n1');
    expect(screen0.sections).toEqual(['Encabezado', 'Formulario']);
    expect(screen0.secondaryActions).toEqual(['Cancelar']);
    expect(screen0.principalData).toEqual(['Total del pedido']);
    expect(screen0.forms).toEqual(['Formulario de pedido']);
    expect(screen0.states).toEqual(['Cargando', 'Error']);
  });
});
