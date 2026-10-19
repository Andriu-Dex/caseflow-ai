import { Injectable, Logger } from '@nestjs/common';
import ts from 'typescript';
import { z } from 'zod';
import { AIError, AIOrchestrator } from '@caseflow-ai/ai';
import { findCatalogDependency, type TargetTemplateVersion } from '@caseflow-ai/domain';
import type { ImplementationPlanContent } from '@caseflow-ai/contracts';
import { PrismaService } from '../database/prisma.service';
import { getProjectLanguage } from '../projects/project-language';
import { lowerFirst } from '../code-generation/naming';
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
export function reviewBusinessLogic(body: string): BusinessLogicReview {
  const invalid = syntaxError(body);
  if (invalid)
    return { accepted: false, reason: `no es código TypeScript válido (${invalid})`, packages: [] };
  const packages = [...body.matchAll(IMPORT)].map((m) => packageName(m[1] ?? m[2]!));
  if (packages.length)
    return { accepted: false, reason: 'importa paquetes', packages: [...new Set(packages)] };
  const forbidden = FORBIDDEN.find(({ pattern }) => pattern.test(body));
  if (forbidden) return { accepted: false, reason: forbidden.reason, packages: [] };
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
  ): Promise<{ implementations: EndpointImplementations; warnings: string[] }> {
    const warnings: string[] = [];
    if (!plan.customEndpoints.length) return { implementations: {}, warnings };
    const language = await getProjectLanguage(this.prisma, projectId);
    const implementations: EndpointImplementations = {};
    for (const endpoint of plan.customEndpoints) {
      const module = plan.modules.find((m) => m.localId === endpoint.moduleLocalId)!;
      const params = [...endpoint.path.matchAll(/:([a-zA-Z0-9]+)/g)].map((m) => m[1]!);
      const hasBody = ['POST', 'PATCH', 'PUT'].includes(endpoint.method);
      const context = {
        action: {
          summary: endpoint.summary,
          method: endpoint.method,
          path: endpoint.path,
          methodName: actionMethodName(endpoint),
          parameters: [
            ...params.map((p) => ({ name: p, type: 'string (path parameter)' })),
            ...(hasBody ? [{ name: 'body', type: 'Record<string, unknown> (request body)' }] : []),
          ],
          mainEntity: plan.entities.find((e) => e.localId === endpoint.entityLocalId)?.name ?? null,
        },
        module: { name: module.name, description: module.description },
        prismaDelegates: plan.entities.map((e) => ({
          delegate: `this.prisma.${lowerFirst(e.name)}`,
          model: e.name,
          fields: [
            'id',
            ...e.fields.map(
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
      try {
        const result = await this.ai.generateStructured({
          projectId,
          language,
          promptKey: 'business-logic.generate',
          promptVersion: 3,
          messages: [{ role: 'user', content: JSON.stringify(context) }],
          outputSchema: businessLogicOutputSchema,
          schemaName: 'business_logic_generation',
          // The schema's length limit cuts an answer where it falls, so both
          // leave room for a long action.
          maxOutputTokens: 8192,
        });
        const review = reviewBusinessLogic(result.data.body);
        if (review.accepted) {
          implementations[endpointKey(endpoint)] = result.data.body;
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
    return { implementations, warnings };
  }
}
