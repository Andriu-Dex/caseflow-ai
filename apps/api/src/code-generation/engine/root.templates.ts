import { collectionPath } from '../naming';
import { SETUP_SCRIPT } from './setup-script.template';
import {
  dependencies,
  file,
  json,
  type GeneratedProjectFile,
  type GenerationContext,
} from './types';

// A secret the project makes up for itself (not one that belongs to another service):
// `pnpm run setup` generates a random value for it. Same rule as scripts/setup.mjs.
const OWN_SECRET = /(^|_)(SECRET|PASSWORD|SALT)($|_)/;
const oneLine = (text: string) => text.replace(/\s+/g, ' ').trim();

// A variable of the plan in .env.example: never left empty, so nobody has to guess what
// goes there. Own secrets get an example value that setup replaces; what only the person
// can know says so; what is optional stays commented out.
function envExampleLines(v: { name: string; description: string; required: boolean }): string[] {
  const comment = `# ${oneLine(v.description)}`;
  if (OWN_SECRET.test(v.name))
    return [comment, `${v.name}=dev-only-${v.name.toLowerCase().replace(/_/g, '-')}`];
  return v.required
    ? [comment, `${v.name}=replace-with-your-value`]
    : [`${comment} (opcional)`, `# ${v.name}=`];
}

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
          // First run in one command: .env, database and tables (scripts/setup.mjs).
          setup: 'node scripts/setup.mjs',
          'db:up': 'docker compose --env-file .env -f docker/docker-compose.yml up -d --wait',
          'db:down': 'docker compose --env-file .env -f docker/docker-compose.yml down',
          // Whole application in Docker, without Node on the machine (docker/Dockerfile).
          'docker:up':
            'docker compose --project-directory . -f docker/docker-compose.app.yml up --build',
          'docker:down':
            'docker compose --project-directory . -f docker/docker-compose.app.yml down',
          'db:migrate': 'pnpm --filter ./apps/api run db:migrate',
          dev: 'pnpm run build:packages && pnpm -r --filter "./apps/*" --parallel run dev',
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
        '# Valores para ejecutar el proyecto en su equipo.',
        '# No hace falta editarlo: `pnpm run setup` crea el archivo .env a partir de este,',
        '# genera los secretos y elige un puerto libre para la base de datos.',
        'POSTGRES_USER=app',
        'POSTGRES_PASSWORD=dev-only-postgres-password',
        'POSTGRES_DB=app',
        'POSTGRES_PORT=5433',
        'DATABASE_URL=postgresql://app:dev-only-postgres-password@127.0.0.1:5433/app',
        'API_PORT=3001',
        'NEXT_PUBLIC_API_URL=http://localhost:3001',
        ...(plan.authentication.required
          ? [
              '# Secreto para firmar los tokens de acceso (cadena aleatoria larga).',
              'JWT_SECRET=dev-only-jwt-secret',
              '# Entrada de un clic sin credenciales, solo para probar en su equipo.',
              '# pnpm run setup la activa en su .env; debe quedar en false al publicar.',
              'DEV_LOGIN=false',
            ]
          : []),
        ...envVars.flatMap(envExampleLines),
      ].join('\n'),
      { kind: 'CONFIG' },
    ),
    file(
      'docker/docker-compose.yml',
      `# Base de datos local del proyecto. La inicia \`pnpm run setup\` (o \`pnpm run db:up\`).
# El nombre del proyecto Compose mantiene sus datos separados de los de otros proyectos.
name: ${slug}

services:
  postgres:
    image: postgres:17
    environment:
      POSTGRES_USER: \${POSTGRES_USER:-app}
      POSTGRES_PASSWORD: \${POSTGRES_PASSWORD:-app}
      POSTGRES_DB: \${POSTGRES_DB:-app}
    ports:
      # Solo desde este equipo; el puerto lo elige \`pnpm run setup\` entre los libres.
      - '127.0.0.1:\${POSTGRES_PORT:-5433}:5432'
    volumes:
      - postgres-data:/var/lib/postgresql/data
    healthcheck:
      test: ['CMD-SHELL', 'pg_isready -U $\${POSTGRES_USER} -d $\${POSTGRES_DB}']
      interval: 3s
      timeout: 3s
      retries: 20

volumes:
  postgres-data:
`,
      { kind: 'CONFIG' },
    ),
    file('scripts/setup.mjs', SETUP_SCRIPT, { kind: 'CONFIG' }),
    file('README.md', readme(ctx), { kind: 'DOCUMENTATION' }),
  ];

  function readme({ plan: p }: GenerationContext): string {
    const endpoints = p.entities.flatMap((e) =>
      e.operations.length ? [`- \`${collectionPath(e.name)}\` (${e.operations.join(', ')})`] : [],
    );
    const nodeVersion = toolchain.node.replace(/[<>=]/g, '').split(' ')[0];
    const envTable = envVars
      .map(
        (v) =>
          `| \`${v.name}\` | ${oneLine(v.description).replace(/\|/g, '/')}${v.required ? '' : ' (opcional)'} |`,
      )
      .join('\n');
    const authRow = p.authentication.required
      ? '| `JWT_SECRET` | Secreto con el que se firman los tokens de acceso (lo genera `pnpm run setup`) |\n| `DEV_LOGIN` | `true` activa la entrada de un clic sin credenciales (solo para probar; `false` al publicar) |\n'
      : '';
    return `# ${projectName}

Proyecto generado por CASEFlow AI a partir de su plan de implementación aprobado
(plantilla ${template.identifier} v${template.version}: Next.js + NestJS + Prisma + PostgreSQL).

## Opción A — Solo con Docker (la más simple)

Necesita únicamente **Docker Desktop** — https://www.docker.com/products/docker-desktop/ . Ábralo y
espere a que diga que está activo. Descomprima el ZIP, abra una terminal **dentro de la carpeta** y
ejecute:

\`\`\`bash
docker compose --project-directory . -f docker/docker-compose.app.yml up --build
\`\`\`

La primera vez tarda varios minutos (construye la aplicación). Cuando el texto deje de avanzar,
abra **http://localhost:3000**. La documentación de la API queda en http://localhost:3001/docs.
Para detenerla pulse \`Ctrl + C\`; \`docker compose --project-directory . -f docker/docker-compose.app.yml down\`
la apaga por completo (añada \`-v\` para borrar también sus datos). No necesita crear ningún archivo:
usa valores de ejemplo pensados solo para su equipo.

## Opción B — Con Node.js (para modificar el código)

Necesita **Node.js ${nodeVersion}** (https://nodejs.org, versión LTS) y **Docker Desktop**, que aloja
la base de datos. Descomprima el ZIP, abra una terminal **dentro de la carpeta** y ejecute:

\`\`\`bash
corepack enable        # 1. activa pnpm (solo la primera vez)
pnpm install           # 2. descarga las dependencias
pnpm run setup         # 3. crea .env con sus secretos, inicia la base de datos y las tablas
pnpm run dev           # 4. arranca la aplicación
\`\`\`

Si Windows le pide permisos de administrador para \`corepack\`, abra la terminal como administrador o
instale pnpm con \`npm install -g ${toolchain.packageManager}\`. Cuando termine, abra
**http://localhost:3000** (API en http://localhost:3001/docs). Para detenerla pulse \`Ctrl + C\`.

\`pnpm run setup\` no necesita que edite nada a mano: genera los secretos, elige un puerto libre
para la base de datos y vuelve a funcionar si lo ejecuta de nuevo. Los comandos \`pnpm run db:up\`
y \`pnpm run db:down\` inician y detienen solo la base de datos.

## Si algo falla

| Síntoma | Causa probable | Qué hacer |
| --- | --- | --- |
| \`Docker no está en ejecución\` | Docker Desktop está cerrado | Ábralo, espere a que diga que está activo y repita \`pnpm run setup\` |
| \`P1000: Authentication failed\` | Quedó una base de datos anterior de este proyecto con otra contraseña, o otro programa usa el mismo puerto | \`pnpm run setup -- --reset\` borra los datos locales de este proyecto y los crea de nuevo |
| \`port is already allocated\` | El puerto de la base de datos está ocupado | Borre el archivo \`.env\` y ejecute \`pnpm run setup\`: elige otro puerto libre |
| \`schema-engine ... ENOENT\` | La carpeta está en una ruta muy larga (Windows) | Mueva el proyecto a una ruta corta como \`C:\\proyectos\\mi-app\`, borre \`node_modules\` y repita \`pnpm install\` y \`pnpm run setup\` |
| \`port is already allocated\` en la opción A | El puerto 3000 o 3001 está ocupado | Cree un archivo \`.env\` con \`WEB_PORT=3002\` y \`API_PORT=3003\` (u otros libres) y repita el comando |
| \`corepack\` da un error de permisos | Node está instalado en una carpeta protegida | Abra la terminal como administrador o use \`npm install -g ${toolchain.packageManager}\` |
| La web no carga datos | La API no está en ejecución o el puerto 3001 está ocupado | Revise que \`pnpm run dev\` siga activo y cambie \`API_PORT\` y \`NEXT_PUBLIC_API_URL\` en \`.env\` |

## Variables de entorno (.env)

| Variable | Para qué sirve |
| --- | --- |
| \`POSTGRES_USER\`, \`POSTGRES_PASSWORD\`, \`POSTGRES_DB\`, \`POSTGRES_PORT\` | Usuario, contraseña, nombre y puerto de la base de datos local (los crea \`pnpm run setup\`) |
| \`DATABASE_URL\` | Dirección que usa la API para conectarse; debe coincidir con las anteriores |
| \`API_PORT\`, \`NEXT_PUBLIC_API_URL\` | Puerto de la API y dirección con la que la web la llama |
${authRow}${envTable}

${
  p.authentication.required
    ? `## Autenticación

La API exige un token Bearer firmado con \`JWT_SECRET\` (HS256) que incluya \`sub\` y \`roles\`.

**Para probar en su equipo** (opciones A y B): abra la pantalla «Acceso» de la aplicación web y pulse
«Entrar como …» con el rol que quiera. Es un acceso de un clic **sin credenciales**, activo solo
mientras \`DEV_LOGIN=true\` (lo activan \`pnpm run setup\` y el Docker local).

**Antes de publicar la aplicación**, ponga \`DEV_LOGIN=false\` (o quite la variable) en el entorno de la
API: sin él, ese acceso desaparece y solo entra quien tenga un token válido. La API avisa en su
registro mientras esté activo.

Con \`DEV_LOGIN\` desactivado puede seguir obteniendo un token por terminal y pegarlo en «Acceso»:

\`\`\`bash
pnpm --filter ./apps/api run dev-token -- ${p.authentication.roles[0] ?? 'USER'}
\`\`\`

Con la opción A (Docker):

\`\`\`bash
docker compose --project-directory . -f docker/docker-compose.app.yml exec api node apps/api/dist/auth/dev-token.js ${p.authentication.roles[0] ?? 'USER'}
\`\`\`

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
