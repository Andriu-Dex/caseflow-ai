import type { ImplementationPlanContent } from '@caseflow-ai/contracts';
import { generatePrismaSchema } from '../prisma-schema.generator';
import { collectionPath, kebabCase, lowerFirst, upperFirst } from '../naming';
import { createSchemaName, sampleInput, updateSchemaName } from './contracts.templates';
import {
  SCOPE,
  dependencies,
  file,
  json,
  type GeneratedProjectFile,
  type GenerationContext,
} from './types';

type Plan = ImplementationPlanContent;
type Entity = Plan['entities'][number];
type Endpoint = Plan['customEndpoints'][number];

// Business-logic bodies for custom endpoints, keyed by endpointKey(); filled
// by the AI-assisted step, otherwise the endpoint answers 501 honestly.
export type EndpointImplementations = Record<string, string>;
export const endpointKey = (e: Endpoint) => `${e.method} ${e.path}`;

export const actionMethodName = (e: Endpoint) =>
  lowerFirst(
    [
      e.method.toLowerCase(),
      ...e.path
        .split('/')
        .filter((s) => s && !s.startsWith(':'))
        .flatMap((s) => s.split('-')),
    ]
      .map(upperFirst)
      .join(''),
  );

const rolesLiteral = (roles: string[]) => roles.map((r) => `'${r}'`).join(', ');

function entityController(plan: Plan, entity: Entity, moduleName: string): string {
  const e = entity.name;
  const ops = new Set(entity.operations);
  const auth = plan.authentication.required;
  const read = auth ? `\n  @Roles(${rolesLiteral(entity.readRoles)})` : '';
  const write = auth ? `\n  @Roles(${rolesLiteral(entity.writeRoles)})` : '';
  const methods = [
    ops.has('LIST') &&
      `  @Get()${read}
  list() {
    return this.service.list();
  }`,
    ops.has('GET') &&
      `  @Get(':id')${read}
  get(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.get(id);
  }`,
    ops.has('CREATE') &&
      `  @Post()${write}
  create(@Body(new ZodValidationPipe(${createSchemaName(e)})) body: Create${e}Input) {
    return this.service.create(body);
  }`,
    ops.has('UPDATE') &&
      `  @Patch(':id')${write}
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(${updateSchemaName(e)})) body: Update${e}Input,
  ) {
    return this.service.update(id, body);
  }`,
    ops.has('DELETE') &&
      `  @Delete(':id')
  @HttpCode(204)${write}
  async remove(@Param('id', ParseUUIDPipe) id: string) {
    await this.service.remove(id);
  }`,
  ].filter(Boolean);
  const nestImports = [
    'Controller',
    ops.has('LIST') || ops.has('GET') ? 'Get' : '',
    ops.has('GET') || ops.has('UPDATE') || ops.has('DELETE') ? 'Param' : '',
    ops.has('GET') || ops.has('UPDATE') || ops.has('DELETE') ? 'ParseUUIDPipe' : '',
    ops.has('CREATE') ? 'Post' : '',
    ops.has('UPDATE') ? 'Patch' : '',
    ops.has('CREATE') || ops.has('UPDATE') ? 'Body' : '',
    ops.has('DELETE') ? 'Delete' : '',
    ops.has('DELETE') ? 'HttpCode' : '',
  ].filter(Boolean);
  const contracts = [
    ops.has('CREATE') ? [createSchemaName(e), `type Create${e}Input`] : [],
    ops.has('UPDATE') ? [updateSchemaName(e), `type Update${e}Input`] : [],
  ].flat();
  return [
    `import { ${nestImports.join(', ')} } from '@nestjs/common';`,
    "import { ApiTags } from '@nestjs/swagger';",
    contracts.length ? `import { ${contracts.join(', ')} } from '${SCOPE}/contracts';` : '',
    contracts.length ? "import { ZodValidationPipe } from '../common/zod-validation.pipe';" : '',
    auth && methods.length ? "import { Roles } from '../auth/roles.decorator';" : '',
    `import { ${e}Service } from './${kebabCase(e)}.service';`,
    '',
    `@ApiTags('${moduleName}')`,
    `@Controller('${collectionPath(e).slice(1)}')`,
    `export class ${e}Controller {`,
    `  constructor(private readonly service: ${e}Service) {}`,
    methods.length ? '' : '',
    methods.join('\n\n'),
    '}',
  ]
    .filter((line, i, all) => line !== '' || (all[i - 1] !== '' && i > 0))
    .join('\n');
}

