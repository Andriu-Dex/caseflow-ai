import type { ImplementationPlanContent } from '@caseflow-ai/contracts';
import { generatePrismaSchema } from '../prisma-schema.generator';
import { collectionPath, kebabCase, lowerFirst, upperFirst } from '../naming';
import { createSchemaName, sampleInput, updateSchemaName } from './contracts.templates';
import { customEndpointOperationId } from '../naming';
import { actionSchemaName, actionTypeName } from './action-contract.templates';
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
// by the business-logic step, otherwise the endpoint answers 501 honestly.
export type EndpointImplementations = Record<string, string>;
// Exceptions an implementation body may throw (imported on demand).
export const HTTP_EXCEPTIONS = [
  'BadRequestException',
  'ConflictException',
  'ForbiddenException',
  'NotFoundException',
] as const;

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

export interface PrimaryDateResolution {
  name: string;
  label: string;
  relationName?: string;
}

export function findPrimaryDateResolution(
  entity: Entity,
  plan?: ImplementationPlanContent,
): PrimaryDateResolution | undefined {
  const dates = entity.fields.filter((f) => f.type === 'DATE' || f.type === 'DATETIME');
  // 1. Specific operational business dates on the entity itself
  const operationalDate = dates.find((f) => /(?:operational|sale|servicio|operativ)/i.test(f.name));
  if (operationalDate) {
    return {
      name: operationalDate.name,
      label: operationalDate.label ?? operationalDate.name,
    };
  }
  // 2. Validity period dates
  const validityDate = dates.find((f) => /(?:validfrom|validadesde)/i.test(f.name));
  if (validityDate) {
    return {
      name: validityDate.name,
      label: validityDate.label ?? validityDate.name,
    };
  }
  // 3. Parent relation domain operational dates (e.g. dailyMenu.operationalDate)
  if (plan) {
    for (const rel of entity.relations.filter((r) => r.kind === 'MANY_TO_ONE')) {
      const target = plan.entities.find((e) => e.localId === rel.targetEntityLocalId);
      if (target) {
        const targetDates = target.fields.filter((f) => f.type === 'DATE' || f.type === 'DATETIME');
        const parentDomainDate = targetDates.find((f) => /(?:operational|sale|fecha)/i.test(f.name));
        if (parentDomainDate) {
          return {
            name: parentDomainDate.name,
            label: `Fecha operativa de ${rel.name === 'dailyMenu' ? 'menú diario' : rel.name}`,
            relationName: rel.name,
          };
        }
      }
    }
  }
  // 4. Other specific domain dates (excluding pure audit and publication)
  const domainDate = dates.find(
    (f) =>
      /(?:period|date|fecha|due|vencimiento)/i.test(f.name) &&
      !/(?:creat|updat|delet|publication)/i.test(f.name),
  );
  if (domainDate) {
    return {
      name: domainDate.name,
      label: domainDate.label ?? domainDate.name,
    };
  }
  // 5. Publication date
  const publicationDate = dates.find((f) => /publication/i.test(f.name));
  if (publicationDate) {
    return {
      name: publicationDate.name,
      label: publicationDate.label ?? publicationDate.name,
    };
  }
  // 6. Audit creation date fallback
  const createdDate = dates.find((f) => /created/i.test(f.name));
  if (createdDate) return { name: createdDate.name, label: createdDate.label ?? createdDate.name };
  return undefined;
}

export function findPrimaryDateField(
  entity: Entity,
  plan?: ImplementationPlanContent,
): PrimaryDateResolution | undefined {
  return findPrimaryDateResolution(entity, plan);
}

