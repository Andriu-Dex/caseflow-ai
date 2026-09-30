import { collectionPath } from '../naming';
import {
  dependencies,
  file,
  json,
  type GeneratedProjectFile,
  type GenerationContext,
} from './types';

// Workspace root of the generated project (spec §153 layout).
export function rootFiles(ctx: GenerationContext): GeneratedProjectFile[] {
  const { plan, template, projectName, slug } = ctx;
  const toolchain = template.toolchain;
  const envVars = plan.envVars.filter(
    (v) => !['DATABASE_URL', 'JWT_SECRET', 'API_PORT', 'NEXT_PUBLIC_API_URL'].includes(v.name),
  );

  return [
    file(
      'package.json',
      json({
        name: slug,
        version: '0.1.0',
        private: true,
        packageManager: toolchain.packageManager,
        engines: { node: toolchain.node },
        scripts: {
          // Internal packages are compiled first: apps import their build output.
          'build:packages': 'pnpm -r --filter "./packages/*" run build',
          lint: 'pnpm -r run lint',
          typecheck: 'pnpm run build:packages && pnpm -r --filter "./apps/*" run typecheck',
          test: 'pnpm run build:packages && pnpm -r run test',
          build: 'pnpm -r run build',
          'db:migrate': 'pnpm --filter ./apps/api run db:migrate',
          dev: 'pnpm -r --parallel run dev',
        },
        devDependencies: dependencies(template, [
          'eslint',
          '@eslint/js',
          'typescript-eslint',
          'prettier',
          'typescript',
        ]),
      }),
      { kind: 'CONFIG' },
    ),
    file(
      'pnpm-workspace.yaml',
      [
        'packages:',
        "  - 'apps/*'",
        "  - 'packages/*'",
        'allowBuilds:',
        ...Object.entries(toolchain.allowBuilds).map(
          ([name, allowed]) => `  '${name}': ${allowed}`,
        ),
        'minimumReleaseAgeExclude:',
        ...toolchain.minimumReleaseAgeExclude.map((name) => `  - '${name}'`),
      ].join('\n'),
      { kind: 'CONFIG' },
    ),
    file(
      'tsconfig.base.json',
      json({
        compilerOptions: {
          target: 'ES2022',
          lib: ['ES2022'],
          module: 'CommonJS',
          moduleResolution: 'Node10',
          strict: true,
          esModuleInterop: true,
          skipLibCheck: true,
          forceConsistentCasingInFileNames: true,
          resolveJsonModule: true,
          sourceMap: true,
        },
      }),
      { kind: 'CONFIG' },
    ),
    file(
      'eslint.config.mjs',
      `// @ts-check
import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: ['**/node_modules/**', '**/dist/**', '**/.next/**', '**/src/generated/**', '**/next-env.d.ts'],
  },
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
);
`,
      { kind: 'CONFIG' },
    ),
    file('.prettierrc', json({ singleQuote: true, printWidth: 100 }), { kind: 'CONFIG' }),
    file(
      '.gitignore',
      ['node_modules', 'dist', '.next', '.env', 'coverage', 'apps/api/src/generated'].join('\n'),
      { kind: 'CONFIG' },
    ),
    file(
      '.env.example',
      [
        '# Copy to .env and fill in real values. Never commit .env.',
        'DATABASE_URL=postgresql://app:app@localhost:5432/app',
        'API_PORT=3001',
        'NEXT_PUBLIC_API_URL=http://localhost:3001',
        ...(plan.authentication.required
          ? ['# Secret used to sign access tokens (long random string).', 'JWT_SECRET=change-me']
          : []),
        ...envVars.flatMap((v) => [`# ${v.description}`, `${v.name}=`]),
      ].join('\n'),
      { kind: 'CONFIG' },
    ),
    file(
      'docker/docker-compose.yml',
      `services:
  postgres:
    image: postgres:17
    environment:
      POSTGRES_USER: app
      POSTGRES_PASSWORD: app
      POSTGRES_DB: app
    ports:
      - '5432:5432'
    volumes:
      - postgres-data:/var/lib/postgresql/data

volumes:
  postgres-data:
`,
      { kind: 'CONFIG' },
    ),
    file('README.md', readme(ctx), { kind: 'DOCUMENTATION' }),
  ];

  function readme({ plan: p }: GenerationContext): string {
    const endpoints = p.entities.flatMap((e) =>
      e.operations.length ? [`- \`${collectionPath(e.name)}\` (${e.operations.join(', ')})`] : [],
    );
    return `# ${projectName}

Proyecto generado por CASEFlow AI a partir de su plan de implementación aprobado
(plantilla ${template.identifier} v${template.version}: Next.js + NestJS + Prisma + PostgreSQL).

## Requisitos

- Node.js ${toolchain.node.replace(/[<>=]/g, '').split(' ')[0]}
- ${toolchain.packageManager.replace('@', ' ')}
- Docker (para PostgreSQL)

## Puesta en marcha

\`\`\`bash
cp .env.example .env            # complete los valores
docker compose -f docker/docker-compose.yml up -d
pnpm install
pnpm run db:migrate             # crea las tablas
pnpm run dev                    # API en :3001, web en :3000
\`\`\`

La documentación interactiva de la API queda en http://localhost:3001/docs.

${
  p.authentication.required
    ? `## Autenticación

La API exige un token Bearer firmado con \`JWT_SECRET\` (HS256) que incluya
\`sub\` y \`roles\`. Para desarrollo:

\`\`\`bash
pnpm --filter ./apps/api run dev-token -- ${p.authentication.roles[0] ?? 'USER'}
\`\`\`

y pegue el token en la pantalla «Acceso» de la aplicación web.

`
    : ''
}## Verificación

\`\`\`bash
pnpm run lint && pnpm run typecheck && pnpm run test && pnpm run build
\`\`\`

## Recursos de la API

${endpoints.join('\n') || '- (sin operaciones CRUD expuestas)'}
`;
  }
}