function entityService(entity: Entity): string {
  const e = entity.name;
  const ops = new Set(entity.operations);
  const delegate = lowerFirst(e);
  const dateFields = entity.fields.filter((f) => f.type === 'DATE' || f.type === 'DATETIME');
  const needsInput = ops.has('CREATE') || ops.has('UPDATE');
  const methods = [
    ops.has('LIST') &&
      `  list() {
    // Bounded: a list endpoint never returns an unlimited number of rows.
    return this.prisma.${delegate}.findMany({ orderBy: { createdAt: 'desc' }, take: 500 });
  }`,
    (ops.has('GET') || ops.has('UPDATE') || ops.has('DELETE')) &&
      `  async get(id: string) {
    const found = await this.prisma.${delegate}.findUnique({ where: { id } });
    if (!found) throw new NotFoundException('No se encontró el registro.');
    return found;
  }`,
    ops.has('CREATE') &&
      `  create(input: Create${e}Input) {
    return this.prisma.${delegate}.create({ data: toData(input) as never });
  }`,
    ops.has('UPDATE') &&
      `  async update(id: string, input: Update${e}Input) {
    await this.get(id);
    return this.prisma.${delegate}.update({ where: { id }, data: toData(input) as never });
  }`,
    ops.has('DELETE') &&
      `  async remove(id: string) {
    await this.get(id);
    await this.prisma.${delegate}.delete({ where: { id } });
  }`,
  ].filter(Boolean);
  const conversions = dateFields.map(
    (f) => `  if (typeof data.${f.name} === 'string') data.${f.name} = new Date(data.${f.name});`,
  );
  const usesGet = ops.has('GET') || ops.has('UPDATE') || ops.has('DELETE');
  return [
    `import { Injectable${usesGet ? ', NotFoundException' : ''} } from '@nestjs/common';`,
    needsInput
      ? `import type { ${[ops.has('CREATE') && `Create${e}Input`, ops.has('UPDATE') && `Update${e}Input`].filter(Boolean).join(', ')} } from '${SCOPE}/contracts';`
      : '',
    "import { PrismaService } from '../prisma/prisma.service';",
    '',
    needsInput
      ? `// Wire format -> database values (dates arrive as ISO strings).
function toData(input: Record<string, unknown>): Record<string, unknown> {
  const data = { ...input };
${conversions.join('\n')}${conversions.length ? '\n' : ''}  return data;
}
`
      : '',
    '@Injectable()',
    `export class ${e}Service {`,
    '  constructor(private readonly prisma: PrismaService) {}',
    '',
    methods.join('\n\n'),
    '}',
  ]
    .filter((line, i) => !(line === '' && i === 1))
    .join('\n');
}

