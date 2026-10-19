import { describe, expect, it, vi } from 'vitest';
import { AIError } from '@caseflow-ai/ai';
import { CASEFLOW_WEB_TS_V1 } from '@caseflow-ai/domain';
import { implementationPlanContentSchema } from '@caseflow-ai/contracts';
import {
  BusinessLogicService,
  reviewBusinessLogic,
  unimplementedWarning,
} from './business-logic.service';

describe('reviewBusinessLogic', () => {
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
        fields: [{ name: 'total', type: 'DECIMAL' }],
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
  const prisma = { project: { findUnique: vi.fn().mockResolvedValue({ language: 'ES' }) } };
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

  it('keeps the 501 stub and warns when the proposal is rejected', async () => {
    const result = await implement(
      vi.fn().mockResolvedValue({ data: { body: 'return process.env;' } }),
    );
    expect(result.implementations).toEqual({});
    expect(result.warnings).toEqual([expect.stringContaining('Confirmar pedido')]);
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
