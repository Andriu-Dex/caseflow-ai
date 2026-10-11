import { describe, expect, it, vi } from 'vitest';
import JSZip from 'jszip';
import { CASEFLOW_WEB_TS_V1 } from '@caseflow-ai/domain';
import {
  applyPatches,
  buildArchive,
  diagnosedFiles,
  manifestHash,
  planCoverageProblems,
  reviewRepairPatch,
  structuralProblems,
  traceabilityProblems,
  type ProjectFile,
} from './project-validation';

const allowed = CASEFLOW_WEB_TS_V1.dependencies.map(({ name, version }) => ({ name, version }));
const zod = allowed.find((d) => d.name === 'zod')!;

const layout = (): ProjectFile[] =>
  CASEFLOW_WEB_TS_V1.requiredPaths.map((path) => ({
    path,
    kind: 'CONFIG',
    content:
      path === 'package.json'
        ? JSON.stringify({ packageManager: CASEFLOW_WEB_TS_V1.toolchain.packageManager })
        : path.endsWith('package.json')
          ? JSON.stringify({
              dependencies: { '@app/contracts': 'workspace:*', zod: zod.version },
            })
          : '',
  }));

describe('structuralProblems', () => {
  it('accepts the template layout with catalog dependencies', () => {
    expect(structuralProblems(layout(), CASEFLOW_WEB_TS_V1, allowed)).toEqual([]);
  });

  it('reports missing files, off-catalog or re-versioned packages and an unpinned toolchain', () => {
    const files = layout()
      .filter((f) => f.path !== 'README.md')
      .map((f) =>
        f.path === 'apps/api/package.json'
          ? { ...f, content: JSON.stringify({ dependencies: { 'left-pad': '1.0.0', zod: '^4' } }) }
          : f.path === 'package.json'
            ? { ...f, content: '{}' }
            : f,
      );
    const problems = structuralProblems(files, CASEFLOW_WEB_TS_V1, allowed);
    expect(problems).toEqual(
      expect.arrayContaining([
        expect.stringContaining('README.md'),
        expect.stringContaining('left-pad@1.0.0'),
        expect.stringContaining('zod@^4'),
        expect.stringContaining('pnpm@'),
      ]),
    );
  });
});

describe('traceabilityProblems', () => {
  it('requires a trace link for every source and test file only', () => {
    const files: ProjectFile[] = [
      { path: 'a.ts', kind: 'SOURCE', content: '' },
      { path: 'a.spec.ts', kind: 'TEST', content: '' },
      { path: 'tsconfig.json', kind: 'CONFIG', content: '' },
    ];
    expect(traceabilityProblems(files, new Set(['a.ts']))).toEqual([
      expect.stringContaining('a.spec.ts'),
    ]);
  });
});

describe('applyPatches', () => {
  it('replaces only the patched files, later patches winning', () => {
    const files: ProjectFile[] = [
      { path: 'a.ts', kind: 'SOURCE', content: 'old' },
      { path: 'b.ts', kind: 'SOURCE', content: 'keep' },
    ];
    const once = applyPatches(files, [{ path: 'a.ts', content: 'v1' }]);
    expect(applyPatches(once, [{ path: 'a.ts', content: 'v2' }]).map((f) => f.content)).toEqual([
      'v2',
      'keep',
    ]);
  });
});

describe('reviewRepairPatch', () => {
  const source: ProjectFile = {
    path: 'apps/api/src/orders/order.service.ts',
    kind: 'SOURCE',
    content: "import { Injectable } from '@nestjs/common';",
  };
  const test: ProjectFile = {
    path: 'apps/api/src/orders/order.spec.ts',
    kind: 'TEST',
    content: '',
  };
  const candidates = new Map([source, test].map((f) => [f.path, f]));
  const known = new Set(['@nestjs/common', '../prisma/prisma.service']);
  const review = (path: string, content: string) =>
    reviewRepairPatch({ path, content }, candidates, known);

  it('accepts a source rewrite using modules the project already uses', () => {
    expect(
      review(source.path, "import { Injectable } from '@nestjs/common';\nexport class A {}"),
    ).toBeNull();
  });

  it.each([
    ['apps/api/package.json', '{}', 'no es un archivo fuente'],
    [test.path, 'it.skip()', 'no es un archivo fuente'],
    [source.path, "import dayjs from 'dayjs';", 'introduce módulos nuevos (dayjs)'],
    [source.path, "const x = require('child_process');", 'introduce módulos nuevos'],
    [source.path, "eval('1')", 'evalúa código dinámico'],
    [source.path, '   ', 'quedaría vacío'],
  ])('rejects %s', (path, content, reason) => {
    expect(review(path, content)).toContain(reason);
  });
});

describe('diagnosedFiles', () => {
  const files: ProjectFile[] = [
    { path: 'apps/api/src/orders/order.service.ts', kind: 'SOURCE', content: '' },
    { path: 'apps/api/src/orders/order.spec.ts', kind: 'TEST', content: '' },
    { path: 'prisma/schema.prisma', kind: 'SOURCE', content: '' },
  ];

  it('finds source files cited by workspace- or app-relative paths', () => {
    expect(
      diagnosedFiles(files, 'src/orders/order.service.ts(3,1): error TS2304').map((f) => f.path),
    ).toEqual(['apps/api/src/orders/order.service.ts']);
    expect(diagnosedFiles(files, 'apps/api/src/orders/order.spec.ts failed')).toEqual([]);
  });
});

describe('archive and manifest', () => {
  const files = [
    { path: 'b.txt', content: 'b' },
    { path: 'a.txt', content: 'a' },
  ];

  it('is reproducible and independent of file order', async () => {
    const first = await buildArchive('demo', files);
    expect((await buildArchive('demo', [...files].reverse())).equals(first)).toBe(true);
    expect(manifestHash(files)).toBe(manifestHash([...files].reverse()));
    const zip = await JSZip.loadAsync(first);
    expect(await zip.file('demo/a.txt')!.async('string')).toBe('a');
  });
  it('does not depend on when it is built', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    try {
      vi.setSystemTime(new Date('2026-01-01T10:00:00Z'));
      const first = await buildArchive('demo', files);
      vi.setSystemTime(new Date('2026-01-01T10:00:10Z'));
      expect((await buildArchive('demo', files)).equals(first)).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('planCoverageProblems (DEC-121)', () => {
  const plan = {
    entities: [{ name: 'Order' }, { name: 'Invoice' }],
    routes: [
      { path: '/orders', actions: [{ label: 'Nuevo' }, { label: 'Borrar' }] },
      { path: '/invoices', actions: [] },
    ],
  } as unknown as Parameters<typeof planCoverageProblems>[1];
  const files = [
    {
      path: 'prisma/schema.prisma',
      content: 'model Order {\n  id String @id\n}\n',
      kind: 'SOURCE',
    },
    {
      path: 'apps/web/app/orders/page.tsx',
      content: '<Link href="/orders/new" data-action={"Nuevo"}>',
      kind: 'SOURCE',
    },
  ] as const;

  it('reports planned entities, routes and actions missing from the code', () => {
    expect(planCoverageProblems(files, plan)).toEqual([
      'La entidad «Invoice» del plan no tiene su modelo en el esquema de Prisma.',
      'La acción «Borrar» de la ruta /orders no tiene un control en su página.',
      'La ruta /invoices del plan no tiene su página.',
    ]);
  });
});