function entityServiceSpec(entity: Entity): string {
  const e = entity.name;
  const ops = new Set(entity.operations);
  const delegate = lowerFirst(e);
  const sample = sampleInput(entity);
  const dateField = entity.fields.find((f) => f.type === 'DATE' || f.type === 'DATETIME');
  const cases = [
    ops.has('LIST') &&
      `  it('lists the most recent records with a bounded page', async () => {
    await service.list();
    expect(prisma.${delegate}.findMany).toHaveBeenCalledWith({ orderBy: { createdAt: 'desc' }, take: 500 });
  });`,
    (ops.has('GET') || ops.has('UPDATE') || ops.has('DELETE')) &&
      `  it('answers 404 for a record that does not exist', async () => {
    await expect(service.get('${'00000000-0000-4000-8000-000000000000'}')).rejects.toBeInstanceOf(NotFoundException);
  });`,
    ops.has('CREATE') &&
      `  it('creates a record from a valid input', async () => {
    await service.create(input);
    const data = prisma.${delegate}.create.mock.calls[0]![0].data as Record<string, unknown>;
    expect(Object.keys(data).sort()).toEqual(Object.keys(input).sort());${
      dateField
        ? `
    expect(data.${dateField.name}).toBeInstanceOf(Date);`
        : ''
    }
  });`,
    ops.has('DELETE') &&
      `  it('deletes an existing record', async () => {
    prisma.${delegate}.findUnique.mockResolvedValueOnce({ id: 'x' });
    await service.remove('x');
    expect(prisma.${delegate}.delete).toHaveBeenCalledWith({ where: { id: 'x' } });
  });`,
  ].filter(Boolean);
  const usesNotFound = ops.has('GET') || ops.has('UPDATE') || ops.has('DELETE');
  return `import { describe, expect, it, vi, beforeEach } from 'vitest';
${usesNotFound ? "import { NotFoundException } from '@nestjs/common';\n" : ''}${
    ops.has('CREATE') ? `import type { Create${e}Input } from '${SCOPE}/contracts';\n` : ''
  }import type { PrismaService } from '../prisma/prisma.service';
import { ${e}Service } from './${kebabCase(e)}.service';

${ops.has('CREATE') ? `const input = ${JSON.stringify(sample)} as Create${e}Input;\n` : ''}
describe('${e}Service', () => {
  const prisma = {
    ${delegate}: {
      findMany: vi.fn(async () => []),
      findUnique: vi.fn(async (): Promise<Record<string, unknown> | null> => null),
      create: vi.fn(async (args: { data: Record<string, unknown> }) => ({ id: 'x', ...args.data })),
      update: vi.fn(async () => ({ id: 'x' })),
      delete: vi.fn(async () => ({ id: 'x' })),
    },
  };
  let service: ${e}Service;
  beforeEach(() => {
    vi.clearAllMocks();
    service = new ${e}Service(prisma as unknown as PrismaService);
  });

${
  cases.length
    ? cases.join('\n\n')
    : `  it('is constructible', () => {
    expect(service).toBeDefined();
  });`
}
});
`;
}

function actionsController(plan: Plan, moduleName: string, endpoints: Endpoint[]): string {
  const auth = plan.authentication.required;
  const verbs = [...new Set(endpoints.map((e) => upperFirst(e.method.toLowerCase())))];
  const methods = endpoints.map((endpoint) => {
    const params = [...endpoint.path.matchAll(/:([a-zA-Z0-9]+)/g)].map((m) => m[1]!);
    const hasBody = ['POST', 'PATCH', 'PUT'].includes(endpoint.method);
    const args = [
      ...params.map((p) => `@Param('${p}') ${p}: string`),
      ...(hasBody ? ['@Body() body: Record<string, unknown>'] : []),
    ];
    return `  /** ${endpoint.summary} */
  @${upperFirst(endpoint.method.toLowerCase())}('${endpoint.path.slice(1)}')${auth ? `\n  @Roles(${rolesLiteral(endpoint.roles)})` : ''}
  ${actionMethodName(endpoint)}(${args.join(', ')}) {
    return this.service.${actionMethodName(endpoint)}(${[...params, ...(hasBody ? ['body'] : [])].join(', ')});
  }`;
  });
  const usesParam = endpoints.some((e) => e.path.includes(':'));
  const usesBody = endpoints.some((e) => ['POST', 'PATCH', 'PUT'].includes(e.method));
  return `import { Controller, ${[...verbs, usesParam ? 'Param' : '', usesBody ? 'Body' : ''].filter(Boolean).join(', ')} } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
${auth ? "import { Roles } from '../auth/roles.decorator';\n" : ''}import { ${moduleName}ActionsService } from './${kebabCase(moduleName)}-actions.service';

// Business actions beyond CRUD, as declared in the Implementation Plan.
@ApiTags('${moduleName}')
@Controller()
export class ${moduleName}ActionsController {
  constructor(private readonly service: ${moduleName}ActionsService) {}

${methods.join('\n\n')}
}
`;
}

