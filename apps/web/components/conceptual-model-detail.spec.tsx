import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { ConceptualModelDetail } from './conceptual-model-detail';
import type { ConceptualDomainModelContent } from '@caseflow-ai/contracts';

const mockContent: ConceptualDomainModelContent = {
  entities: [
    {
      localId: 'ent-order',
      name: 'Pedido',
      description: 'Orden de compra realizada por un cliente en el sistema.',
      moduleName: 'Ventas',
      classLocalId: 'cls-order',
      attributes: [
        { name: 'codigo', description: 'Identificador único legible', required: true },
        { name: 'fecha', required: true },
        { name: 'notas', description: 'Comentarios adicionales del cliente', required: false },
      ],
      relatedSourceCodes: ['RF-001', 'CU-001'],
    },
    {
      localId: 'ent-order-item',
      name: 'DetallePedido',
      description: 'Línea de producto asociada a una orden.',
      moduleName: 'Ventas',
      attributes: [
        { name: 'cantidad', required: true },
        { name: 'precioUnitario', required: true },
      ],
    },
    {
      localId: 'ent-product',
      name: 'Producto',
      description: 'Artículo disponible para la venta en catálogo.',
      moduleName: 'Inventario',
      attributes: [
        { name: 'nombre', required: true },
        { name: 'sku', required: true },
        { name: 'stockActual', required: false },
      ],
    },
  ],
  relationships: [
    {
      fromLocalId: 'ent-order',
      toLocalId: 'ent-order-item',
      name: 'contiene',
      cardinality: 'ONE_TO_MANY',
      description: 'Un pedido incluye una o más líneas de detalle.',
    },
    {
      fromLocalId: 'ent-order-item',
      toLocalId: 'ent-product',
      name: 'referencia',
      cardinality: 'ONE_TO_ONE',
      description: 'Cada detalle corresponde a un producto específico.',
    },
  ],
};

describe('ConceptualModelDetail', () => {
  it('renders the header banner with construction step info', () => {
    render(<ConceptualModelDetail content={mockContent} />);

    expect(screen.getByText('Modelo Conceptual de Dominio')).toBeInTheDocument();
    expect(screen.getByText('Fase de Construcción · Paso 2 de 5')).toBeInTheDocument();
  });

  it('renders entity cards with attributes, badges, and module pills', () => {
    render(<ConceptualModelDetail content={mockContent} />);

    expect(screen.getByRole('heading', { name: 'Pedido', level: 5 })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'DetallePedido', level: 5 })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Producto', level: 5 })).toBeInTheDocument();

    // Check module pills
    expect(screen.getAllByText('Ventas').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Inventario').length).toBeGreaterThan(0);

    // Check attributes
    expect(screen.getByText('codigo')).toBeInTheDocument();
    expect(screen.getByText('Identificador único legible')).toBeInTheDocument();
    expect(screen.getByText('notas')).toBeInTheDocument();

    // Check requirement badges
    expect(screen.getAllByText('Requerido').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Opcional').length).toBeGreaterThan(0);
  });

  it('renders relationship cards with cardinalities and entity names', () => {
    render(<ConceptualModelDetail content={mockContent} />);

    expect(screen.getAllByText('contiene').length).toBeGreaterThan(0);
    expect(screen.getByText(/1 a muchos \(1:N\)/i)).toBeInTheDocument();
    expect(screen.getByText('Un pedido incluye una o más líneas de detalle.')).toBeInTheDocument();

    expect(screen.getAllByText('referencia').length).toBeGreaterThan(0);
    expect(screen.getByText(/1 a 1 \(1:1\)/i)).toBeInTheDocument();
  });

  it('filters content in real-time with search input', async () => {
    const user = userEvent.setup();
    render(<ConceptualModelDetail content={mockContent} />);

    const searchInput = screen.getByLabelText('Buscar en el modelo conceptual');
    await user.type(searchInput, 'Producto');

    expect(screen.getByRole('heading', { name: 'Producto', level: 5 })).toBeInTheDocument();
    expect(
      screen.queryByText('Orden de compra realizada por un cliente en el sistema.'),
    ).not.toBeInTheDocument();

    // Clear search
    const clearBtn = screen.getByLabelText('Limpiar búsqueda');
    await user.click(clearBtn);

    expect(screen.getByRole('heading', { name: 'Pedido', level: 5 })).toBeInTheDocument();
  });

  it('filters entities by module tab', async () => {
    const user = userEvent.setup();
    render(<ConceptualModelDetail content={mockContent} />);

    const inventarioBtn = screen.getByRole('button', { name: /Inventario/i });
    await user.click(inventarioBtn);

    expect(screen.getByRole('heading', { name: 'Producto', level: 5 })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Pedido', level: 5 })).not.toBeInTheDocument();
  });

  it('switches view mode between entities and relationships', async () => {
    const user = userEvent.setup();
    render(<ConceptualModelDetail content={mockContent} />);

    // Switch to Relaciones view
    const relsTab = screen.getByRole('button', { name: /Relaciones \(2\)/i });
    await user.click(relsTab);

    expect(screen.getByText(/1 a muchos \(1:N\)/i)).toBeInTheDocument();
    expect(screen.queryByText('Identificador único legible')).not.toBeInTheDocument();

    // Switch to Entidades view
    const entitiesTab = screen.getByRole('button', { name: /Entidades \(3\)/i });
    await user.click(entitiesTab);

    expect(screen.getByRole('heading', { name: 'Pedido', level: 5 })).toBeInTheDocument();
    expect(screen.getByText('Identificador único legible')).toBeInTheDocument();
  });
});
