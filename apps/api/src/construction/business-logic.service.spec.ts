import { describe, expect, it, vi } from 'vitest';
import { AIError } from '@caseflow-ai/ai';
import { CASEFLOW_WEB_TS_V1 } from '@caseflow-ai/domain';
import { implementationPlanContentSchema } from '@caseflow-ai/contracts';
import {
  BusinessLogicService,
  reviewBusinessLogic,
  scopedRelations,
  unimplementedWarning,
} from './business-logic.service';

describe('reviewBusinessLogic', () => {
  it('rejects dynamic imports and private persistence internals while keeping ordinary transactions and aggregates', () => {
    for (const body of [
      "return await import('../auth/operation-scope');",
      'return this.prisma._originalClient;',
      "return this.prisma['constructor'];",
      'return this.prisma.$extends({});',
    ])
      expect(reviewBusinessLogic(body)).toMatchObject({ accepted: false });
    expect(reviewBusinessLogic('return this.prisma._engine;')).toMatchObject({
      reason: expect.stringContaining('(_engine)'),
    });
    expect(
      reviewBusinessLogic(
        'return this.prisma.$transaction(async tx => tx.order.aggregate({ _sum: { total: true } }));',
      ),
    ).toEqual({ accepted: true });
  });
  it('rejects private credential access through properties or string keys', () => {
    for (const body of ['return row.secretDigest;', "return row['secretDigest'];"])
      expect(reviewBusinessLogic(body, ['secretDigest'])).toMatchObject({ accepted: false });
    expect(reviewBusinessLogic('return row.name;', ['secretDigest'])).toEqual({ accepted: true });
  });
  it('accepts a body that only uses prisma delegates and exceptions', () => {
    expect(
      reviewBusinessLogic(
        "const o = await this.prisma.order.findUnique({ where: { id: orderId } });\nif (!o) throw new NotFoundException('No existe.');\nreturn o;",
      ),
    ).toEqual({ accepted: true });
  });

  it.each([
    ["import dayjs from 'dayjs';\nreturn dayjs();", 'importa paquetes', ['dayjs']],
    ["const x = require('@scope/pkg/sub');", 'importa paquetes', ['@scope/pkg']],
    ['return process.env.SECRET;', 'accede a process', []],
    ["return eval('1');", 'evalúa código dinámico', []],
    ["await fetch('http://x');", 'hace llamadas de red', []],
    ['await this.prisma.$queryRaw`SELECT 1`;', 'usa SQL crudo', []],
    ['return globalThis;', 'accede al ámbito global', []],
  ])('rejects %j', (body, reason, packages) => {
    expect(reviewBusinessLogic(body)).toEqual({ accepted: false, reason, packages });
  });
});

describe('isolated relation filters', () => {
  // Only what scopedRelations reads: the scope entity and each relation's target.
  const plan = {
    authentication: { local: { scope: { entityLocalId: 'branch' } } },
    entities: [
      { localId: 'branch', name: 'Branch', relations: [], operationScope: { paths: [] } },
      {
        localId: 'menu',
        name: 'DailyMenu',
        relations: [{ name: 'branch', targetEntityLocalId: 'branch' }],
        operationScope: { paths: [['branch']] },
      },
      {
        localId: 'version',
        name: 'MenuVersion',
        relations: [{ name: 'dailyMenu', targetEntityLocalId: 'menu' }],
        operationScope: { paths: [['dailyMenu', 'branch']] },
      },
    ],
  };
  const relations = scopedRelations(plan as never);

  it('rejects a filter, include or select through a relation to a scope-isolated model', () => {
    for (const body of [
      'return tx.menuVersion.findFirst({ where: { id: versionid, dailyMenu: { branchId } } });',
      'return this.prisma.menuVersion.updateMany({ where: { AND: [{ dailyMenu: { is: { branchId } } }] }, data: {} });',
      'return this.prisma.menuVersion.findMany({ include: { dailyMenu: true } });',
    ])
      expect(reviewBusinessLogic(body, [], relations)).toMatchObject({
        accepted: false,
        reason: expect.stringContaining('menuVersion.dailyMenu'),
      });
  });

  it('accepts separate queries with their own where, and the scope entity itself', () => {
    expect(
      reviewBusinessLogic(
        [
          'const menu = await tx.dailyMenu.findFirst({ where: { id: menuId, branchId } });',
          'const version = await tx.menuVersion.findFirst({ where: { id: versionid, dailyMenuId: menu.id } });',
          'return tx.dailyMenu.findMany({ where: { branch: { status: "ACTIVE" } } });',
        ].join('\n'),
        [],
        relations,
      ),
    ).toEqual({ accepted: true });
  });
});

describe('unimplementedWarning', () => {
  it('rejects a body cut off mid-expression, as the token limit leaves it', () => {
    const cut = [
      'const venta = await this.prisma.sale.findUnique({ where: { id: saleId } });',
      'return {',
      '  lineas: venta.lines.map((linea) => ({',
      '    identificador: linea.id,',
      '    rot',
    ].join(String.fromCharCode(10));
    const review = reviewBusinessLogic(cut);
    expect(review.accepted).toBe(false);
    expect(review).toMatchObject({
      reason: expect.stringContaining('no es código TypeScript válido'),
    });
    expect(reviewBusinessLogic('const total: number = 1; return { total };').accepted).toBe(true);
  });

  it('names only the packages outside the approved catalog', () => {
    const warning = unimplementedWarning(
      'Confirmar pedido',
      { accepted: false, reason: 'importa paquetes', packages: ['zod', 'left-pad'] },
      CASEFLOW_WEB_TS_V1,
    );
    expect(warning).toContain('«left-pad»');
    expect(warning).not.toContain('«zod»');
  });

  it('explains other rejections', () => {
    expect(
      unimplementedWarning(
        'Confirmar pedido',
        { accepted: false, reason: 'accede a process', packages: [] },
        CASEFLOW_WEB_TS_V1,
      ),
    ).toContain('porque accede a process');
  });
});