function actionsService(
  moduleName: string,
  endpoints: Endpoint[],
  implementations: EndpointImplementations,
): string {
  const methods = endpoints.map((endpoint) => {
    const params = [...endpoint.path.matchAll(/:([a-zA-Z0-9]+)/g)].map((m) => m[1]!);
    const hasBody = ['POST', 'PATCH', 'PUT'].includes(endpoint.method);
    const args = [
      ...params.map((p) => `${p}: string`),
      ...(hasBody ? ['body: Record<string, unknown>'] : []),
    ];
    const body = implementations[endpointKey(endpoint)];
    const names = [...params, ...(hasBody ? ['body'] : [])];
    return `  /** ${endpoint.summary} */
  async ${actionMethodName(endpoint)}(${args.join(', ')}): Promise<unknown> {
${
  body
    ? body
        .split('\n')
        .map((line) => (line ? `    ${line}` : line))
        .join('\n')
    : `    // No business logic was generated for this action: it answers 501
    // until it is implemented, instead of pretending to succeed.${names.length ? `\n    void [${names.join(', ')}];` : ''}
    throw new NotImplementedException('La acción «${endpoint.summary.replace(/'/g, '’')}» aún no está implementada.');`
}
  }`;
  });
  const anyStub = endpoints.some((e) => !implementations[endpointKey(e)]);
  return `import { Injectable${anyStub ? ', NotImplementedException' : ''} } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ${moduleName}ActionsService {
  constructor(private readonly prisma: PrismaService) {}

${methods.join('\n\n')}
}
`;
}

export function backendFiles(
  ctx: GenerationContext,
  implementations: EndpointImplementations = {},
): GeneratedProjectFile[] {
  const { plan, template } = ctx;
  const auth = plan.authentication.required;
  const files: GeneratedProjectFile[] = [];

  files.push(
    file('prisma/schema.prisma', generatePrismaSchema(plan), {
      origin: 'DETERMINISTIC',
      kind: 'SOURCE',
      planElements: plan.entities.map((e) => `entity:${e.localId}`),
    }),
    file(
      'apps/api/package.json',
      json({
        name: `${SCOPE}/api`,
        version: '0.1.0',
        private: true,
        scripts: {
          'prisma:generate': 'prisma generate',
          build: 'pnpm run prisma:generate && tsc -p tsconfig.build.json',
          typecheck: 'pnpm run prisma:generate && tsc --noEmit',
          lint: 'eslint src',
          test: 'pnpm run prisma:generate && vitest run',
          start: 'node dist/main.js',
          dev: 'pnpm run build && node dist/main.js',
          'db:migrate': 'prisma migrate dev',
          ...(auth ? { 'dev-token': 'node dist/auth/dev-token.js' } : {}),
        },
        dependencies: dependencies(
          template,
          [
            '@nestjs/common',
            '@nestjs/core',
            '@nestjs/platform-express',
            '@nestjs/swagger',
            '@prisma/adapter-pg',
            '@prisma/client',
            'reflect-metadata',
            'rxjs',
            'zod',
          ],
          [`${SCOPE}/contracts`],
        ),
        devDependencies: dependencies(template, [
          '@swc/core',
          '@types/express',
          '@types/node',
          'prisma',
          'typescript',
          'unplugin-swc',
          'vitest',
        ]),
      }),
      { kind: 'CONFIG' },
    ),
    file(
      'apps/api/prisma.config.ts',
      `import { defineConfig } from 'prisma/config';

// Loads the workspace .env when present (Node's built-in loader, no extra dependency).
try {
  process.loadEnvFile('../../.env');
} catch {
  // Environment variables may come from the process instead.
}

