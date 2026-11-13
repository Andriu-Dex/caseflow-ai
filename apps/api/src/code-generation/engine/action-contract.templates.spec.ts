import { describe, expect, it } from 'vitest';
import {
  implementationActionContractSchema,
  actionValueDefinitionSchema,
  implementationPlanContentSchema,
} from '@caseflow-ai/contracts';
import ts from 'typescript';
import { CASEFLOW_WEB_TS_V2 } from '@caseflow-ai/domain';
import { actionContractPlan, actionContractImplementations } from '../testing/action-contract-plan';
import { generateProject } from './project-generator';
import { generateOpenApi } from '../openapi.generator';
import { planCoverageProblems } from '../../construction/project-validation';
import { actionValueOpenApi, actionValueZod } from './action-contract.templates';

describe('bounded business action contracts', () => {
  it('accepts declarative collection layouts only with valid visible grouping fields', () => {
    const collection = {
      type: 'ARRAY',
      collectionLayout: 'TABLE',
      groupBy: 'category',
      items: { type: 'OBJECT', properties: [{ name: 'category', value: { type: 'STRING' } }] },
    };
    expect(actionValueDefinitionSchema.safeParse(collection).success).toBe(true);
    for (const value of [
      { ...collection, type: 'STRING' },
      { ...collection, collectionLayout: 'HTML' },
      { ...collection, groupBy: 'missing' },
      { ...collection, collectionLayout: undefined },
      {
        ...collection,
        items: {
          type: 'OBJECT',
          properties: [{ name: 'category', value: { type: 'STRING', technical: true } }],
        },
      },
      {
        ...collection,
        items: { type: 'OBJECT', properties: [{ name: 'category', value: { type: 'INT' } }] },
      },
    ])
      expect(actionValueDefinitionSchema.safeParse(value).success).toBe(false);
  });
  it('keeps server-owned lifecycle fields out of CRUD inputs while retaining their public values', () => {
    const plan = actionContractPlan();
    const item = plan.entities[0]!;
    item.operations = ['LIST', 'GET', 'CREATE', 'UPDATE'];
    item.fields.push({
      name: 'state',
      type: 'ENUM',
      required: true,
      unique: false,
      enumValues: ['NEW', 'DONE'],
      readOnly: true,
      serverDefault: 'NEW',
    });
    expect(implementationPlanContentSchema.safeParse(plan).success).toBe(true);
    const files = generateProject(
      { plan, template: CASEFLOW_WEB_TS_V2, projectName: 'Estados', slug: 'state-test' },
      actionContractImplementations,
    );
    const schema = files.find((f) => f.path === 'prisma/schema.prisma')!.content;
    expect(schema).toContain('@default(NEW)');
    const service = files.find((f) =>
      f.path.endsWith('/' + item.name.toLowerCase() + '.service.ts'),
    )!.content;
    expect(service).toContain('if (!updating) data.state = "NEW"');
    const contracts = files.find((f) => f.path === 'packages/contracts/src/index.ts')!.content;
    expect(contracts).not.toContain('state: z.enum');
    const doc = generateOpenApi(plan, 'Estados') as {
      components: { schemas: Record<string, { properties: Record<string, unknown> }> };
    };
    expect(doc.components.schemas[item.name]!.properties).toHaveProperty('state');
    expect(doc.components.schemas['Create' + item.name + 'Input']!.properties).not.toHaveProperty(
      'state',
    );
    expect(doc.components.schemas['Update' + item.name + 'Input']!.properties).not.toHaveProperty(
      'state',
    );
    for (const serverDefault of ['UNKNOWN', 3, false]) {
      item.fields.at(-1)!.serverDefault = serverDefault;
      expect(implementationPlanContentSchema.safeParse(plan).success).toBe(false);
    }
  });
  it('bounds file contracts and keeps upload and download payloads explicit', () => {
    const file = actionValueDefinitionSchema.parse({
      type: 'FILE',
      maxBytes: 5,
      mimeTypes: ['image/png'],
    });
    const schema = actionValueOpenApi(file) as {
      properties: Record<string, Record<string, unknown>>;
    };
    expect(schema.properties.base64).toMatchObject({ format: 'byte', maxLength: 8 });
    expect(schema.properties.mimeType).toMatchObject({ enum: ['image/png'] });
    expect(actionValueZod(file)).toContain('<=5');
    for (const value of [
      { type: 'FILE' },
      { type: 'FILE', maxBytes: 1_048_577, mimeTypes: ['image/png'] },
      { type: 'FILE', maxBytes: 5, mimeTypes: ['text/html'] },
      { type: 'FILE', maxBytes: 5, mimeTypes: ['image/png', 'image/png'] },
      { type: 'STRING', maxBytes: 5 },
    ])
      expect(actionValueDefinitionSchema.safeParse(value).success).toBe(false);
    expect(
      implementationActionContractSchema.safeParse({
        query: { type: 'OBJECT', properties: [{ name: 'attachment', value: file }] },
        response: file,
      }).success,
    ).toBe(false);
    const plan = actionContractPlan();
    plan.customEndpoints[1]!.contract!.body = {
      type: 'OBJECT',
      properties: [{ name: 'attachment', value: file }],
    };
    const files = generateProject(
      { plan, template: CASEFLOW_WEB_TS_V2, projectName: 'Archivos', slug: 'files-test' },
      actionContractImplementations,
    );
    expect(files.find((f) => f.path === 'apps/web/components/action-form.tsx')!.content).toContain(
      'type="file"',
    );
    expect(files.find((f) => f.path === 'apps/web/components/action-form.tsx')!.content).toContain(
      'URL.revokeObjectURL(url)',
    );
    expect(files.find((f) => f.path === 'apps/api/src/main.ts')!.content).toContain("limit: '2mb'");
  });
  it('rejects invalid shapes, duplicate fields, incompatible limits and excessive nesting', () => {
    for (const value of [
      { type: 'OBJECT' },
      { type: 'ARRAY' },
      { type: 'ENUM', enumValues: ['A', 'A'] },
      { type: 'INT', minimum: 2, maximum: 1 },
      { type: 'STRING', maxItems: 2 },
      {
        type: 'OBJECT',
        properties: [
          { name: 'x', value: { type: 'STRING' } },
          { name: 'x', value: { type: 'STRING' } },
        ],
      },
    ])
      expect(actionValueDefinitionSchema.safeParse(value).success).toBe(false);
    let deep: unknown = { type: 'STRING' };
    for (let i = 0; i < 6; i++) deep = { type: 'ARRAY', items: deep };
    expect(actionValueDefinitionSchema.safeParse(deep).success).toBe(false);
    expect(
      implementationActionContractSchema.safeParse({
        query: {
          type: 'OBJECT',
          properties: [{ name: 'nested', value: { type: 'OBJECT', properties: [] } }],
        },
        response: { type: 'BOOLEAN' },
      }).success,
    ).toBe(false);
  });
  it('keeps request, query and response shapes aligned across contracts, controllers, services and client', () => {
    const plan = actionContractPlan();
    const files = generateProject(
      { plan, template: CASEFLOW_WEB_TS_V2, projectName: 'Pedidos de prueba', slug: 'orders-test' },
      actionContractImplementations,
    );
    const get = (path: string) => files.find((file) => file.path === path)!.content;
    expect(get('packages/contracts/src/index.ts')).toContain('postOrdersConfirmBodySchema');
    expect(get('apps/api/src/orders/orders-actions.controller.ts')).toContain(
      '@Query(new ZodValidationPipe(getOrdersReviewQuerySchema,',
    );
    expect(get('apps/api/src/orders/orders-actions.controller.ts')).toContain(
      'validateActionResponse(await',
    );
    expect(get('apps/api/src/orders/orders-actions.controller.ts')).toContain(
      'Object.keys(undeclaredQuery).length',
    );
    expect(get('apps/api/src/orders/orders-actions.service.ts')).toContain(
      'body: PostOrdersConfirmBody',
    );
    expect(get('packages/api-client/src/index.ts')).toContain('encodeQuery(query)');
    expect(get('apps/web/app/orders/[orderId]/page.tsx')).toContain(
      'postOrdersConfirmBodySchema.parse(body)',
    );
    expect(get('apps/web/components/action-form.tsx')).not.toContain('JSON.stringify(result');
    expect(planCoverageProblems(files, plan)).toEqual([]);
    for (const file of files.filter((file) => /\.tsx?$/.test(file.path))) {
      const result = ts.transpileModule(file.content, {
        reportDiagnostics: true,
        compilerOptions: {
          target: ts.ScriptTarget.ES2022,
          jsx: ts.JsxEmit.ReactJSX,
          experimentalDecorators: true,
        },
      });
      expect(
        result.diagnostics?.filter(
          (diagnostic) => diagnostic.category === ts.DiagnosticCategory.Error,
        ),
        file.path,
      ).toEqual([]);
    }
    const doc = generateOpenApi(plan, 'Prueba') as {
      paths: Record<
        string,
        Record<string, { parameters?: { name: string; in: string }[]; requestBody?: unknown }>
      >;
    };
    expect(doc.paths['/orders/{orderId}/review']!.get!.parameters).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'includeLines', in: 'query' }),
        expect.objectContaining({ name: 'limit', in: 'query' }),
      ]),
    );
  });
});
import { implementationPlanAIOutputSchema } from '@caseflow-ai/contracts';

