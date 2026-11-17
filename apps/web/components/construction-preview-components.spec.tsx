import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import type { ConstructionPreviewResponse } from '@caseflow-ai/contracts';
import { ConstructionContainerCards } from './construction-container-cards';
import { ProjectStructureTree } from './project-structure-tree';

const preview: ConstructionPreviewResponse = {
  implementationPlanVersionId: '00000000-0000-4000-8000-000000000000',
  modules: [
    {
      localId: 'sales',
      name: 'Ventas',
      description: 'Gestiona ventas',
      entities: 1,
      routes: 1,
      endpoints: 1,
      files: 2,
    },
  ],
  containers: [
    {
      environment: 'DEPLOYMENT',
      name: 'tunnel',
      image: 'cloudflare',
      responsibility: 'Publica la aplicación',
      services: [{ name: 'tunnel', port: 8080 }],
      modules: ['Ventas'],
      volumes: [],
      exposure: 'URL pública',
      limits: null,
      dependsOn: ['app'],
    },
    {
      environment: 'LOCAL',
      name: 'app',
      image: 'node',
      responsibility: 'Sirve la aplicación',
      services: [{ name: 'api', port: 3000 }],
      modules: ['Ventas'],
      volumes: ['node_modules'],
      exposure: 'localhost:3000',
      limits: null,
      dependsOn: [],
    },
  ],
  files: [
    {
      path: 'apps/api/orders.ts',
      kind: 'SOURCE',
      origin: 'DETERMINISTIC',
      purpose: 'Crea pedidos',
      moduleLocalId: 'sales',
      routePath: null,
      endpoint: 'POST /orders',
    },
  ],
};

describe('construction preview components', () => {
  it('groups containers and lists their dependencies', () => {
    render(<ConstructionContainerCards containers={preview.containers} />);
    expect(screen.getByText('Despliegue de demostración')).toBeInTheDocument();
    expect(screen.getByText('Ejecución local (Docker Compose)')).toBeInTheDocument();
    expect(screen.getByText(/tunnel → app/)).toBeInTheDocument();
  });

  it('filters and expands the folder tree accessibly', async () => {
    const user = userEvent.setup();
    render(<ProjectStructureTree files={preview.files} modules={preview.modules} />);
    await user.click(screen.getByRole('button', { name: /Vista previa de carpetas/ }));
    const folder = screen.getByRole('button', { name: /apps\/ 1 archivos/ });
    expect(folder).toHaveAttribute('aria-expanded', 'true');
    await user.type(screen.getByLabelText('Filtrar archivos por ruta o propósito'), 'orders');
    await user.click(screen.getByRole('button', { name: /api\/ 1 archivos/ }));
    expect(screen.getByText('orders.ts')).toBeInTheDocument();
  });
});