export default defineConfig({
  schema: '../../prisma/schema.prisma',
  migrations: { path: '../../prisma/migrations' },
  datasource: { url: process.env.DATABASE_URL ?? '' },
});
`,
      { kind: 'CONFIG' },
    ),
    file(
      'apps/api/tsconfig.json',
      json({
        extends: '../../tsconfig.base.json',
        compilerOptions: {
          experimentalDecorators: true,
          emitDecoratorMetadata: true,
          types: ['node'],
          noEmit: true,
        },
        include: ['src'],
      }),
      { kind: 'CONFIG' },
    ),
    file(
      'apps/api/tsconfig.build.json',
      json({
        extends: './tsconfig.json',
        compilerOptions: { noEmit: false, rootDir: 'src', outDir: 'dist' },
        exclude: ['src/**/*.spec.ts'],
      }),
      { kind: 'CONFIG' },
    ),
    file(
      'apps/api/vitest.config.mts',
      `import { fileURLToPath } from 'node:url';
import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [swc.vite({ module: { type: 'es6' } })],
  resolve: {
    alias: {
      '${SCOPE}/contracts': fileURLToPath(
        new URL('../../packages/contracts/src/index.ts', import.meta.url),
      ),
    },
  },
  test: { environment: 'node', include: ['src/**/*.spec.ts'] },
});
`,
      { kind: 'CONFIG' },
    ),
    file(
      'apps/api/src/main.ts',
      `import 'reflect-metadata';
import { resolve } from 'node:path';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';

try {
  process.loadEnvFile(resolve(__dirname, '../../../.env'));
} catch {
  // Environment variables may come from the process instead.
}

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.enableCors({ origin: process.env.WEB_ORIGIN ?? 'http://localhost:3000' });
  const config = new DocumentBuilder()
    .setTitle(${JSON.stringify(ctx.projectName)})
    .setVersion('1.0.0')${auth ? '\n    .addBearerAuth()' : ''}
    .build();
  SwaggerModule.setup('docs', app, SwaggerModule.createDocument(app, config));
  await app.listen(Number(process.env.API_PORT ?? 3001));
}

void bootstrap();
`,
      { kind: 'SOURCE' },
    ),
    file(
      'apps/api/src/prisma/prisma.service.ts',
      `import { Injectable, type OnModuleDestroy } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client';

// Connects lazily on first query, so the app (and its tests) start without a
// database; configure DATABASE_URL to reach one.
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleDestroy {
  constructor() {
    super({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL ?? '' }) });
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
`,
    ),
    file(
      'apps/api/src/prisma/prisma.module.ts',
      `import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';

@Global()
@Module({ providers: [PrismaService], exports: [PrismaService] })
export class PrismaModule {}
`,
    ),
    file(
      'apps/api/src/common/zod-validation.pipe.ts',
      `import { BadRequestException, type PipeTransform } from '@nestjs/common';
import type { ZodType } from 'zod';

// Validates request bodies against the shared contracts package.
export class ZodValidationPipe implements PipeTransform {
  constructor(private readonly schema: ZodType) {}

  transform(value: unknown) {
    const result = this.schema.safeParse(value);
    if (!result.success)
      throw new BadRequestException(result.error.issues.map((issue) => issue.message).join(' '));
    return result.data;
  }
}
`,
    ),
    file(
      'apps/api/src/common/database-error.filter.ts',
      `import {
  ArgumentsHost,
  Catch,
  ConflictException,
  HttpException,
  InternalServerErrorException,
  NotFoundException,
  type ExceptionFilter,
} from '@nestjs/common';
import { BaseExceptionFilter } from '@nestjs/core';

// Maps known database errors to safe HTTP answers; never exposes SQL, stack
// traces or internal details to clients.
@Catch()
export class DatabaseErrorFilter extends BaseExceptionFilter implements ExceptionFilter {
  override catch(exception: unknown, host: ArgumentsHost) {
    if (exception instanceof HttpException) return super.catch(exception, host);
    const code = (exception as { code?: unknown })?.code;
    if (code === 'P2025') return super.catch(new NotFoundException('No se encontró el registro.'), host);
    if (code === 'P2002')
      return super.catch(new ConflictException('Ya existe un registro con esos datos.'), host);
    if (code === 'P2003')
      return super.catch(
        new ConflictException('El registro está relacionado con otros datos y no puede modificarse así.'),
        host,
      );
    return super.catch(new InternalServerErrorException('Ocurrió un error inesperado.'), host);
  }
}
`,
    ),
    file(
      'apps/api/src/common/database-error.filter.spec.ts',
      `import { describe, expect, it, vi } from 'vitest';
