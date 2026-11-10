import { describe, expect, it } from 'vitest';
import ts from 'typescript';
import { implementationPlanContentSchema } from '@caseflow-ai/contracts';
import { CASEFLOW_WEB_TS_V1 } from '@caseflow-ai/domain';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const rawPlan: unknown = JSON.parse(
  readFileSync(
    resolve(__dirname, '../../../../../tests/fixtures/construction/lifecycle-plan.json'),
    'utf8',
  ),
);
const clonePlan = () => implementationPlanContentSchema.parse(rawPlan);
import { generateProject } from './project-generator';

const generate = (raw: unknown = rawPlan) =>
  generateProject({
    plan: implementationPlanContentSchema.parse(raw),
    template: CASEFLOW_WEB_TS_V1,
    projectName: 'Revision registry',
    slug: 'revision-registry',
  });

describe('explicit lifecycle generation', () => {
  it('rejects unknown lifecycle states and managed fields', () => {
    for (const lifecycle of [
      { stateField: 'missing', initialState: 'DRAFT', immutableStates: ['FINAL'] },
      { stateField: 'state', initialState: 'FINAL', immutableStates: ['FINAL'] },
      { stateField: 'state', initialState: 'DRAFT', immutableStates: ['UNKNOWN'] },
      {
        stateField: 'state',
        initialState: 'DRAFT',
        immutableStates: ['FINAL'],
        managedFields: ['missing'],
      },
    ]) {
      const plan = clonePlan();
      Object.assign(plan.entities[0]!, { lifecycle });
      expect(implementationPlanContentSchema.safeParse(plan).success).toBe(false);
    }
  });

  it('requires an explicit lifecycle owner for composition', () => {
    const plan = clonePlan();
    plan.entities[1]!.compositionOwnerRelation = 'missing';
    expect(implementationPlanContentSchema.safeParse(plan).success).toBe(false);
  });

  it('never synthesizes restaurant policies or independent component writes', () => {
    const files = generate();
    for (const file of files.filter(
      (item) => item.path.endsWith('.tsx') || item.path.endsWith('.service.ts'),
    )) {
      expect(file.content).not.toMatch(
        /MenuVersion|OperationalParameter|PUBLICADA|BORRADOR|\/checkout|Dictamen: APROBADO/,
      );
    }
    const form = files.find((item) => item.path === 'apps/web/app/revisions/new/page.tsx')!.content;
    expect(form).not.toContain('api.updateRevisionEntry');
    expect(form).toContain('.omit({"state":true})');
    expect(form).toContain('api.createRevision(payload');
    const imports = ts
      .createSourceFile('page.tsx', form, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
      .statements.filter(ts.isImportDeclaration);
    const names = imports.flatMap((entry) =>
      entry.importClause?.namedBindings && ts.isNamedImports(entry.importClause.namedBindings)
        ? entry.importClause.namedBindings.elements.map((item) => item.name.text)
        : [],
    );
    expect(new Set(names).size).toBe(names.length);
  });

  it('emits valid TypeScript for both owner and component protections', () => {
    const files = generate();
    for (const file of files.filter(
      (item) => /\.(ts|tsx)$/.test(item.path) && !item.path.endsWith('.d.ts'),
    )) {
      const result = ts.transpileModule(file.content, {
        fileName: file.path,
        reportDiagnostics: true,
        compilerOptions: { jsx: ts.JsxEmit.Preserve, experimentalDecorators: true },
      });
      expect(
        result.diagnostics?.filter((item) => item.category === ts.DiagnosticCategory.Error),
        file.path,
      ).toEqual([]);
    }
    const service = files.find((item) => item.path.endsWith('/revision-entry.service.ts'))!.content;
    expect(service).toContain("isolationLevel: 'Serializable'");
    expect(service).toContain('FOR UPDATE');
    expect(service).toContain("this.mutate('CREATE'");
    expect(service).toContain("this.mutate('UPDATE'");
    expect(service).toContain("this.mutate('DELETE'");
  });

  it('does not infer immutability from unrelated foreign key references', () => {
    const plan = clonePlan();
    delete plan.entities[1]!.compositionOwnerRelation;
    const service = generate(plan).find((item) =>
      item.path.endsWith('/revision-entry.service.ts'),
    )!.content;
    expect(service).not.toContain('private async mutate');
  });

  it('refuses historical version plans lacking lifecycle metadata', () => {
    const plan = clonePlan();
    delete plan.entities[0]!.lifecycle;
    delete plan.entities[1]!.compositionOwnerRelation;
    plan.entities[0]!.fields.push({
      name: 'versionLabel',
      type: 'STRING',
      required: true,
      unique: false,
      enumValues: [],
    });
    expect(() => generate(plan)).toThrow('ciclo de vida explícito');
  });

  it('refuses publication implemented through generic CRUD', () => {
    const plan = clonePlan();
    plan.routes[1]!.path = '/revisions/[revisionId]/publish';
    plan.routes[1]!.actions![0]!.operation = 'UPDATE';
    expect(() => generate(plan)).toThrow('endpoint de dominio explícito');
  });

  it('uses the domain operation without adding an unrelated CRUD form', () => {
    const plan = clonePlan();
    const endpoint = 'POST /revisions/:revisionId/finalize';
    const files = generate({
      ...plan,
      customEndpoints: [
        {
          moduleLocalId: 'records',
          entityLocalId: 'revision',
          method: 'POST',
          path: '/revisions/:revisionId/finalize',
          summary: 'Finalizar revisión',
        },
      ],
      routes: [
        {
          ...plan.routes[1],
          path: '/revisions/[revisionId]/publish',
          actions: [{ label: 'Finalizar', endpoint }],
        },
      ],
    });
    const page = files.find((item) => item.path.endsWith('/publish/page.tsx'))!.content;
    expect(page).toContain('api.postRevisionsFinalize({ revisionId: revisionId }, {})');
    expect(page).not.toContain('api.createRevision');
    expect(page).not.toContain('handleSubmit');
  });

  it('preserves contextual identifiers when navigating to a record', () => {
    const plan = clonePlan();
    const files = generate({
      ...plan,
      routes: [
        { ...plan.routes[0], path: '/workspaces/[workspaceId]/revisions' },
        {
          ...plan.routes[0],
          kind: 'DETAIL',
          path: '/workspaces/[workspaceId]/revisions/[revisionId]',
        },
      ],
    });
    const list = files.find(
      (item) => item.path === 'apps/web/app/workspaces/[workspaceId]/revisions/page.tsx',
    )!.content;
    expect(list).toContain('/workspaces/${workspaceId}/revisions/${row.id}');
    expect(list).not.toContain('/workspaces/${row.id}');
    const detail = files.find((item) => item.path.endsWith('/[revisionId]/page.tsx'))!.content;
    expect(detail).toContain('api.getRevision(revisionId)');
  });
});
