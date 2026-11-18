import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { TestProviders } from '../lib/test-utils';
import { ProjectTechnologies } from './project-technologies';

const mocks = vi.hoisted(() => ({ list: vi.fn() }));
vi.mock('../lib/api', () => ({
  api: { targetTemplates: { list: () => mocks.list() } },
  restoreSession: vi.fn(),
}));

const dep = (name: string, version: string) => ({
  name,
  version,
  category: 'FRAMEWORK',
  layer: 'SHARED',
  dev: false,
});
const template = (version: number, dependencies: ReturnType<typeof dep>[]) => ({
  identifier: 'CASEFLOW_WEB_TS_V1',
  version,
  name: 'CASEFlow Web TypeScript',
  language: 'TypeScript',
  architecture: 'Modular monolith',
  apiStyle: 'REST + OpenAPI',
  frontend: 'Next.js + React',
  backend: 'NestJS',
  persistence: 'Prisma + PostgreSQL',
  workspace: 'pnpm workspaces',
  designSystemProfile: {},
  dependencies,
  validationStages: [],
});
const base = [dep('next', '16.3.5'), dep('@nestjs/core', '11.2.3'), dep('prisma', '7.10.0')];

describe('ProjectTechnologies', () => {
  it('shows the latest template version with the versions it installs', async () => {
    mocks.list.mockResolvedValue({
      items: [template(1, base), template(2, [...base, dep('argon2', '0.45.1')])],
    });
    render(<ProjectTechnologies />, { wrapper: TestProviders });

    expect(await screen.findByText(/plantilla CASEFlow Web TypeScript v2/)).toBeInTheDocument();
    expect(screen.getByText('Next.js 16.3.5')).toBeInTheDocument();
    expect(screen.getByText('PostgreSQL · Prisma 7.10.0')).toBeInTheDocument();
    expect(screen.getByText('Argon2 0.45.1')).toBeInTheDocument();
    expect(screen.getByText('Docker · túnel de Cloudflare')).toBeInTheDocument();
  });

  it('leaves out what the template does not install', async () => {
    mocks.list.mockResolvedValue({ items: [template(1, base)] });
    render(<ProjectTechnologies />, { wrapper: TestProviders });

    expect(await screen.findByText('NestJS 11.2.3')).toBeInTheDocument();
    expect(screen.queryByText('Inicio de sesión')).not.toBeInTheDocument();
    expect(screen.queryByText('Pruebas')).not.toBeInTheDocument();
  });
});