import { ConflictException, NotFoundException, type ArgumentsHost } from '@nestjs/common';
import { BaseExceptionFilter } from '@nestjs/core';
import { DatabaseErrorFilter } from './database-error.filter';

describe('DatabaseErrorFilter', () => {
  const handled = (error: unknown) => {
    const spy = vi.spyOn(BaseExceptionFilter.prototype, 'catch').mockImplementation(() => undefined);
    new DatabaseErrorFilter().catch(error, {} as ArgumentsHost);
    const forwarded = spy.mock.calls[0]![0];
    spy.mockRestore();
    return forwarded;
  };

  it('turns database errors into safe HTTP errors', () => {
    expect(handled({ code: 'P2025' })).toBeInstanceOf(NotFoundException);
    expect(handled({ code: 'P2002' })).toBeInstanceOf(ConflictException);
    expect((handled(new Error('SELECT * FROM secret')) as Error).message).not.toContain('SELECT');
  });
});
`,
      { kind: 'TEST' },
    ),
    file(
      'apps/api/src/health.controller.ts',
      `import { Controller, Get } from '@nestjs/common';
${auth ? "import { Public } from './auth/roles.decorator';\n" : ''}
@Controller('health')
export class HealthController {
  @Get()${auth ? '\n  @Public()' : ''}
  check() {
    return { status: 'ok' };
  }
}
`,
    ),
  );

  if (auth)
    files.push(
      file(
        'apps/api/src/auth/jwt.ts',
        `import { createHmac, timingSafeEqual } from 'node:crypto';

export interface TokenClaims {
  sub: string;
  roles: string[];
  exp: number;
}

const encode = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url');
const sign = (data: string, secret: string) =>
  createHmac('sha256', secret).update(data).digest('base64url');

