import { describe, expect, it, vi } from 'vitest';
import { diagnosedMethods, applyMethodRepairs } from './method-repair';
import { AutoRepairService } from './auto-repair.service';

const path = 'apps/api/src/orders/orders-actions.service.ts';
const content = `import type { Input } from './input';
export class OrdersActionsService {
  async create(body: Input): Promise<string> {
    const date = body.date instanceof Date ? body.date : new Date(body.date);
    return date.toISOString();
  }
  async untouched(): Promise<string> { return 'KEEP_UNTOUCHED'; }
}
`;
const files = [{ path, content, kind: 'SOURCE' as const }];
const output = 'src/orders/orders-actions.service.ts(4,18): error TS2358: Invalid instanceof.';
const fixed = 'const date = new Date(body.date);\nreturn date.toISOString();';

describe('focused business method repair', () => {
  it('finds only the diagnosed method and preserves every byte outside its body', () => {
    const targets = diagnosedMethods(files, output)!;
    expect(targets).toHaveLength(1);
    expect(targets[0]).toMatchObject({
      path,
      className: 'OrdersActionsService',
      methodName: 'create',
    });
    const patches = applyMethodRepairs(files, targets, [
      { path, className: 'OrdersActionsService', methodName: 'create', body: fixed },
    ])!;
    expect(patches[0]!.content).toBe(
      content.slice(0, targets[0]!.start) + '\n' + fixed + '\n' + content.slice(targets[0]!.end),
    );
    expect(patches[0]!.content).toContain(
      "async untouched(): Promise<string> { return 'KEEP_UNTOUCHED'; }",
    );
  });
  it('refuses unrelated diagnostics and uses the legacy path when there is no method body', () => {
    expect(diagnosedMethods(files, 'unrelated')).toBeNull();
    expect(diagnosedMethods(files, output.replace('(4,18)', '(2,8)'))).toBeNull();
    expect(diagnosedMethods(files, output.replace('(4,18)', '(999,8)'))).toBeNull();
    expect(diagnosedMethods(files, output.replace('(4,18)', '(4,99999)'))).toBeNull();
    expect(
      diagnosedMethods(
        [{ ...files[0]!, path: 'apps/api/src/orders/resource.service.ts' }],
        output.replaceAll('orders-actions', 'resource'),
      ),
    ).toBeNull();
    expect(
      diagnosedMethods(files, output + '\nsrc/other.ts(1,1): error TS2304: Missing.'),
    ).toBeNull();
  });
  it('rejects patches outside the diagnosed method, duplicate patches, unsafe bodies and type suppression', () => {
    const targets = diagnosedMethods(files, output)!;
    const patch = { path, className: 'OrdersActionsService', methodName: 'create', body: fixed };
    for (const invalid of [
      { ...patch, methodName: 'untouched' },
      { ...patch, className: 'Other' },
      { ...patch, path: '../other.ts' },
      { ...patch, body: 'return process.env;' },
      { ...patch, body: 'throw new Error("No implementation");' },
      { ...patch, body: 'return body as any;' },
      { ...patch, body: '// @ts-ignore\nreturn body.date;' },
      { ...patch, body: '// eslint-disable\nreturn body.date;' },
      { ...patch, body: 'return "ok"; } export class Injected {} function extra() {' },
    ])
      expect(applyMethodRepairs(files, targets, [invalid])).toBeNull();
    expect(applyMethodRepairs(files, targets, [patch, patch])).toBeNull();
  });
  it('requests a method body with the versioned focused prompt and returns a hashed file patch', async () => {
    const generateStructured = vi.fn().mockResolvedValue({
      data: {
        explanation: 'Se conserva la fecha del contrato como texto.',
        methods: [{ path, className: 'OrdersActionsService', methodName: 'create', body: fixed }],
        findings: [],
      },
    });
    const service = new AutoRepairService(
      { project: { findUnique: vi.fn().mockResolvedValue({ language: 'ES' }) } } as never,
      { generateStructured } as never,
    );
    const result = await service.repair({
      projectId: 'project',
      failedStage: 'TYPECHECK',
      output,
      files,
      versionsByCode: new Map(),
    });
    expect(result.status).toBe('PATCHED');
    expect(result.patches[0]).toMatchObject({
      path,
      previousSha256: expect.any(String),
      sha256: expect.any(String),
    });
    expect(generateStructured.mock.calls[0]![0]).toMatchObject({
      promptKey: 'code-repair.generate',
      promptVersion: 2,
      maxOutputTokens: 8192,
    });
    expect(generateStructured.mock.calls[0]![0].messages[0].content).not.toContain(
      'KEEP_UNTOUCHED',
    );
    generateStructured.mockResolvedValueOnce({
      data: {
        explanation: 'x',
        methods: [
          { path, className: 'OrdersActionsService', methodName: 'untouched', body: fixed },
        ],
        findings: [],
      },
    });
    expect(
      (
        await service.repair({
          projectId: 'project',
          failedStage: 'TYPECHECK',
          output,
          files,
          versionsByCode: new Map(),
        })
      ).status,
    ).toBe('REJECTED');
  });
});
