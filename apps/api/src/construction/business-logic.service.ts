import { Injectable, Logger, UnprocessableEntityException } from '@nestjs/common';
import ts from 'typescript';
import { hasOnlyThrowingPaths } from './business-flow';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import { AIError, AIOrchestrator } from '@caseflow-ai/ai';
import { findCatalogDependency, type TargetTemplateVersion } from '@caseflow-ai/domain';
import type { ImplementationPlanContent } from '@caseflow-ai/contracts';
import { PrismaService } from '../database/prisma.service';
import { getProjectLanguage } from '../projects/project-language';
import { lowerFirst } from '../code-generation/naming';
import { loadFrozenBusinessContext } from './frozen-business-context';
import { file, json, type GeneratedProjectFile } from '../code-generation/engine/types';
import {
  HTTP_EXCEPTIONS,
  actionMethodName,
  endpointKey,
  type EndpointImplementations,
} from '../code-generation/engine/backend.templates';

const logger = new Logger('BusinessLogicService');

const businessLogicOutputSchema = z.object({ body: z.string().trim().min(1).max(20_000) }).strict();

// What an AI-written body may never do: bring in code (DEC-100: no new
// dependencies through the back door) or reach outside the request's data.
const FORBIDDEN = [
  { pattern: /\bprocess\b/, reason: 'accede a process' },
  { pattern: /\b(eval|Function)\s*\(/, reason: 'evalúa código dinámico' },
  { pattern: /\bglobalThis\b|\bglobal\./, reason: 'accede al ámbito global' },
  { pattern: /\bfetch\s*\(|\bXMLHttpRequest\b/, reason: 'hace llamadas de red' },
  { pattern: /\$queryRaw|\$executeRaw/, reason: 'usa SQL crudo' },
  { pattern: /\bchild_process\b|\bfs\b\.|\bnode:/, reason: 'accede al sistema' },
];
const IMPORT =
  /\bimport\s*(?:[\s\S]*?\bfrom\s*)?['"]([^'"]+)['"]|\brequire\s*\(\s*['"]([^'"]+)['"]\s*\)/g;

const packageName = (specifier: string) =>
  specifier.startsWith('@') ? specifier.split('/').slice(0, 2).join('/') : specifier.split('/')[0]!;

export type BusinessLogicReview =
  { accepted: true } | { accepted: false; reason: string; packages: string[] };

// Whether the body parses as the inside of an async TypeScript method: an
// answer cut off by the token limit, or otherwise malformed, breaks the whole
// generated project at lint time, so it is caught here instead.
export function syntaxError(body: string): string | null {
  const { diagnostics = [] } = ts.transpileModule(
    `async function body() {
${body}
}
`,
    {
      reportDiagnostics: true,
      compilerOptions: { target: ts.ScriptTarget.ES2022 },
    },
  );
  const first = diagnostics[0];
  return first ? ts.flattenDiagnosticMessageText(first.messageText, ' ') : null;
}

// Pure check of one AI-proposed method body.
export function reviewBusinessLogic(
  body: string,
  internalFields: readonly string[] = [],
): BusinessLogicReview {
  const source = ts.createSourceFile('body.ts', body, ts.ScriptTarget.Latest, true);
  let touchesInternal = false;
  let bypassesBoundary = false;
  const visit = (node: ts.Node) => {
    if ((ts.isIdentifier(node) || ts.isStringLiteral(node)) && internalFields.includes(node.text))
      touchesInternal = true;
    if (
      ts.isCallExpression(node) &&
      (node.expression.kind === ts.SyntaxKind.ImportKeyword ||
        (ts.isIdentifier(node.expression) && node.expression.text === 'require'))
    )
      bypassesBoundary = true;
    if (ts.isPropertyAccessExpression(node) || ts.isElementAccessExpression(node)) {
      const property = ts.isPropertyAccessExpression(node)
        ? node.name.text
        : node.argumentExpression && ts.isStringLiteral(node.argumentExpression)
          ? node.argumentExpression.text
          : '';
      if (
        ['constructor', 'prototype', '__proto__'].includes(property) ||
        (property.startsWith('$') && property !== '$transaction') ||
        (property.startsWith('_') && !['_sum', '_avg', '_min', '_max', '_count'].includes(property))
      )
        bypassesBoundary = true;
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  if (touchesInternal)
    return { accepted: false, reason: 'accede a un campo interno de credenciales', packages: [] };
  const invalid = syntaxError(body);
  if (invalid)
    return { accepted: false, reason: `no es código TypeScript válido (${invalid})`, packages: [] };
  const packages = [...body.matchAll(IMPORT)].map((m) => packageName(m[1] ?? m[2]!));
  if (packages.length)
    return { accepted: false, reason: 'importa paquetes', packages: [...new Set(packages)] };
  const forbidden = FORBIDDEN.find(({ pattern }) => pattern.test(body));
  if (forbidden) return { accepted: false, reason: forbidden.reason, packages: [] };
  if (hasOnlyThrowingPaths(source.statements))
    return {
      accepted: false,
      reason: 'rechaza todos los casos sin implementar un flujo correcto',
      packages: [],
    };
  if (bypassesBoundary)
    return {
      accepted: false,
      reason: 'intenta eludir los límites de ejecución o persistencia',
      packages: [],
    };
  return { accepted: true };
}

// Explains why an action kept its 501 stub. A package outside the catalog is
// never added (DEC-100): a person proposes it, with an exact version, or
// implements the action.
export function unimplementedWarning(
  action: string,
  review: Extract<BusinessLogicReview, { accepted: false }>,
  template: TargetTemplateVersion,
): string {
  const outside = review.packages.filter((name) => !findCatalogDependency(template, name));
  if (outside.length)
    return `La acción «${action}» quedó sin implementar (responde 501): la propuesta requería ${outside.map((n) => `«${n}»`).join(', ')}, fuera del catálogo aprobado. Solicite la dependencia en «Dependencias» o implemente la acción.`;
  return `La acción «${action}» quedó sin implementar (responde 501): la propuesta se descartó porque ${review.reason}.`;
}

// AI assistance only where interpretation is needed (AGENTS.md §18): the body
// of business actions beyond CRUD. Everything else stays deterministic. The
// output is untrusted — it is reviewed here, and it only ever runs inside the
// validation sandbox; a rejected or unavailable proposal leaves the honest
// 501 stub in place.
@Injectable()
export class BusinessLogicService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ai: AIOrchestrator,
  ) {}

  async implement(
    projectId: string,
    generationRunId: string,
    plan: ImplementationPlanContent,
    template: TargetTemplateVersion,
  ): Promise<{
    implementations: EndpointImplementations;
    warnings: string[];
    checkpoints?: GeneratedProjectFile[];
  }> {
    const warnings: string[] = [];
    if (!plan.customEndpoints.length) return { implementations: {}, warnings };
    const language = await getProjectLanguage(this.prisma, projectId);
    if (
      template.version >= 2 &&
      !(await this.prisma.generationRun.findFirst({
        where: {
          id: generationRunId,
          projectId,
          designBaselineId: plan.designBaselineId,
          status: 'GENERATING',
        },
        select: { id: true },
      }))
    )
      throw new UnprocessableEntityException(
        'La corrida no pertenece al proyecto y diseño indicados o ya no está en generación.',
      );
    const frozenContext =
      template.version >= 2
        ? await loadFrozenBusinessContext(this.prisma, projectId, plan.designBaselineId)
        : undefined;
    const implementations: EndpointImplementations = {};
    const checkpoints: GeneratedProjectFile[] = [];
    for (const endpoint of plan.customEndpoints.filter(
      (item) => !item.builtin && !item.disabledReason,
    )) {
      const promptVersion = endpoint.contract
        ? 6
        : plan.authentication.local?.scope
          ? 5
          : plan.authentication.local
            ? 4
            : 3;
      const module = plan.modules.find((m) => m.localId === endpoint.moduleLocalId)!;
      const params = [...endpoint.path.matchAll(/:([a-zA-Z0-9]+)/g)].map((m) => m[1]!);
      const hasBody = ['POST', 'PATCH', 'PUT'].includes(endpoint.method);
      const context = {
        ...(frozenContext ? { approvedContext: frozenContext(endpoint, plan) } : {}),
        action: {
          ...(endpoint.rules ? { rules: endpoint.rules } : {}),
          ...(endpoint.contract ? { contract: endpoint.contract } : {}),
          roles: endpoint.roles,
          ...(plan.authentication.local?.scope
            ? { scopeAccess: endpoint.scopeAccess ?? 'SELECTED', dataAccess: endpoint.dataAccess }
            : {}),
          summary: endpoint.summary,
          method: endpoint.method,
          path: endpoint.path,
          methodName: actionMethodName(endpoint),
          parameters: [
            ...params.map((p) => ({ name: p, type: 'string (path parameter)' })),
            ...(hasBody
              ? [
                  {
                    name: 'body',
                    type: endpoint.contract?.body
                      ? 'Validated input matching action.contract.body'
                      : 'Record<string, unknown> (request body)',
                  },
                ]
              : []),
            ...(endpoint.contract?.query
              ? [{ name: 'query', type: 'Validated filters matching action.contract.query' }]
              : []),
            ...(plan.authentication.local
              ? [
                  {
                    name: 'actor',
                    type: plan.authentication.local.scope
                      ? '{ userId: string; sessionId: string; roles: string[]; selectedScopeId?: string; scopeIds: string[]; permissions: string[] } (immutable verified server context)'
                      : '{ userId: string; sessionId: string; roles: string[] } (verified server session)',
                  },
                ]
              : []),
          ],
          mainEntity: plan.entities.find((e) => e.localId === endpoint.entityLocalId)?.name ?? null,
        },
        module: { name: module.name, description: module.description },
        prismaDelegates: plan.entities
          .filter(
            (entity) =>
              !plan.authentication.local?.scope ||
              endpoint.dataAccess?.some((access) => access.entityLocalId === entity.localId),
          )
          .map((e) => ({
            delegate: `this.prisma.${lowerFirst(e.name)}`,
            model: e.name,
            ...(e.uniqueConstraints ? { uniqueConstraints: e.uniqueConstraints } : {}),
            fields: [
              'id',
              ...e.fields
                .filter((field) => !field.internal)
                .map(
                  // An optional field may be null: said so, the body checks it
                  // instead of failing the generated project's typecheck.
                  (f) =>
                    `${f.name}: ${f.type}${f.type === 'ENUM' ? ` (${f.enumValues.join('|')})` : ''}${f.required ? '' : ' | null'}`,
                ),
              ...e.relations.map((r) =>
                r.kind === 'MANY_TO_MANY'
                  ? `${r.name}: relation[]`
                  : `${r.name}Id: string${r.required ? '' : ' | null'}`,
              ),
            ],
          })),
        availableExceptions: HTTP_EXCEPTIONS,
      };
      const internalFields = plan.entities.flatMap((entity) =>
        entity.fields.filter((field) => field.internal).map((field) => field.name),
      );
      const checkpointPath = `docs/business-logic/${createHash('sha256')
        .update(
          json({
            templateVersion: template.version,
            promptVersion,
            context,
          }),
        )
        .digest('hex')}.json`;
      try {
        const cached =
          template.version >= 2
            ? await this.prisma.generatedFile.findFirst({
                where: {
                  path: checkpointPath,
                  generationRun: { projectId, designBaselineId: plan.designBaselineId },
                },
                select: { content: true },
              })
            : null;
        const result = cached
          ? { data: businessLogicOutputSchema.parse(JSON.parse(cached.content)) }
          : await this.ai.generateStructured({
              projectId,
              language,
              promptKey: 'business-logic.generate',
              promptVersion,
              messages: [{ role: 'user', content: JSON.stringify(context) }],
              outputSchema: businessLogicOutputSchema,
              schemaName: 'business_logic_generation',
              // The schema's length limit cuts an answer where it falls, so both
              // leave room for a long action.
              maxOutputTokens: 8192,
            });
        const review = reviewBusinessLogic(result.data.body, internalFields);
        if (review.accepted) {
          implementations[endpointKey(endpoint)] = result.data.body;
          if (template.version >= 2) {
            const checkpoint = file(checkpointPath, json({ body: result.data.body }), {
              kind: 'DOCUMENTATION',
              origin: 'AI_ASSISTED',
              planElements: [`endpoint:${endpointKey(endpoint)}`],
            });
            await this.prisma.generatedFile.upsert({
              where: { generationRunId_path: { generationRunId, path: checkpointPath } },
              update: {},
              create: {
                generationRunId,
                path: checkpoint.path,
                content: checkpoint.content,
                origin: checkpoint.origin,
                kind: checkpoint.kind,
                sha256: createHash('sha256').update(checkpoint.content).digest('hex'),
              },
            });
            checkpoints.push(checkpoint);
          }
          continue;
        }
        logger.warn(
          `Business logic for "${endpointKey(endpoint)}" (run ${generationRunId}) rejected: ${review.reason}.`,
        );
        warnings.push(unimplementedWarning(endpoint.summary, review, template));
      } catch (error) {
        // Graceful degradation (AGENTS.md §56): no AI, no invented logic.
        if (!(error instanceof AIError)) throw error;
        logger.warn(
          `Business logic for "${endpointKey(endpoint)}" not generated: ${error.message}`,
        );
        warnings.push(
          `La acción «${endpoint.summary}» quedó sin implementar (responde 501): el servicio de IA no está disponible.`,
        );
      }
    }
    return template.version >= 2
      ? { implementations, warnings, checkpoints }
      : { implementations, warnings };
  }
}