describe('BusinessLogicService.implement', () => {
  const plan = implementationPlanContentSchema.parse({
    designBaselineId: '11111111-1111-4111-8111-111111111111',
    authentication: { required: false, roles: [] },
    modules: [{ localId: 'sales', name: 'Sales', description: 'Pedidos' }],
    entities: [
      {
        localId: 'order',
        name: 'Order',
        moduleLocalId: 'sales',
        fields: [
          { name: 'total', type: 'DECIMAL' },
          { name: 'note', type: 'TEXT', required: false },
        ],
        operations: ['LIST'],
      },
    ],
    customEndpoints: [
      {
        moduleLocalId: 'sales',
        entityLocalId: 'order',
        method: 'POST',
        path: '/orders/:orderId/confirm',
        summary: 'Confirmar pedido',
      },
    ],
  });
  const prisma = {
    project: { findUnique: vi.fn().mockResolvedValue({ language: 'ES' }) },
    designBaseline: { findMany: vi.fn().mockResolvedValue([]) },
  };
  const implement = (generateStructured: ReturnType<typeof vi.fn>) =>
    new BusinessLogicService(prisma as never, { generateStructured } as never).implement(
      'p',
      'r',
      plan,
      CASEFLOW_WEB_TS_V1,
    );

  it('keeps reviewed bodies keyed by endpoint', async () => {
    const result = await implement(
      vi.fn().mockResolvedValue({ data: { body: 'return { ok: true };' } }),
    );
    expect(Object.values(result.implementations)).toEqual(['return { ok: true };']);
    expect(result.warnings).toEqual([]);
  });

  it('tells the model which fields may be null', async () => {
    const generate = vi.fn().mockResolvedValue({ data: { body: 'return { ok: true };' } });
    await implement(generate);
    const context = JSON.parse(generate.mock.calls[0]![0].messages[0].content);
    expect(context.prismaDelegates[0].fields).toEqual([
      'id',
      'total: DECIMAL',
      'note: TEXT | null',
    ]);
  });

  it('separates user-facing language from technical code names for typed actions', async () => {
    const generateStructured = vi.fn().mockResolvedValue({ data: { body: 'return true;' } });
    const typed = structuredClone(plan);
    typed.entities[0]!.fields.push({
      name: 'revision',
      type: 'INT',
      required: true,
      unique: false,
      enumValues: [],
      readOnly: true,
      serverDefault: 1,
    });
    typed.customEndpoints[0]!.contract = {
      body: { type: 'OBJECT', properties: [] },
      response: { type: 'BOOLEAN' },
    };
    await new BusinessLogicService(prisma as never, { generateStructured } as never).implement(
      'p',
      'r',
      typed,
      CASEFLOW_WEB_TS_V1,
    );
    const request = generateStructured.mock.calls[0]![0];
    expect(request.promptVersion).toBe(7);
    expect(request.language).toBeUndefined();
    expect(JSON.parse(request.messages[0].content).userFacingLanguage).toBe('ES');
    expect(JSON.parse(request.messages[0].content).prismaDelegates[0].serverOwnedFields).toEqual([
      { name: 'revision', initialValue: 1 },
    ]);
  });

  it('asks once more after a rejection, then keeps the 501 stub and warns', async () => {
    const generate = vi.fn().mockResolvedValue({ data: { body: 'return process.env;' } });
    const result = await implement(generate);
    expect(result.implementations).toEqual({});
    expect(result.warnings).toEqual([expect.stringContaining('Confirmar pedido')]);
    // Bounded: one retry, never a third request.
    expect(generate).toHaveBeenCalledTimes(2);
  });

  it('accepts a corrected proposal, telling the model why the first was rejected', async () => {
    const generate = vi
      .fn()
      .mockResolvedValueOnce({ data: { body: 'return this.prisma._engine;' } })
      .mockResolvedValueOnce({ data: { body: 'return this.prisma.order.findMany();' } });
    const result = await implement(generate);
    expect(Object.values(result.implementations)).toEqual(['return this.prisma.order.findMany();']);
    const retry = generate.mock.calls[1]![0].messages;
    expect(retry).toHaveLength(2);
    expect(retry[1].content).toContain('(_engine)');
  });

  it('degrades gracefully when AI is unavailable', async () => {
    const result = await implement(
      vi.fn().mockRejectedValue(new AIError('AI_PROVIDER_UNAVAILABLE', 'down')),
    );
    expect(result.implementations).toEqual({});
    expect(result.warnings[0]).toContain('no está disponible');
  });

  it('skips AI entirely when the plan has no custom endpoints', async () => {
    const generateStructured = vi.fn();
    const result = await new BusinessLogicService(
      prisma as never,
      { generateStructured } as never,
    ).implement('p', 'r', { ...plan, customEndpoints: [] }, CASEFLOW_WEB_TS_V1);
    expect(result).toEqual({ implementations: {}, warnings: [] });
    expect(generateStructured).not.toHaveBeenCalled();
  });
});