describe('explicit action policy and relational constraints', () => {
  it('keeps disabled actions explicit and prevents generated plans from disabling requirements', () => {
    const plan = actionContractPlan();
    plan.customEndpoints.push({
      moduleLocalId: 'orders',
      method: 'POST',
      path: '/orders/discounts',
      summary: 'Descuentos',
      roles: [],
      disabledReason: 'Desactivado por decisión aprobada.',
    });
    const { designBaselineId: ignored, ...body } = plan;
    void ignored;
    expect(implementationPlanAIOutputSchema.safeParse(body).success).toBe(false);
    const files = generateProject(
      { plan, template: CASEFLOW_WEB_TS_V2, projectName: 'Prueba', slug: 'test' },
      actionContractImplementations,
    );
    expect(
      files.find((file) => file.path === 'apps/api/src/orders/orders-actions.controller.ts')!
        .content,
    ).toContain('throw new ForbiddenException("Desactivado por decisión aprobada.")');
    expect(
      files.find((file) => file.path === 'apps/api/src/orders/orders-actions.service.ts')!.content,
    ).not.toContain('postOrdersDiscounts');
  });
  it('emits composite uniqueness and rejects nonexistent fields and duplicate constraints', () => {
    const input = actionContractPlan();
    input.entities[0]!.uniqueConstraints = [['name', 'active']];
    const files = generateProject(
      { plan: input, template: CASEFLOW_WEB_TS_V2, projectName: 'Prueba', slug: 'test' },
      actionContractImplementations,
    );
    expect(files.find((file) => file.path === 'prisma/schema.prisma')!.content).toContain(
      '@@unique([name, active])',
    );
    expect(() => actionContractPlan()).not.toThrow();
    const parse = (value: unknown) => implementationPlanContentSchema.safeParse(value).success;
    const { designBaselineId: ignored, ...body } = input;
    void ignored;
    expect(
      parse({
        ...body,
        designBaselineId: input.designBaselineId,
        entities: input.entities.map((entity, index) =>
          index ? entity : { ...entity, uniqueConstraints: [['missing', 'active']] },
        ),
      }),
    ).toBe(false);
    expect(parse(input)).toBe(true);
    input.entities[0]!.uniqueConstraints = [
      ['name', 'active'],
      ['active', 'name'],
    ];
    expect(parse(input)).toBe(false);
  });
  it('requires compatible review outputs and an accessible source action on the same screen', () => {
    const parse = (change: (plan: ReturnType<typeof actionContractPlan>) => void) => {
      const plan = actionContractPlan();
      change(plan);
      return implementationPlanContentSchema.safeParse(plan).success;
    };
    expect(parse(() => {})).toBe(true);
    expect(
      parse((plan) => {
        plan.routes[1]!.actions = plan.routes[1]!.actions.filter(
          (action) => action.endpoint !== 'GET /orders/:orderId/review',
        );
      }),
    ).toBe(false);
    expect(
      parse((plan) => {
        plan.customEndpoints[3]!.contract!.bindings![0] = {
          kind: 'ACTION',
          field: 'expectedRevision',
          sourceEndpoint: 'GET /orders/:orderId/review',
          sourceField: 'total',
        };
      }),
    ).toBe(false);
    expect(
      parse((plan) => {
        plan.customEndpoints[3]!.contract!.bindings![0] = {
          kind: 'ACTION',
          field: 'expectedRevision',
          sourceEndpoint: 'GET /orders/:orderId/review',
          sourceField: 'revision',
          requireTrue: 'total',
        };
      }),
    ).toBe(false);
    expect(
      parse((plan) => {
        plan.customEndpoints[0]!.contract!.body!.properties![0]!.value.items!.properties![0]!.value.referenceEntityLocalId =
          'missing';
      }),
    ).toBe(false);
    expect(
      parse((plan) => {
        plan.customEndpoints[0]!.contract!.successNavigation!.idField = 'missing';
      }),
    ).toBe(false);
  });
  it('registers custom routes ahead of resource identifiers and escapes untrusted descriptions', () => {
    const plan = actionContractPlan();
    plan.customEndpoints[0]!.summary = 'Texto */ const injected = true; /*';
    const files = generateProject(
      { plan, template: CASEFLOW_WEB_TS_V2, projectName: 'Prueba', slug: 'test' },
      actionContractImplementations,
    );
    expect(
      files.find((file) => file.path === 'apps/api/src/orders/orders.module.ts')!.content,
    ).toContain('controllers: [OrdersActionsController, ProductController');
    expect(
      files.find((file) => file.path === 'apps/api/src/orders/orders-actions.controller.ts')!
        .content,
    ).not.toContain('Texto */');
    expect(
      files.find((file) => file.path === 'packages/api-client/src/index.ts')!.content,
    ).not.toContain('Texto */');
  });
});
