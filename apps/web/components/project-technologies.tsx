'use client';

import { useQuery } from '@tanstack/react-query';
import { Layers } from 'lucide-react';
import type { TargetTemplateResponse } from '@caseflow-ai/contracts';
import { Card, CardContent, CardHeader, CardTitle } from '@caseflow-ai/ui';
import { api } from '../lib/api';

// The template every generated project is built with; its latest version is
// the one a new generation uses.
const TEMPLATE_IDENTIFIER = 'CASEFLOW_WEB_TS_V1';

const PACKAGE_NAMES: Record<string, string> = {
  next: 'Next.js',
  react: 'React',
  tailwindcss: 'Tailwind CSS',
  'radix-ui': 'shadcn/ui (Radix)',
  'lucide-react': 'Lucide',
  '@nestjs/core': 'NestJS',
  '@nestjs/swagger': 'OpenAPI (Swagger)',
  prisma: 'Prisma',
  'react-hook-form': 'React Hook Form',
  zod: 'Zod',
  '@tanstack/react-query': 'TanStack Query',
  argon2: 'Argon2',
  vitest: 'Vitest',
  '@testing-library/react': 'Testing Library',
  '@playwright/test': 'Playwright',
  supertest: 'Supertest',
};

// Each group lists catalog packages, so what is shown is what gets installed:
// a package the template does not carry is not shown, and a group left empty
// disappears.
const GROUPS: { label: string; purpose: string; packages: string[] }[] = [
  {
    label: 'Interfaz web',
    purpose: 'Las pantallas que cada rol usa en el navegador.',
    packages: ['next', 'react', 'tailwindcss', 'radix-ui', 'lucide-react'],
  },
  {
    label: 'Servidor',
    purpose: 'Las reglas del negocio, expuestas como servicios REST documentados.',
    packages: ['@nestjs/core', '@nestjs/swagger'],
  },
  {
    label: 'Base de datos',
    purpose: 'Guarda la información; Prisma define las tablas y sus migraciones.',
    packages: ['prisma'],
  },
  {
    label: 'Formularios y datos',
    purpose: 'Valida lo que se escribe con las mismas reglas en la pantalla y en el servidor.',
    packages: ['react-hook-form', 'zod', '@tanstack/react-query'],
  },
  {
    label: 'Inicio de sesión',
    purpose: 'Cuentas propias con contraseñas cifradas; cada rol ve solo lo suyo.',
    packages: ['argon2'],
  },
  {
    label: 'Pruebas',
    purpose: 'Comprueban el código y recorren las pantallas durante la validación.',
    packages: ['vitest', '@testing-library/react', '@playwright/test', 'supertest'],
  },
];

function latest(items: TargetTemplateResponse[]) {
  return items
    .filter((item) => item.identifier === TEMPLATE_IDENTIFIER)
    .reduce<TargetTemplateResponse | undefined>(
      (best, item) => (!best || item.version > best.version ? item : best),
      undefined,
    );
}

// The stack the project will be built with, before anything is generated.
export function ProjectTechnologies() {
  const templates = useQuery({
    queryKey: ['target-templates'],
    queryFn: () => api.targetTemplates.list(),
    staleTime: Infinity,
  });
  const template = templates.data ? latest(templates.data.items) : undefined;
  if (!template) return null;

  const versions = new Map(template.dependencies.map((d) => [d.name, d.version]));
  const groups = GROUPS.map((group) => ({
    ...group,
    items: group.packages.flatMap((name) => {
      const version = versions.get(name);
      return version ? [`${PACKAGE_NAMES[name] ?? name} ${version}`] : [];
    }),
  })).filter((group) => group.items.length);
  const database = groups.find((group) => group.label === 'Base de datos');
  if (database && template.persistence.includes('PostgreSQL')) database.items.unshift('PostgreSQL');

  return (
    <Card aria-label="Tecnologías del proyecto">
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center justify-between gap-2 text-sm">
          <span className="flex items-center gap-2">
            <Layers className="size-4 text-primary" aria-hidden="true" />
            Tecnologías del proyecto
          </span>
          <span className="text-xs font-normal text-muted-foreground">
            {template.language} · plantilla {template.name} v{template.version}
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {groups.map((group) => (
            <li key={group.label} className="rounded-lg border bg-muted/20 px-3 py-2.5">
              <p className="text-xs font-semibold">{group.label}</p>
              <p className="mt-0.5 text-sm">{group.items.join(' · ')}</p>
              <p className="mt-1 text-xs text-muted-foreground">{group.purpose}</p>
            </li>
          ))}
          {/* Deployment belongs to CASEFlow's deployment provider, not to the
              template, so it is not part of the catalog. */}
          <li className="rounded-lg border bg-muted/20 px-3 py-2.5">
            <p className="text-xs font-semibold">Infraestructura</p>
            <p className="mt-0.5 text-sm">Docker · túnel de Cloudflare</p>
            <p className="mt-1 text-xs text-muted-foreground">
              La base de datos y la aplicación corren en contenedores; el túnel publica la
              demostración.
            </p>
          </li>
        </ul>
      </CardContent>
    </Card>
  );
}
