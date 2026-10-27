import { describe, expect, it } from 'vitest';
import {
  implementationPlanContentSchema,
  uiBlueprintContentSchema,
  type UserManualResponse,
} from '@caseflow-ai/contracts';
import { extractText } from 'unpdf';
import { buildUserManual } from './user-manual-builder';
import { renderManualHtml, renderManualPdf } from './user-manual-renderer';

const id = '00000000-0000-4000-8000-000000000001';
const plan = implementationPlanContentSchema.parse({
  designBaselineId: id,
  authentication: { required: true, roles: ['Editor'] },
  modules: [{ localId: 'items', name: 'Items', description: 'Artículos' }],
  entities: [
    {
      localId: 'item',
      name: 'Item',
      moduleLocalId: 'items',
      fields: [{ name: 'name', type: 'STRING' }],
      operations: ['CREATE'],
      writeRoles: ['Editor'],
    },
  ],
  routes: [
    {
      path: '/items',
      screenName: 'Artículos',
      moduleLocalId: 'items',
      entityLocalId: 'item',
      screenLocalId: 'items',
      kind: 'LIST',
      actions: [{ label: 'Crear artículo', operation: 'CREATE' }],
    },
  ],
});
const blueprint = uiBlueprintContentSchema.parse({
  screens: [
    { localId: 'items', name: 'Artículos', purpose: 'Consultar y crear', forms: ['Nombre'] },
  ],
});
const content = buildUserManual(plan, blueprint, [{ id, path: 'apps/web/app/items/page.tsx' }]);
export const sampleManual: UserManualResponse = {
  id,
  code: 'MAN-001',
  snapshotId: id,
  isCurrent: true,
  version: { id, versionNumber: 1, status: 'GENERATED' },
  introduction: content.introduction,
  tasks: content.tasks.map((task) => ({ ...task, id })),
  history: [],
};

describe('visual user manual', () => {
  it('uses only implementation routes with a real source file and keeps review pending', () => {
    expect(content.tasks[0]).toMatchObject({
      generatedFileId: id,
      roles: ['Editor'],
      verified: false,
    });
    expect(content.tasks[0]!.steps.map((step) => step.instruction)).toContain(
      'Con uno de estos roles (Editor), seleccione «Crear artículo».',
    );
    expect(() => buildUserManual(plan, blueprint, [])).toThrow('source file');
    expect(() => buildUserManual({ ...plan, routes: [] }, null, [])).toThrow('user-facing');
    const readOnly = buildUserManual(
      { ...plan, routes: [{ ...plan.routes[0]!, path: '/', actions: [] }] },
      null,
      [{ id, path: 'apps/web/app/page.tsx' }],
    );
    expect(readOnly.tasks[0]!.steps).toHaveLength(2);
  });
  it('escapes all editable text and labels drafts and historical releases', () => {
    const html = renderManualHtml({
      ...sampleManual,
      isCurrent: false,
      introduction: '<script>alert(1)</script>',
    }).toString();
    expect(html).toContain('&lt;script&gt;');
    expect(html).not.toContain('<script>');
    expect(html).toContain('BORRADOR');
    expect(html).toContain('versión anterior');
    expect(html).toContain('Esquema del flujo');
    expect(html).toContain('Content-Security-Policy');
    expect(
      renderManualHtml({
        ...sampleManual,
        version: { ...sampleManual.version, status: 'APPROVED' },
      }).toString(),
    ).not.toContain('BORRADOR');
  });
  it('produces an actual readable PDF with a cover and numbered task guide', async () => {
    const pdf = await renderManualPdf(sampleManual);
    expect(pdf.subarray(0, 4).toString()).toBe('%PDF');
    const result = await extractText(new Uint8Array(pdf), { mergePages: true });
    expect(result.totalPages).toBe(2);
    expect(result.text).toContain('Crear artículo');
    expect(result.text).toContain('BORRADOR');
  });
  it('paginates long tasks without dropping instructions', async () => {
    const pdf = await renderManualPdf({
      ...sampleManual,
      isCurrent: false,
      version: { ...sampleManual.version, status: 'APPROVED' },
      tasks: [
        {
          ...sampleManual.tasks[0]!,
          steps: Array.from({ length: 12 }, (_, index) => ({
            instruction: `Paso ${index + 1}: ${'Revise la información. '.repeat(20)}`,
            expectedResult: 'Resultado comprobado en revisión.',
          })),
        },
      ],
    });
    const result = await extractText(new Uint8Array(pdf), { mergePages: true });
    expect(result.totalPages).toBeGreaterThan(2);
    expect(result.text).toContain('Paso 12:');
  });
});