// Minimal HS256 JWT (node:crypto only); tokens carry the user id and roles.
export function signToken(claims: TokenClaims, secret: string): string {
  const data = \`\${encode({ alg: 'HS256', typ: 'JWT' })}.\${encode(claims)}\`;
  return \`\${data}.\${sign(data, secret)}\`;
}

export function verifyToken(token: string, secret: string, now = Date.now()): TokenClaims | null {
  const [header, payload, signature] = token.split('.');
  if (!header || !payload || !signature) return null;
  const expected = Buffer.from(sign(\`\${header}.\${payload}\`, secret));
  const actual = Buffer.from(signature);
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null;
  try {
    const claims = JSON.parse(Buffer.from(payload, 'base64url').toString()) as TokenClaims;
    if (typeof claims.exp !== 'number' || claims.exp * 1000 < now) return null;
    if (typeof claims.sub !== 'string' || !Array.isArray(claims.roles)) return null;
    return claims;
  } catch {
    return null;
  }
}
`,
      ),
      file(
        'apps/api/src/auth/roles.decorator.ts',
        `import { SetMetadata } from '@nestjs/common';

export const ROLES_KEY = 'roles';
export const PUBLIC_KEY = 'public';
// Empty = any authenticated user.
export const Roles = (...roles: string[]) => SetMetadata(ROLES_KEY, roles);
export const Public = () => SetMetadata(PUBLIC_KEY, true);
`,
      ),
      file(
        'apps/api/src/auth/auth.guard.ts',
        `import {
  ForbiddenException,
  Injectable,
  UnauthorizedException,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { verifyToken } from './jwt';
import { PUBLIC_KEY, ROLES_KEY } from './roles.decorator';

// Global guard: every route needs a valid bearer token unless marked @Public();
// @Roles(...) restricts it further.
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const targets = [context.getHandler(), context.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(PUBLIC_KEY, targets)) return true;
    const request = context.switchToHttp().getRequest<{ headers: Record<string, string | undefined> }>();
    const header = request.headers.authorization ?? '';
    const secret = process.env.JWT_SECRET;
    const claims =
      secret && header.startsWith('Bearer ') ? verifyToken(header.slice(7), secret) : null;
    if (!claims) throw new UnauthorizedException('Inicie sesión para continuar.');
    const roles = this.reflector.getAllAndOverride<string[]>(ROLES_KEY, targets) ?? [];
    if (roles.length && !roles.some((role) => claims.roles.includes(role)))
      throw new ForbiddenException('No tiene permiso para realizar esta acción.');
    return true;
  }
}
`,
      ),
      file(
        'apps/api/src/auth/auth.spec.ts',
        `import 'reflect-metadata';
import { describe, expect, it, beforeAll } from 'vitest';
import { ForbiddenException, UnauthorizedException, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from './auth.guard';
import { signToken, verifyToken } from './jwt';
import { PUBLIC_KEY, ROLES_KEY } from './roles.decorator';

const SECRET = 'test-secret';
const token = (roles: string[], exp = Math.floor(Date.now() / 1000) + 60) =>
  signToken({ sub: 'user-1', roles, exp }, SECRET);

function context(authorization: string | undefined, metadata: Record<string, unknown>) {
  const handler = () => undefined;
  for (const [key, value] of Object.entries(metadata)) Reflect.defineMetadata(key, value, handler);
  return {
    getHandler: () => handler,
    getClass: () => class {},
    switchToHttp: () => ({ getRequest: () => ({ headers: { authorization } }) }),
  } as unknown as ExecutionContext;
}

describe('jwt', () => {
  it('verifies its own tokens and rejects tampered or expired ones', () => {
    expect(verifyToken(token(['A']), SECRET)?.roles).toEqual(['A']);
    expect(verifyToken(token(['A']), 'other-secret')).toBeNull();
    expect(verifyToken(\`\${token(['A'])}x\`, SECRET)).toBeNull();
    expect(verifyToken(token(['A'], 1), SECRET)).toBeNull();
  });
});

describe('AuthGuard', () => {
  const guard = new AuthGuard(new Reflector());
  beforeAll(() => {
    process.env.JWT_SECRET = SECRET;
  });

  it('lets public routes through and requires a token elsewhere', () => {
    expect(guard.canActivate(context(undefined, { [PUBLIC_KEY]: true }))).toBe(true);
    expect(() => guard.canActivate(context(undefined, {}))).toThrow(UnauthorizedException);
  });

  it('enforces the roles a route declares', () => {
    const route = { [ROLES_KEY]: ['ADMIN'] };
    expect(guard.canActivate(context(\`Bearer \${token(['ADMIN'])}\`, route))).toBe(true);
    expect(() => guard.canActivate(context(\`Bearer \${token(['GUEST'])}\`, route))).toThrow(
      ForbiddenException,
    );
  });
});
`,
        { kind: 'TEST' },
      ),
      file(
        'apps/api/src/auth/dev-token.ts',
        `import { resolve } from 'node:path';
import { signToken } from './jwt';

// Development helper: prints an 8-hour token for the roles given as arguments.
try {
  process.loadEnvFile(resolve(__dirname, '../../../../.env'));
} catch {
  // JWT_SECRET may come from the environment instead.
}
const secret = process.env.JWT_SECRET;
if (!secret) {
  console.error('Defina JWT_SECRET en .env');
  process.exit(1);
}
const roles = process.argv.slice(2);
console.log(
  signToken({ sub: 'dev-user', roles, exp: Math.floor(Date.now() / 1000) + 8 * 3600 }, secret),
);
`,
      ),
    );

  const moduleImports: string[] = [];
  for (const module of plan.modules) {
    const dir = kebabCase(module.name);
    const entities = plan.entities.filter((e) => e.moduleLocalId === module.localId);
    const endpoints = plan.customEndpoints.filter((e) => e.moduleLocalId === module.localId);
    const moduleElement = `module:${module.localId}`;
    for (const entity of entities) {
      const elements = [moduleElement, `entity:${entity.localId}`];
      files.push(
        file(
          `apps/api/src/${dir}/${kebabCase(entity.name)}.controller.ts`,
          entityController(plan, entity, module.name),
          { origin: 'DETERMINISTIC', planElements: elements },
        ),
        file(`apps/api/src/${dir}/${kebabCase(entity.name)}.service.ts`, entityService(entity), {
          origin: 'DETERMINISTIC',
          planElements: elements,
        }),
        file(
          `apps/api/src/${dir}/${kebabCase(entity.name)}.service.spec.ts`,
          entityServiceSpec(entity),
          { origin: 'DETERMINISTIC', kind: 'TEST', planElements: elements },
        ),
      );
    }
    if (endpoints.length) {
      const elements = [moduleElement, ...endpoints.map((e) => `endpoint:${endpointKey(e)}`)];
      const aiAssisted = endpoints.some((e) => implementations[endpointKey(e)]);
      files.push(
        file(
          `apps/api/src/${dir}/${dir}-actions.controller.ts`,
          actionsController(plan, module.name, endpoints),
          { origin: 'DETERMINISTIC', planElements: elements },
        ),
        file(
          `apps/api/src/${dir}/${dir}-actions.service.ts`,
          actionsService(module.name, endpoints, implementations),
          { origin: aiAssisted ? 'AI_ASSISTED' : 'DETERMINISTIC', planElements: elements },
        ),
      );
    }
    const controllers = [
      ...entities.map((e) => `${e.name}Controller`),
      ...(endpoints.length ? [`${module.name}ActionsController`] : []),
    ];
    const providers = [
      ...entities.map((e) => `${e.name}Service`),
      ...(endpoints.length ? [`${module.name}ActionsService`] : []),
    ];
    const imports = [
      ...entities.flatMap((e) => [
        `import { ${e.name}Controller } from './${kebabCase(e.name)}.controller';`,
        `import { ${e.name}Service } from './${kebabCase(e.name)}.service';`,
      ]),
      ...(endpoints.length
        ? [
            `import { ${module.name}ActionsController } from './${dir}-actions.controller';`,
            `import { ${module.name}ActionsService } from './${dir}-actions.service';`,
          ]
        : []),
    ];
    files.push(
      file(
        `apps/api/src/${dir}/${dir}.module.ts`,
        `import { Module } from '@nestjs/common';
${imports.join('\n')}

// ${module.description.replace(/\s+/g, ' ')}
@Module({
  controllers: [${controllers.join(', ')}],
  providers: [${providers.join(', ')}],
})
export class ${module.name}Module {}
`,
        { origin: 'DETERMINISTIC', planElements: [moduleElement] },
      ),
    );
    moduleImports.push(`import { ${module.name}Module } from './${dir}/${dir}.module';`);
  }

  files.push(
    file(
      'apps/api/src/app.module.ts',
      `import { Module } from '@nestjs/common';
import { APP_FILTER${auth ? ', APP_GUARD' : ''} } from '@nestjs/core';
import { PrismaModule } from './prisma/prisma.module';
import { HealthController } from './health.controller';
import { DatabaseErrorFilter } from './common/database-error.filter';
${auth ? "import { AuthGuard } from './auth/auth.guard';\n" : ''}${moduleImports.join('\n')}

@Module({
  imports: [PrismaModule, ${plan.modules.map((m) => `${m.name}Module`).join(', ')}],
  controllers: [HealthController],
  providers: [
    { provide: APP_FILTER, useClass: DatabaseErrorFilter },${auth ? '\n    { provide: APP_GUARD, useClass: AuthGuard },' : ''}
  ],
})
export class AppModule {}
`,
      { origin: 'DETERMINISTIC', planElements: plan.modules.map((m) => `module:${m.localId}`) },
    ),
  );
  return files;
}
