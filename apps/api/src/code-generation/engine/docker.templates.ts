import { file, type GeneratedProjectFile, type GenerationContext } from './types';

// Whole application in Docker (`docker compose ... up --build`): no Node, pnpm or corepack on
// the person's machine. Lines are plain strings so Compose's `${VAR}` needs no escaping.
// The initial migration is derived from the Prisma schema while the image is built (the
// generator ships none), under a fixed name so every build produces the same history.
const MIGRATION = '00000000000000_init';

export function dockerFiles({ plan, template, slug }: GenerationContext): GeneratedProjectFile[] {
  const node = template.toolchain.node
    .replace(/[^\d.]/g, ' ')
    .trim()
    .split(/\s+/)[0];
  const major = node?.split('.')[0] ?? '24';
  const auth = plan.authentication.required;
  const extraEnv = plan.envVars
    .filter(
      (v) => !['DATABASE_URL', 'JWT_SECRET', 'API_PORT', 'NEXT_PUBLIC_API_URL'].includes(v.name),
    )
    .map((v) => `      ${v.name}: \${${v.name}:-}`);

  const dockerfile = [
    '# Imagen de la aplicación completa. La usa docker/docker-compose.app.yml.',
    `FROM node:${major}-slim AS workspace`,
    'RUN corepack enable',
    'WORKDIR /app',
    'COPY . .',
    'RUN pnpm install && pnpm run build:packages',
    '',
    'FROM workspace AS api',
    'RUN pnpm --filter ./apps/api run build',
    'ENV NODE_ENV=production',
    'CMD ["node", "apps/api/dist/main.js"]',
    '',
    '# Crea las tablas: la migración inicial sale del esquema de Prisma.',
    'FROM api AS migrate',
    `RUN [ -d prisma/migrations ] || (mkdir -p prisma/migrations/${MIGRATION} \\`,
    '  && printf \'provider = "postgresql"\\n\' > prisma/migrations/migration_lock.toml \\',
    '  && pnpm --filter ./apps/api exec prisma migrate diff --from-empty \\',
    `     --to-schema ../../prisma/schema.prisma --script > prisma/migrations/${MIGRATION}/migration.sql)`,
    'CMD ["pnpm", "--filter", "./apps/api", "run", "db:deploy"]',
    '',
    '# La dirección de la API queda fijada al construir la web.',
    'FROM workspace AS web',
    'ARG NEXT_PUBLIC_API_URL=http://localhost:3001',
    'ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL',
    'RUN pnpm --filter ./apps/web run build',
    'ENV NODE_ENV=production',
    'CMD ["pnpm", "--filter", "./apps/web", "start"]',
    '',
  ].join('\n');

  const dbUrl =
    'postgresql://${POSTGRES_USER:-app}:${POSTGRES_PASSWORD:-dev-only-postgres-password}' +
    '@postgres:5432/${POSTGRES_DB:-app}';
  const build = (target: string, args: string[] = []) => [
    '    build:',
    '      context: .',
    '      dockerfile: docker/Dockerfile',
    `      target: ${target}`,
    ...(args.length ? ['      args:', ...args] : []),
  ];

  const compose = [
    '# Aplicación completa (web, API y base de datos) en Docker. Solo requiere Docker Desktop:',
    '#   docker compose --project-directory . -f docker/docker-compose.app.yml up --build',
    '# Lee el archivo .env de la raíz si existe; sin él usa valores de ejemplo solo para esta máquina.',
    `name: ${slug}-app`,
    '',
    'services:',
    '  postgres:',
    '    image: postgres:17',
    '    environment:',
    '      POSTGRES_USER: ${POSTGRES_USER:-app}',
    '      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:-dev-only-postgres-password}',
    '      POSTGRES_DB: ${POSTGRES_DB:-app}',
    '    volumes:',
    '      - postgres-data:/var/lib/postgresql/data',
    '    healthcheck:',
    "      test: ['CMD-SHELL', 'pg_isready -U $${POSTGRES_USER:-app} -d $${POSTGRES_DB:-app}']",
    '      interval: 3s',
    '      timeout: 3s',
    '      retries: 20',
    '',
    '  migrate:',
    ...build('migrate'),
    '    environment:',
    `      DATABASE_URL: ${dbUrl}`,
    '    depends_on:',
    '      postgres:',
    '        condition: service_healthy',
    "    restart: 'no'",
    '',
    '  api:',
    ...build('api'),
    '    restart: unless-stopped',
    '    environment:',
    `      DATABASE_URL: ${dbUrl}`,
    '      API_PORT: 3001',
    '      WEB_ORIGIN: http://localhost:${WEB_PORT:-3000}',
    ...(auth ? ['      JWT_SECRET: ${JWT_SECRET:-dev-only-jwt-secret}'] : []),
    ...extraEnv,
    '    ports:',
    "      - '127.0.0.1:${API_PORT:-3001}:3001'",
    '    depends_on:',
    '      migrate:',
    '        condition: service_completed_successfully',
    '',
    '  web:',
    ...build('web', ['        NEXT_PUBLIC_API_URL: http://localhost:${API_PORT:-3001}']),
    '    restart: unless-stopped',
    '    ports:',
    "      - '127.0.0.1:${WEB_PORT:-3000}:3000'",
    '    depends_on:',
    '      - api',
    '',
    'volumes:',
    '  postgres-data:',
    '',
  ].join('\n');

  return [
    file('docker/Dockerfile', dockerfile, { kind: 'CONFIG' }),
    file('docker/docker-compose.app.yml', compose, { kind: 'CONFIG' }),
    file(
      '.dockerignore',
      ['node_modules', '**/node_modules', '**/dist', '**/.next', '.env', 'coverage', '.git'].join(
        '\n',
      ),
      { kind: 'CONFIG' },
    ),
  ];
}