function entityController(plan: Plan, entity: Entity, moduleName: string): string {
  const e = entity.name;
  const ops = new Set(entity.operations);
  const auth = plan.authentication.required;
  const scoped = Boolean(plan.authentication.local?.scope);
  const read = auth ? `\n  @Roles(${rolesLiteral(entity.readRoles)})` : '';
  const write = auth ? `\n  @Roles(${rolesLiteral(entity.writeRoles)})` : '';
  const primaryDate = findPrimaryDateResolution(entity, plan);
  const operation = (method: string, detail = false) =>
    scoped
      ? `\n  @Operation(${JSON.stringify(method + ' ' + collectionPath(e) + (detail ? '/:id' : ''))})`
      : '';
  const methods = [
    ops.has('LIST') &&
      `  @Get()${read}${operation('GET')}
  list(@Query('page') page?: string, @Query('limit') limit?: string${primaryDate ? ", @Query('from') from?: string, @Query('to') to?: string" : ''}) {
    const pageNum = page !== undefined ? Number(page) : undefined;
    const limitNum = limit !== undefined ? Number(limit) : undefined;
    ${
      primaryDate
        ? `if (from !== undefined) {
      const ms = Date.parse(from);
      if (!Number.isFinite(ms)) throw new BadRequestException('El parámetro "from" debe ser una fecha válida (formato YYYY-MM-DD o ISO).');
    }
    if (to !== undefined) {
      const ms = Date.parse(to);
      if (!Number.isFinite(ms)) throw new BadRequestException('El parámetro "to" debe ser una fecha válida (formato YYYY-MM-DD o ISO).');
    }
    if (from !== undefined && to !== undefined && Date.parse(from) > Date.parse(to)) {
      throw new BadRequestException('El rango temporal es inválido: "from" no puede ser posterior a "to".');
    }\n    `
        : ''
    }return this.service.list({
      page: pageNum !== undefined && Number.isFinite(pageNum) && pageNum >= 1 ? Math.min(Math.floor(pageNum), 100_000) : undefined,
      limit: limitNum !== undefined && Number.isFinite(limitNum) && limitNum >= 1 ? Math.min(Math.floor(limitNum), 500) : undefined,${primaryDate ? '\n      from: typeof from === "string" && from.trim() ? from.trim() : undefined,\n      to: typeof to === "string" && to.trim() ? to.trim() : undefined,' : ''}
    });
  }`,
    ops.has('GET') &&
      `  @Get(':id')${read}${operation('GET', true)}
  get(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.get(id);
  }`,
    ops.has('CREATE') &&
      `  @Post()${write}${operation('POST')}
  create(@Body(new ZodValidationPipe(${createSchemaName(e)})) body: Create${e}Input) {
    return this.service.create(body);
  }`,
    ops.has('UPDATE') &&
      `  @Patch(':id')${write}${operation('PATCH', true)}
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(${updateSchemaName(e)})) body: Update${e}Input,
  ) {
    return this.service.update(id, body);
  }`,
    ops.has('DELETE') &&
      `  @Delete(':id')
  @HttpCode(204)${write}${operation('DELETE', true)}
  async remove(@Param('id', ParseUUIDPipe) id: string) {
    await this.service.remove(id);
  }`,
  ].filter(Boolean);
  const nestImports = [
    'Controller',
    ops.has('LIST') || ops.has('GET') ? 'Get' : '',
    ops.has('LIST') ? 'Query' : '',
    ops.has('LIST') && primaryDate ? 'BadRequestException' : '',
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
    auth && methods.length
      ? `import { Roles${scoped ? ', Operation' : ''} } from '../auth/roles.decorator';`
      : '',
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

const omitFields = (entity: Entity) =>
  entity.fields.some((f) => f.internal)
    ? ', omit: { ' +
      entity.fields
        .filter((f) => f.internal)
        .map((f) => f.name + ': true')
        .join(', ') +
      ' }'
    : '';
function entityService(entity: Entity, plan: ImplementationPlanContent): string {
  const local =
    plan.authentication.local?.userEntityLocalId === entity.localId
      ? plan.authentication.local
      : undefined;
  const e = entity.name;
  const ops = new Set(entity.operations);
  const delegate = lowerFirst(e);
  const toOne = entity.relations.filter((relation) => relation.kind === 'MANY_TO_ONE');
  const many = entity.relations.filter(
    (relation) =>
      relation.kind === 'MANY_TO_MANY' &&
      relation.name !== local?.roleRelation &&
      Boolean(plan.authentication.local?.scope),
  );
  const includes = [
    ...(local ? [local.roleRelation] : []),
    ...toOne.map((relation) => relation.name),
    ...many.map((relation) => relation.name),
  ];
  const accountInclude = includes.length
    ? `, include: { ${includes.map((name) => `${name}: true`).join(', ')} }`
    : '';
  const projectResult = local ? 'publicAccount' : many.length ? 'publicRelations' : undefined;
  const primaryDate = findPrimaryDateResolution(entity, plan);
  const entityDateFields = entity.fields.filter((f) => f.type === 'DATE' || f.type === 'DATETIME');
  const needsInput = ops.has('CREATE') || ops.has('UPDATE');
  const methods = [
    ops.has('LIST') &&
      `  ${projectResult ? 'async ' : ''}list(query?: { page?: number; limit?: number${primaryDate ? '; from?: string; to?: string' : ''} }) {
    // Bounded: a list endpoint never returns an unlimited number of rows.
    const page = query?.page && Number.isFinite(query.page) && query.page >= 1 ? Math.min(Math.floor(query.page), 100_000) : 1;
    const limit = query?.limit && Number.isFinite(query.limit) && query.limit >= 1 ? Math.min(Math.floor(query.limit), 500) : (query?.page !== undefined ? 20 : 500);
    const skip = query?.page !== undefined ? (page - 1) * limit : 0;
    ${
      primaryDate
        ? `const parseDateGte = (v?: string) => {
      if (!v || typeof v !== 'string') return undefined;
      const ms = Date.parse(v.includes('T') ? v : v + 'T00:00:00.000Z');
      if (!Number.isFinite(ms)) throw new BadRequestException('El parámetro "from" no es una fecha válida.');
      return new Date(ms);
    };
    const parseDateLte = (v?: string) => {
      if (!v || typeof v !== 'string') return undefined;
      const ms = Date.parse(v.includes('T') ? v : v + 'T23:59:59.999Z');
      if (!Number.isFinite(ms)) throw new BadRequestException('El parámetro "to" no es una fecha válida.');
      return new Date(ms);
    };
    const gteDate = parseDateGte(query?.from);
    const lteDate = parseDateLte(query?.to);
    if (gteDate && lteDate && gteDate > lteDate) {
      throw new BadRequestException('El parámetro "from" no puede ser posterior a "to".');
    }
    const hasDateFilter = Boolean(gteDate || lteDate);
    const dateWhere = hasDateFilter ? {
      where: {
        ${
          primaryDate.relationName
            ? `${primaryDate.relationName}: {
          ${primaryDate.name}: {
            ...(gteDate ? { gte: gteDate } : {}),
            ...(lteDate ? { lte: lteDate } : {}),
          },
        }`
            : `${primaryDate.name}: {
          ...(gteDate ? { gte: gteDate } : {}),
          ...(lteDate ? { lte: lteDate } : {}),
        }`
        },
      },
    } : {};\n    `
        : ''
    }return ${projectResult ? '(await ' : ''}this.prisma.${delegate}.findMany({
      ${primaryDate ? '...dateWhere,\n      ' : ''}orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
      take: limit,
      ...(skip > 0 ? { skip } : {})${omitFields(entity)}${accountInclude}
    })${projectResult ? `).map(${projectResult})` : ''};
  }`,
    (ops.has('GET') || ops.has('UPDATE') || ops.has('DELETE')) &&
      `  async get(id: string) {
    const found = await this.prisma.${delegate}.findUnique({ where: { id }${omitFields(entity)}${accountInclude} });
    if (!found) throw new NotFoundException('No se encontró el registro.');
    return ${projectResult ? `${projectResult}(found)` : 'found'};
  }`,
    ops.has('CREATE') &&
      `  ${projectResult ? 'async ' : ''}create(input: Create${e}Input) {
    return ${projectResult ? `${projectResult}(await ` : ''}this.prisma.${delegate}.create({ data: ${local ? 'await toAccountData(input)' : 'toData(input)'} as never${omitFields(entity)}${accountInclude} })${projectResult ? ')' : ''};
  }`,
    ops.has('UPDATE') &&
      `  async update(id: string, input: Update${e}Input) {
    const current = await this.get(id);
    ${
      entity.fields.some((f) => f.name === 'status' && f.enumValues?.includes('PUBLICADA'))
        ? `if ((current as { status?: string }).status === 'PUBLICADA') {
      throw new BadRequestException('No se puede modificar una versión publicada; las versiones publicadas son inmutables.');
    }
    if ((input as { status?: string }).status === 'PUBLICADA') {
      ${
        entity.name === 'MenuVersion'
          ? `const compCount = await this.prisma.menuVersionComponent.count({ where: { menuVersionId: id } });
      if (compCount === 0) {
        throw new BadRequestException('No se puede publicar una versión de menú sin componentes registrados.');
      }\n      `
          : ''
      }(input as Record<string, unknown>).publicationDate = new Date();
    }\n    `
        : ''
    }${
      local
        ? `const data = await toAccountData(input, true);
    return this.prisma.$transaction(async tx => {
      const updated = await tx.${delegate}.update({ where: { id }, data: data as never${omitFields(entity)}${accountInclude} });
      if (input.password) await tx.${lowerFirst(plan.entities.find((e) => e.localId === local.sessionEntityLocalId)!.name)}.updateMany({ where: { ${local.sessionUserRelation}Id: id }, data: { ${local.invalidatedAtField}: new Date(), ${local.sessionStatusField}: ${JSON.stringify(local.closedSessionStatus)} } });
      return publicAccount(updated);
    });`
        : `return ${projectResult ? `${projectResult}(await ` : ''}this.prisma.${delegate}.update({ where: { id }, data: toData(input, true) as never${omitFields(entity)}${accountInclude} })${projectResult ? ')' : ''};`
    }
  }`,
    ops.has('DELETE') &&
      `  async remove(id: string) {
    await this.get(id);
    await this.prisma.${delegate}.delete({ where: { id } });
  }`,
  ].filter(Boolean);
  const conversions = entityDateFields.map(
    (f) => `  if (typeof data.${f.name} === 'string') data.${f.name} = new Date(data.${f.name});`,
  );
  const usesGet = ops.has('GET') || ops.has('UPDATE') || ops.has('DELETE');
  const hasStatusCheck = entity.fields.some((f) => f.name === 'status' && f.enumValues?.includes('PUBLICADA'));
  return [
    `import { Injectable${usesGet ? ', NotFoundException' : ''}${local || hasStatusCheck || primaryDate ? ', BadRequestException' : ''} } from '@nestjs/common';`,
    local ? "import * as argon2 from 'argon2';" : '',
    needsInput
      ? `import type { ${[ops.has('CREATE') && `Create${e}Input`, ops.has('UPDATE') && `Update${e}Input`].filter(Boolean).join(', ')} } from '${SCOPE}/contracts';`
      : '',
    "import { PrismaService } from '../prisma/prisma.service';",
    '',
    needsInput
      ? `// Wire format -> database values (dates arrive as ISO strings).
function toData(input: Record<string, unknown>, updating = false): Record<string, unknown> {
  const data = { ...input };
  void updating;
${entity.fields
  .filter((f) => f.serverDefault !== undefined)
  .map((f) => `  if (!updating) data.${f.name} = ${JSON.stringify(f.serverDefault)};`)
  .join('\n')}
${many.map((relation) => `  if (Array.isArray(data.${relation.name}Ids)) { data.${relation.name} = { [updating ? 'set' : 'connect']: (data.${relation.name}Ids as string[]).map(id => ({ id })) }; delete data.${relation.name}Ids; }`).join('\n')}
${conversions.join('\n')}${conversions.length ? '\n' : ''}  return data;
}
`
      : '',
    many.length
      ? `function publicRelations<T extends { ${many.map((relation) => `${relation.name}: { id: string }[]`).join('; ')} }>(record: T) {
  const { ${many.map((relation) => relation.name).join(', ')}, ...fields } = record;
  return { ...fields, ${many.map((relation) => `${relation.name}Ids: ${relation.name}.map(item => item.id)`).join(', ')} };
}`
      : '',
    local
      ? `function publicAccount<T extends { ${local.roleRelation}: { ${local.roleNameField}: string }[]; ${local.passwordHashField}?: unknown }>(record: T) {
  const { ${local.roleRelation}: assignedRoles, ${local.passwordHashField}: hidden, ...publicFields } = record;
  void hidden;
  return { ...${many.length ? 'publicRelations(publicFields as typeof publicFields & { ' + many.map((relation) => relation.name + ': { id: string }[]').join('; ') + ' })' : 'publicFields'}, roleNames: assignedRoles.map(role => role.${local.roleNameField}) };
}
async function toAccountData(input: Record<string, unknown>, updating = false) {
  const { password, roleNames, ...fields } = input;
  if (!updating && typeof password !== 'string') throw new BadRequestException('Indique una contraseña.');
  const data = toData(fields, updating);
  if (typeof password === 'string') data.${local.passwordHashField} = await argon2.hash(password, { type: argon2.argon2id });
  if (Array.isArray(roleNames)) data.${local.roleRelation} = ${local.scope ? `{ [updating ? 'set' : 'connect']: roleNames.map(name => ({ ${local.roleNameField}: name })) }` : `{ ...(updating ? { set: [] } : {}), connectOrCreate: roleNames.map(name => ({ where: { ${local.roleNameField}: name }, create: { ${local.roleNameField}: name } })) }`};
  return data;
}`
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

function entityServiceSpec(entity: Entity, plan: ImplementationPlanContent): string {
  const local =
    plan.authentication.local?.userEntityLocalId === entity.localId
      ? plan.authentication.local
      : undefined;
  const e = entity.name;
  const ops = new Set(entity.operations);
  const delegate = lowerFirst(e);
  const toOne = entity.relations.filter((relation) => relation.kind === 'MANY_TO_ONE');
  const many = entity.relations.filter(
    (relation) =>
      relation.kind === 'MANY_TO_MANY' &&
      relation.name !== local?.roleRelation &&
      Boolean(plan.authentication.local?.scope),
  );
  const includes = [
    ...(local ? [local.roleRelation] : []),
    ...toOne.map((relation) => relation.name),
    ...many.map((relation) => relation.name),
  ];
  const accountInclude = includes.length
    ? `, include: { ${includes.map((name) => `${name}: true`).join(', ')} }`
    : '';
  const sample = {
    ...sampleInput(entity),
    ...(local ? { password: 'test-password-only', roleNames: [plan.authentication.roles[0]] } : {}),
  };
  const dateField = entity.fields.find((f) => f.type === 'DATE' || f.type === 'DATETIME');
  const cases = [
    ops.has('LIST') &&
      `  it('lists the most recent records with a bounded page', async () => {
    await service.list();
    expect(prisma.${delegate}.findMany).toHaveBeenCalledWith({ orderBy: [{ createdAt: 'desc' }, { id: 'asc' }], take: 500${omitFields(entity)}${accountInclude} });
  });`,
    ops.has('LIST') &&
      `  it('paginates records deterministically when requested', async () => {
    await service.list({ page: 2, limit: 10 });
    expect(prisma.${delegate}.findMany).toHaveBeenCalledWith({ orderBy: [{ createdAt: 'desc' }, { id: 'asc' }], take: 10, skip: 10${omitFields(entity)}${accountInclude} });
  });`,
    (ops.has('GET') || ops.has('UPDATE') || ops.has('DELETE')) &&
      `  it('answers 404 for a record that does not exist', async () => {
    await expect(service.get('${'00000000-0000-4000-8000-000000000000'}')).rejects.toBeInstanceOf(NotFoundException);
  });`,
    ops.has('CREATE') &&
      `  it('creates a record from a valid input', async () => {
    await service.create(input);
    const data = prisma.${delegate}.create.mock.calls[0]![0].data as Record<string, unknown>;
    ${
      local
        ? `expect(data.${local.passwordHashField}).toMatch(/^\\$argon2id\\$/);
    expect(data).not.toHaveProperty('password');
    expect(data).not.toHaveProperty('roleNames');`
        : `expect(Object.keys(data).sort()).toEqual([...Object.keys(input), ...${JSON.stringify(entity.fields.filter((f) => f.serverDefault !== undefined).map((f) => f.name))}].sort());\n${entity.fields
            .filter((f) => f.serverDefault !== undefined)
            .map((f) => `    expect(data.${f.name}).toEqual(${JSON.stringify(f.serverDefault)});`)
            .join('\n')}`
    }${
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
      create: vi.fn(async (args: { data: Record<string, unknown> }) => ({ id: 'x', ...args.data${local ? `, ${local.roleRelation}: [{ ${local.roleNameField}: ${JSON.stringify(plan.authentication.roles[0])} }]` : ''}${
        plan.authentication.local?.scope
          ? entity.relations
              .filter(
                (relation) =>
                  relation.kind === 'MANY_TO_MANY' && relation.name !== local?.roleRelation,
              )
              .map((relation) => `, ${relation.name}: []`)
              .join('')
          : ''
      } })),
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

function actionDataAccess(plan: Plan, endpoint: Endpoint): Record<string, string[]> {
  const access: Record<string, string[]> = {};
  for (const entry of endpoint.dataAccess ?? []) {
    const model = plan.entities.find((entity) => entity.localId === entry.entityLocalId)!.name;
    access[model] = [...new Set([...(access[model] ?? []), ...entry.operations])];
  }
  return access;
}

function actionsController(plan: Plan, moduleName: string, endpoints: Endpoint[]): string {
  endpoints = [...endpoints].sort(
    (a, b) =>
      (a.path.match(/:/g)?.length ?? 0) - (b.path.match(/:/g)?.length ?? 0) ||
      b.path.length - a.path.length,
  );
  const auth = plan.authentication.required;
  const localActor = Boolean(plan.authentication.local);
  const verbs = [...new Set(endpoints.map((e) => upperFirst(e.method.toLowerCase())))];
  const methods = endpoints.map((endpoint) => {
    const params = [...endpoint.path.matchAll(/:([a-zA-Z0-9]+)/g)].map((m) => m[1]!);
    const hasBody = ['POST', 'PATCH', 'PUT'].includes(endpoint.method);
    const id = customEndpointOperationId(endpoint);
    const typed = endpoint.contract;
    const args = [
      ...params.map((p) => `@Param('${p}') ${p}: string`),
      ...(hasBody
        ? [
            typed?.body
              ? `@Body(new ZodValidationPipe(${actionSchemaName(id, 'Body')}, 'Revise los datos de la operación.')) body: ${actionTypeName(id, 'Body')}`
              : '@Body() body: Record<string, unknown>',
          ]
        : []),
      ...(typed?.query
        ? [
            `@Query(new ZodValidationPipe(${actionSchemaName(id, 'Query')}, 'Revise los filtros de consulta.')) query: ${actionTypeName(id, 'Query')}`,
          ]
        : typed
          ? ['@Query() undeclaredQuery: Record<string, unknown>']
          : []),
      ...(localActor ? ['@Req() request: { user: SessionActor }'] : []),
    ];
    return `  /** ${endpoint.summary.replace(/\*\//g, '* /').replace(/\s+/g, ' ')} */
  @${upperFirst(endpoint.method.toLowerCase())}('${endpoint.path.slice(1)}')${auth ? `\n  @Roles(${rolesLiteral(endpoint.roles)})` : ''}${plan.authentication.local?.scope ? `\n  @Operation(${JSON.stringify(endpointKey(endpoint))})\n  @DataAccess(${JSON.stringify(actionDataAccess(plan, endpoint))})${endpoint.scopeAccess === 'ASSIGNED_SET' ? "\n  @ScopeAccess('ASSIGNED_SET')" : ''}` : ''}
  ${typed ? '@HttpCode(200)\n  async ' : ''}${actionMethodName(endpoint)}(${args.join(', ')}) {
    ${typed && !typed.query ? "if (Object.keys(undeclaredQuery).length) throw new BadRequestException('Esta acción no admite filtros de consulta.');" : ''}
    ${endpoint.disabledReason ? `void [this.service, ${[...params, ...(hasBody ? ['body'] : []), ...(localActor ? ['request'] : [])].join(', ')}]; throw new ForbiddenException(${JSON.stringify(endpoint.disabledReason)});` : `return ${typed ? 'validateActionResponse(await ' : ''}this.service.${actionMethodName(endpoint)}(${[...params, ...(hasBody ? ['body'] : []), ...(typed?.query ? ['query'] : []), ...(localActor ? ['request.user'] : [])].join(', ')})${typed ? `, ${actionSchemaName(id, 'Response')})` : ''};`}
  }`;
  });
  const usesParam = endpoints.some((e) => e.path.includes(':'));
  const usesBody = endpoints.some((e) => ['POST', 'PATCH', 'PUT'].includes(e.method));
  const typedEndpoints = endpoints.filter((endpoint) => endpoint.contract);
  const typedImports = typedEndpoints.flatMap((endpoint) => {
    const id = customEndpointOperationId(endpoint);
    return (['Body', 'Query', 'Response'] as const).flatMap((part) =>
      endpoint.contract![part === 'Body' ? 'body' : part === 'Query' ? 'query' : 'response']
        ? [
            actionSchemaName(id, part),
            ...(part !== 'Response' ? [`type ${actionTypeName(id, part)}`] : []),
          ]
        : [],
    );
  });
  return `import { Controller, ${[...verbs, usesParam ? 'Param' : '', usesBody ? 'Body' : '', localActor ? 'Req' : '', typedEndpoints.length ? 'HttpCode, InternalServerErrorException, Query' : '', typedEndpoints.some((endpoint) => !endpoint.contract?.query) ? 'BadRequestException' : '', endpoints.some((endpoint) => endpoint.disabledReason) ? 'ForbiddenException' : ''].filter(Boolean).join(', ')} } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
${typedEndpoints.length ? `import { ${typedImports.join(', ')} } from '@app/contracts';\n${typedEndpoints.some((endpoint) => endpoint.contract?.body || endpoint.contract?.query) ? "import { ZodValidationPipe } from '../common/zod-validation.pipe';\n" : ''}function validateActionResponse<T>(value: unknown, schema: {parse(value:unknown):T}): T { try { return schema.parse(JSON.parse(JSON.stringify(value))); } catch { throw new InternalServerErrorException('La respuesta de la operación no cumple el contrato.'); } }` : ''}
${localActor ? "import type { SessionActor } from '../auth/local-auth.service';\n" : ''}${auth ? `import { Roles${plan.authentication.local?.scope ? ', Operation, DataAccess' : ''}${plan.authentication.local?.scope && endpoints.some((endpoint) => endpoint.scopeAccess === 'ASSIGNED_SET') ? ', ScopeAccess' : ''} } from '../auth/roles.decorator';\n` : ''}import { ${moduleName}ActionsService } from './${kebabCase(moduleName)}-actions.service';

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
  localActor = false,
): string {
  endpoints = endpoints.filter((endpoint) => !endpoint.disabledReason);
  const methods = endpoints.map((endpoint) => {
    const params = [...endpoint.path.matchAll(/:([a-zA-Z0-9]+)/g)].map((m) => m[1]!);
    const hasBody = ['POST', 'PATCH', 'PUT'].includes(endpoint.method);
    const id = customEndpointOperationId(endpoint);
    const args = [
      ...params.map((p) => `${p}: string`),
      ...(hasBody
        ? [
            endpoint.contract?.body
              ? `body: ${actionTypeName(id, 'Body')}`
              : 'body: Record<string, unknown>',
          ]
        : []),
      ...(endpoint.contract?.query ? [`query: ${actionTypeName(id, 'Query')}`] : []),
      ...(localActor ? ['actor: SessionActor'] : []),
    ];
    const body = implementations[endpointKey(endpoint)];
    const names = [
      ...params,
      ...(hasBody ? ['body'] : []),
      ...(endpoint.contract?.query ? ['query'] : []),
      ...(localActor ? ['actor'] : []),
    ];
    // An AI body may leave a parameter unused (the lint forbids it): such a
    // parameter is marked as used, as in the stub.
    const unused = body ? names.filter((name) => !new RegExp(`\\b${name}\\b`).test(body)) : [];
    return `  /** ${endpoint.summary.replace(/\*\//g, '* /').replace(/\s+/g, ' ')} */
  async ${actionMethodName(endpoint)}(${args.join(', ')}): Promise<${endpoint.contract ? actionTypeName(id, 'Response') : 'unknown'}> {
${
  body
    ? (unused.length ? `    void [${unused.join(', ')}];\n` : '') +
      body
        .split('\n')
        .map((line) => (line ? `    ${line}` : line))
        .join('\n')
    : `    // No business logic was generated for this action: it answers 501
    // until it is implemented, instead of pretending to succeed.${names.length ? `\n    void [${names.join(', ')}];` : ''}
    throw new NotImplementedException(${JSON.stringify(`La acción «${endpoint.summary}» aún no está implementada.`)});`
}
  }`;
  });
  const anyStub = endpoints.some((e) => !implementations[endpointKey(e)]);
  const bodies = endpoints.map((e) => implementations[endpointKey(e)] ?? '').join('\n');
  // Only the exceptions the provided bodies actually use, so lint stays clean.
  const exceptions = HTTP_EXCEPTIONS.filter((name) => new RegExp(`\\b${name}\\b`).test(bodies));
  const nestImports = [
    'Injectable',
    ...exceptions,
    ...(anyStub ? ['NotImplementedException'] : []),
  ];
  return `import { ${nestImports.join(', ')} } from '@nestjs/common';
${endpoints.some((endpoint) => endpoint.contract) ? `import type { ${endpoints.flatMap((endpoint) => (endpoint.contract ? (['Body', 'Query', 'Response'] as const).filter((part) => endpoint.contract![part === 'Body' ? 'body' : part === 'Query' ? 'query' : 'response']).map((part) => actionTypeName(customEndpointOperationId(endpoint), part)) : [])).join(', ')} } from '@app/contracts';` : ''}
${localActor ? "import type { SessionActor } from '../auth/local-auth.service';" : ''}
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ${moduleName}ActionsService {
  constructor(private readonly prisma: PrismaService) { ${endpoints.length ? '' : 'void this.prisma;'} }

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
          // First run: creates the initial migration and applies it. `db:deploy` only applies
          // the migrations that already exist (what scripts/setup.mjs uses once they do).
          'db:migrate': 'prisma migrate dev --name init',
          'db:deploy': 'prisma migrate deploy',
          ...(auth && !plan.authentication.local
            ? { 'dev-token': 'node dist/auth/dev-token.js' }
            : {}),
          ...(plan.authentication.local
            ? { 'account:create': 'node dist/auth/create-account.js' }
            : {}),
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
            ...(plan.authentication.local ? ['argon2'] : []),
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
import type { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';

try {
  process.loadEnvFile(resolve(__dirname, '../../../.env'));
} catch {
  // Environment variables may come from the process instead.
}

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  app.useBodyParser('json', { limit: '2mb' });
  app.enableCors({ origin: process.env.WEB_ORIGIN ?? 'http://localhost:3000' });
  const config = new DocumentBuilder()
    .setTitle(${JSON.stringify(ctx.projectName)})
    .setVersion('1.0.0')${auth ? '\n    .addBearerAuth()' : ''}
    .build();
  SwaggerModule.setup('docs', app, SwaggerModule.createDocument(app, config));
  // With DEV_LOGIN on, listen only on this machine unless API_HOST says otherwise.
  const host = process.env.API_HOST ?? (process.env.DEV_LOGIN === 'true' ? '127.0.0.1' : '0.0.0.0');
  await app.listen(Number(process.env.API_PORT ?? 3001), host);
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
${plan.authentication.local?.scope ? "import { scopedTransaction, operationContext } from '../auth/operation-scope';\nimport { ForbiddenException } from '@nestjs/common';" : ''}

${
  plan.authentication.local?.scope
    ? `function withOperationScope(database: PrismaClient): PrismaClient {
    return new Proxy(Object.create(null) as object,{get(_target,key){
      if(key==='$transaction') return (work:unknown,options?:Parameters<PrismaClient['$transaction']>[1])=>{
        if(typeof work!=='function'){
          if(operationContext.getStore())throw new ForbiddenException('Utilice una transacción interactiva con alcance.');
          return database.$transaction(work as never,options as never);
        }
        return database.$transaction(async tx=>(work as (client:unknown)=>Promise<unknown>)(scopedTransaction(tx)),options);
      };
      if(operationContext.getStore())return Reflect.get(scopedTransaction(database) as object,key);
      const value=Reflect.get(database,key);return typeof value==='function'?value.bind(database):value;
    }}) as PrismaClient;
}
`
    : ''
}
// Connects lazily on first query, so the app (and its tests) start without a
// database; configure DATABASE_URL to reach one.
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleDestroy {
  constructor() {
    super({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL ?? '' }) });
    ${plan.authentication.local?.scope ? 'return withOperationScope(this) as this;' : ''}
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
  constructor(private readonly schema: ZodType, private readonly publicMessage?: string) {}

  transform(value: unknown) {
    const result = this.schema.safeParse(value);
    if (!result.success)
      throw new BadRequestException(this.publicMessage ?? result.error.issues.map((issue) => issue.message).join(' '));
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
${plan.authentication.local ? '  sessionId?: string;\n' : ''}${plan.authentication.local?.scope ? '  scopeId?: string;\n' : ''}}

const encode = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url');
const sign = (data: string, secret: string) =>
  createHmac('sha256', secret).update(data).digest('base64url');

// Minimal HS256 JWT (node:crypto only); tokens carry the user id and roles.
export function signToken(claims: TokenClaims, secret: string): string {
  const data = \`\${encode({ alg: 'HS256', typ: 'JWT' })}.\${encode(claims)}\`;
  return \`\${data}.\${sign(data, secret)}\`;
}

export function verifyToken(token: string, secret: string, now = Date.now()): TokenClaims | null {
${plan.authentication.local ? "  if (token.split('.').length !== 3) return null;\n" : ''}  const [header, payload, signature] = token.split('.');
  if (!header || !payload || !signature) return null;
  const expected = Buffer.from(sign(\`\${header}.\${payload}\`, secret));
  const actual = Buffer.from(signature);
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null;
  try {
${plan.authentication.local ? "    const algorithm = JSON.parse(Buffer.from(header, 'base64url').toString()) as { alg?: string };\n    if (algorithm.alg !== 'HS256') return null;\n" : ''}    const claims = JSON.parse(Buffer.from(payload, 'base64url').toString()) as TokenClaims;
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
${plan.authentication.local?.scope ? "export const OPERATION_KEY = 'operation';\nexport const DATA_ACCESS_KEY = 'data-access';\nexport const DataAccess = (access: Record<string, string[]>) => SetMetadata(DATA_ACCESS_KEY, access);\nexport const SCOPE_ACCESS_KEY = 'scope-access';\nexport const SCOPE_OPTIONAL_KEY = 'scope-optional';\nexport const ScopeOptional = () => SetMetadata(SCOPE_OPTIONAL_KEY, true);\nexport const Operation = (operation: string) => SetMetadata(OPERATION_KEY, operation);\nexport const ScopeAccess = (access: 'ASSIGNED_SET') => SetMetadata(SCOPE_ACCESS_KEY, access);" : ''}
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
        'apps/api/src/auth/dev-login.controller.ts',
        `import { BadRequestException, Controller, Get, Logger, NotFoundException, Post, Body } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { Public } from './roles.decorator';
import { signToken } from './jwt';

const ROLES: readonly string[] = ${JSON.stringify(plan.authentication.roles)};
const EIGHT_HOURS = 8 * 3600;

// Development sign-in: one click instead of pasting a token. Active only when
// DEV_LOGIN=true, so it must be off (the default in .env.example) before publishing.
export const devLoginEnabled = () => process.env.DEV_LOGIN === 'true';

@ApiExcludeController()
@Controller('auth/dev-login')
export class DevLoginController {
  constructor() {
    if (devLoginEnabled())
      new Logger('DevLogin').warn('DEV_LOGIN=true: cualquiera puede entrar sin credenciales. Desactívelo antes de publicar.');
  }

  // Lets the web app know whether to offer the one-click sign-in.
  @Get()
  @Public()
  status() {
    return devLoginEnabled() ? { enabled: true, roles: ROLES } : { enabled: false, roles: [] };
  }

  @Post()
  @Public()
  login(@Body() body: { role?: unknown }) {
    const secret = process.env.JWT_SECRET;
    if (!devLoginEnabled() || !secret) throw new NotFoundException();
    const role = body?.role;
    if (typeof role !== 'string' || !ROLES.includes(role))
      throw new BadRequestException('Rol no válido.');
    const exp = Math.floor(Date.now() / 1000) + EIGHT_HOURS;
    return { token: signToken({ sub: 'dev-user', roles: [role], exp }, secret) };
  }
}
`,
      ),
      file(
        'apps/api/src/auth/dev-login.spec.ts',
        `import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { DevLoginController } from './dev-login.controller';
import { verifyToken } from './jwt';

const ROLE = ${JSON.stringify(plan.authentication.roles[0] ?? 'USER')};

describe('DevLoginController', () => {
  const saved = { ...process.env };
  beforeEach(() => {
    process.env.JWT_SECRET = 'test-secret';
  });
  afterEach(() => {
    process.env = { ...saved };
  });

  it('is invisible and refuses to sign tokens unless DEV_LOGIN is true', () => {
    delete process.env.DEV_LOGIN;
    const controller = new DevLoginController();
    expect(controller.status()).toEqual({ enabled: false, roles: [] });
    expect(() => controller.login({ role: ROLE })).toThrow(NotFoundException);
    process.env.DEV_LOGIN = 'false';
    expect(() => controller.login({ role: ROLE })).toThrow(NotFoundException);
  });

  it('signs a token for a planned role when enabled and rejects any other', () => {
    process.env.DEV_LOGIN = 'true';
    const controller = new DevLoginController();
    expect(controller.status().enabled).toBe(true);
    const { token } = controller.login({ role: ROLE });
    expect(verifyToken(token, 'test-secret')?.roles).toEqual([ROLE]);
    expect(() => controller.login({ role: 'NOT_A_ROLE' })).toThrow(BadRequestException);
    expect(() => controller.login({})).toThrow(BadRequestException);
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
  console.error('Falta JWT_SECRET en .env. Ejecute "pnpm run setup": crea el archivo con el secreto.');
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
    const endpoints = plan.customEndpoints.filter(
      (e) => e.moduleLocalId === module.localId && !e.builtin,
    );
    const moduleElement = `module:${module.localId}`;
    for (const entity of entities) {
      const elements = [moduleElement, `entity:${entity.localId}`];
      files.push(
        file(
          `apps/api/src/${dir}/${kebabCase(entity.name)}.controller.ts`,
          entityController(plan, entity, module.name),
          { origin: 'DETERMINISTIC', planElements: elements },
        ),
        file(
          `apps/api/src/${dir}/${kebabCase(entity.name)}.service.ts`,
          entityService(entity, plan),
          {
            origin: 'DETERMINISTIC',
            planElements: elements,
          },
        ),
        file(
          `apps/api/src/${dir}/${kebabCase(entity.name)}.service.spec.ts`,
          entityServiceSpec(entity, plan),
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
          actionsService(
            module.name,
            endpoints,
            implementations,
            Boolean(plan.authentication.local),
          ),
          { origin: aiAssisted ? 'AI_ASSISTED' : 'DETERMINISTIC', planElements: elements },
        ),
      );
    }
    const controllers = [
      ...(endpoints.length ? [`${module.name}ActionsController`] : []),
      ...entities.map((e) => `${e.name}Controller`),
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
import { APP_FILTER${auth ? ', APP_GUARD' : ''}${plan.authentication.local ? ', APP_INTERCEPTOR' : ''} } from '@nestjs/core';
import { PrismaModule } from './prisma/prisma.module';
import { HealthController } from './health.controller';
${plan.authentication.local ? "import { LocalAuthService } from './auth/local-auth.service';\nimport { LocalAuthController } from './auth/local-auth.controller';\nimport { SafeResponseInterceptor } from './auth/safe-response.interceptor';" : ''}
${plan.authentication.local?.scope ? "import { OperationScopeInterceptor } from './auth/operation-scope';" : ''}
import { DatabaseErrorFilter } from './common/database-error.filter';
${auth ? "import { AuthGuard } from './auth/auth.guard';\n" : ''}${auth && !plan.authentication.local ? "import { DevLoginController } from './auth/dev-login.controller';\n" : ''}${moduleImports.join('\n')}

@Module({
  imports: [PrismaModule, ${plan.modules.map((m) => `${m.name}Module`).join(', ')}],
  controllers: [HealthController${auth && !plan.authentication.local ? ', DevLoginController' : ''}${plan.authentication.local ? ', LocalAuthController' : ''}],
  providers: [
    ${plan.authentication.local ? 'LocalAuthService, { provide: APP_INTERCEPTOR, useClass: SafeResponseInterceptor },' : ''}
    ${plan.authentication.local?.scope ? '{ provide: APP_INTERCEPTOR, useClass: OperationScopeInterceptor },' : ''}
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
