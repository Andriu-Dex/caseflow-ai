import { Inject, Injectable, UnprocessableEntityException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { posix } from 'node:path';
import ts from 'typescript';
import { AIError, AIOrchestrator } from '@caseflow-ai/ai';
import { loadAIRoutes } from '@caseflow-ai/config';
import { uiBlueprintContentSchema, type ImplementationPlanContent } from '@caseflow-ai/contracts';
import type { StorageProvider } from '@caseflow-ai/integrations';
import { PrismaService } from '../database/prisma.service';
import { STORAGE_PROVIDER } from '../sources/storage-provider.token';
import { getProjectLanguage } from '../projects/project-language';
import {
  applyPresentation,
  presentationSchema,
  presentationSources,
  validatePresentation,
} from '../code-generation/engine/presentation';
import { applyPresentationShell } from '../code-generation/engine/presentation-shell';
import { file, json, type GeneratedProjectFile } from '../code-generation/engine/types';
import { kebabCase } from '../code-generation/naming';
import { actionMethodName } from '../code-generation/engine/backend.templates';

const FRONTEND_DESIGN_VERSION = 36;
const hash = (value: string | Buffer) => createHash('sha256').update(value).digest('hex');

@Injectable()
export class FrontendDesignService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ai: AIOrchestrator,
    @Inject(STORAGE_PROVIDER) private readonly storage: StorageProvider,
  ) {}

  async adapt(
    projectId: string,
    baselineId: string,
    plan: ImplementationPlanContent,
    files: GeneratedProjectFile[],
    projectName: string,
    themeToggle: boolean,
    generationRunId: string,
  ) {
    const run = await this.prisma.generationRun.findFirst({
      where: { id: generationRunId, projectId, designBaselineId: baselineId, status: 'GENERATING' },
      select: { id: true },
    });
    if (!run)
      throw new UnprocessableEntityException(
        'La corrida no pertenece al proyecto y diseño indicados o ya no está en generación.',
      );
    const baseline = await this.prisma.designBaseline.findFirst({
      where: { id: baselineId, projectId },
      include: {
        entries: {
          include: {
            artifactVersion: {
              include: {
                structuredAnalysisDetail: true,
                mockupDetail: { include: { screens: true } },
              },
            },
          },
        },
      },
    });
    if (!baseline)
      throw new UnprocessableEntityException('No se encontró el diseño aprobado del proyecto.');
    const entry = baseline.entries.find((item) => item.role === 'MOCKUP');
    const blueprintEntry = baseline.entries.find((item) => item.role === 'UI_BLUEPRINT');
    const mockup = entry?.artifactVersion.mockupDetail;
    const blueprint = uiBlueprintContentSchema.parse(
      blueprintEntry?.artifactVersion.structuredAnalysisDetail?.content,
    );
    if (!mockup || mockup.uiBlueprintVersionId !== blueprintEntry?.artifactVersionId)
      throw new UnprocessableEntityException(
        'El boceto y el plano congelados no corresponden al mismo diseño.',
      );
    if (
      entry?.artifactVersion.projectId !== projectId ||
      blueprintEntry?.artifactVersion.projectId !== projectId
    )
      throw new UnprocessableEntityException('Las fuentes del diseño no pertenecen al proyecto.');
    const records: {
      routePath: string;
      screenLocalId: string;
      mockupSha256: string | null;
      sourceSha256: string;
      outputSha256: string;
      navigation: string;
      presentation?: unknown;
      // The justified exception that let this screen through, if any.
      acceptedException?: { id: string; justification: string; findingsSha256: string };
    }[] = [];
    const output = files.map((item) => ({ ...item }));
    if (baseline.entries.some((item) => item.artifactVersion.projectId !== projectId))
      throw new UnprocessableEntityException('Las fuentes del diseño no pertenecen al proyecto.');
    const language = await getProjectLanguage(this.prisma, projectId);
    // Every screen is evaluated before failing, so one run reports all gaps;
    // accepted screens stay checkpointed for the next run.
    const incomplete: string[] = [];
    // Justified acceptances of exact findings (AGENTS.md §16), by route and hash.
    const exceptions = new Map(
      (
        await this.prisma.screenDesignException.findMany({
          where: { projectId, designBaselineId: baselineId },
          select: { id: true, routePath: true, findingsSha256: true, justification: true },
        })
      ).map((item) => [`${item.routePath}|${item.findingsSha256}`, item]),
    );
    for (const route of plan.routes) {
      const screen = blueprint.screens.find((item) => item.localId === route.screenLocalId);
      if (!screen)
        throw new UnprocessableEntityException(
          `La ruta ${route.path} no identifica una pantalla del plano aprobado.`,
        );
      const path = `apps/web/app${route.path === '/' ? '' : route.path}/page.tsx`;
      const target = output.find((item) => item.path === path);
      if (!target)
        throw new UnprocessableEntityException(`No se generó la pantalla ${route.path}.`);
      if (mockup.generatorKind === 'INTERNAL_WIREFRAME') {
        records.push({
          routePath: route.path,
          screenLocalId: screen.localId,
          mockupSha256: null,
          sourceSha256: hash(target.content),
          outputSha256: hash(target.content),
          navigation: 'SIDE',
        });
        continue;
      }
      const reference = mockup.screens.find((item) => item.screenLocalId === screen.localId);
      if (!reference || !reference.htmlStorageKey.startsWith(`mockups/${projectId}/`))
        throw new UnprocessableEntityException(
          `Falta el HTML aprobado de la pantalla ${screen.name}. No se sustituirá por una plantilla genérica.`,
        );
      const html = await this.storage.getObject(reference.htmlStorageKey);
      if (!html.length || html.length > 200_000)
        throw new UnprocessableEntityException(
          `El HTML de ${screen.name} no puede procesarse con seguridad.`,
        );
      const sourceHash = hash(target.content);
      const sources = presentationSources(target.content);
      const routeEntity = plan.entities.find((item) => item.localId === route.entityLocalId);
      const entityKebab = routeEntity ? kebabCase(routeEntity.name) : undefined;
      const loginRoute = plan.routes.find((item) =>
        item.actions.some((action) => action.endpoint === 'POST /auth/login'),
      );
      const loginPage =
        route.actions.some((action) => action.endpoint === 'POST /auth/logout') && loginRoute
          ? `apps/web/app${loginRoute.path}/page.tsx`
          : undefined;
      const importedComponents = sharedComponentImports(path, target.content);
      const usedEndpoints = plan.customEndpoints.filter(
        (endpoint) =>
          route.actions.some(
            (action) => action.endpoint === `${endpoint.method} ${endpoint.path}`,
          ) || route.contextQueries?.includes(`${endpoint.method} ${endpoint.path}`),
      );
      const bindings = {
        functionalPageSource: target.content,
        route,
        operationContext: plan.authentication.local?.scope ?? null,
        functionalComponents: output
          .filter(
            (item) =>
              item.path === 'apps/web/components/operation-context.tsx' ||
              importedComponents.has(item.path) ||
              (item.path === 'apps/web/components/action-form.tsx' &&
                target.content.includes('<ActionForm')) ||
              item.path === loginPage,
          )
          .map((item) => ({ path: item.path, source: item.content })),
        authenticationServices: route.actions.some(
          (action) =>
            action.endpoint?.startsWith('POST /auth/') || action.endpoint?.startsWith('GET /auth/'),
        )
          ? output
              .filter((item) =>
                [
                  'apps/api/src/auth/local-auth.service.ts',
                  'apps/api/src/auth/local-auth.controller.ts',
                ].includes(item.path),
              )
              .map((item) => ({ path: item.path, source: item.content }))
          : [],
        ...(route.entityLocalId
          ? {
              entityServices: output
                .filter((item) => {
                  return (
                    item.path.endsWith(`/${entityKebab}.service.ts`) ||
                    item.path.endsWith(`/${entityKebab}.controller.ts`)
                  );
                })
                .map((item) => ({ path: item.path, source: item.content })),
            }
          : {}),
        sharedCapabilities: {
          serverSessionValidation: Boolean(plan.authentication.local),
          sessionExpiryRedirect: Boolean(plan.authentication.local),
          logoutRoute: plan.authentication.local
            ? (plan.routes.find((item) =>
                item.actions.some((action) => action.endpoint === 'POST /auth/logout'),
              )?.path ?? null)
            : null,
          ...(route.kind === 'LIST'
            ? {
                deterministicListPagination: Boolean(routeEntity?.operations.includes('LIST')),
                queryParameterNormalization: Boolean(routeEntity?.operations.includes('LIST')),
              }
            : {}),
        },
        entity: routeEntity ?? null,
        endpoints: usedEndpoints,
        // The server side of each action the screen calls, so its behavior is
        // judged from the code rather than reported as missing evidence.
        endpointImplementations: usedEndpoints.flatMap((endpoint) =>
          serverMethods(output, actionMethodName(endpoint)).map((method) => ({
            endpoint: `${endpoint.method} ${endpoint.path}`,
            ...method,
          })),
        ),
      };
      const cacheHash = hash(
        json({
          version: FRONTEND_DESIGN_VERSION,
          evaluator: screenEvaluator(process.env),
          sourceHash,
          htmlHash: hash(html),
          screen,
          bindings,
          baselineId,
        }),
      );
      const cachePath = `docs/presentations/${cacheHash}.json`;
      const cached = await this.prisma.generatedFile.findFirst({
        where: { path: cachePath, generationRun: { projectId, designBaselineId: baselineId } },
        select: { content: true },
      });
      // An evaluation with findings is kept under the same inputs hash: the
      // findings survive an interrupted run and are not paid for twice.
      const findingsPath = `docs/presentation-findings/${cacheHash}.json`;
      const reported = cached
        ? null
        : await this.prisma.generatedFile.findFirst({
            where: {
              path: findingsPath,
              generationRun: { projectId, designBaselineId: baselineId },
            },
            select: { content: true },
          });
      const report = (findings: string) =>
        incomplete.push(
          `La pantalla «${screen.name}» (${route.path}) necesita completar sus enlaces funcionales. ${findings}`,
        );
      // Findings a person accepted with a justification let the proposed
      // layout through; without a valid proposed layout the screen keeps its
      // functional page. Findings nobody accepted are reported.
      const excepted = (findings: string, proposal: unknown) => {
        const exception = exceptions.get(`${route.path}|${hash(findings)}`);
        if (!exception) return undefined;
        try {
          const accepted = presentationSchema.parse({ ...(proposal as object), limitations: [] });
          validatePresentation(accepted, sources);
          return { presentation: accepted as typeof accepted | undefined, exception };
        } catch {
          return { presentation: undefined, exception };
        }
      };
      let presentation;
      let acceptedException:
        { id: string; justification: string; findingsSha256: string } | undefined;
      if (reported) {
        // Reused findings are recorded in this run too, so the current
        // findings of a design are those of its latest run.
        await this.prisma.generatedFile.upsert({
          where: { generationRunId_path: { generationRunId, path: findingsPath } },
          update: {},
          create: {
            generationRunId,
            path: findingsPath,
            content: reported.content,
            kind: 'DOCUMENTATION',
            origin: 'AI_ASSISTED',
            sha256: hash(reported.content),
          },
        });
        const stored = JSON.parse(reported.content) as { findings: string; presentation?: unknown };
        const accepted = excepted(stored.findings, stored.presentation);
        if (!accepted) {
          report(stored.findings);
          continue;
        }
        ({ presentation, exception: acceptedException } = accepted);
      } else if (cached) {
        presentation = presentationSchema.parse(JSON.parse(cached.content));
        validatePresentation(presentation, sources);
      } else {
        // A provider failure leaves only this screen unevaluated (and unkept):
        // the run still fails at the end, and the next one asks again.
        let result;
        try {
          result = await this.ai.generateStructured({
            projectId,
            language,
            sourceArtifactVersionId: entry!.artifactVersionId,
            promptKey: 'frontend-design.generate',
            promptVersion: FRONTEND_DESIGN_VERSION,
            messages: [
              {
                role: 'user',
                content: json({ screen, bindings, sources, referenceHtml: html.toString('utf8') }),
              },
            ],
            outputSchema: presentationSchema,
            schemaName: 'frontend_presentation',
            maxOutputTokens: 8192,
          });
        } catch (error) {
          if (!(error instanceof AIError)) throw error;
          report(`NOT_EVALUATED: ${error.message}`);
          continue;
        }
        presentation = presentationSchema.parse(result.data);
        if (presentation.limitations.length) {
          const findings = presentation.limitations
            .map((item) => `${item.code}: ${item.description}`)
            .join(' ');
          const content = json({
            routePath: route.path,
            findings,
            evaluator: screenEvaluator(process.env),
            presentation,
          });
          await this.prisma.generatedFile.upsert({
            where: { generationRunId_path: { generationRunId, path: findingsPath } },
            update: {},
            create: {
              generationRunId,
              path: findingsPath,
              content,
              kind: 'DOCUMENTATION',
              origin: 'AI_ASSISTED',
              sha256: hash(content),
            },
          });
          const accepted = excepted(findings, presentation);
          if (!accepted) {
            report(findings);
            continue;
          }
          ({ presentation, exception: acceptedException } = accepted);
        }
        // An invalid proposal fails only its screen and is not kept, so the
        // next run asks again instead of stopping every other screen.
        try {
          if (!acceptedException) validatePresentation(presentation!, sources);
        } catch (error) {
          report(
            `INVALID_PRESENTATION: ${error instanceof Error ? error.message : 'La propuesta no es válida.'}`,
          );
          continue;
        }
      }
      if (acceptedException && !presentation) {
        records.push({
          routePath: route.path,
          screenLocalId: screen.localId,
          mockupSha256: hash(html),
          sourceSha256: sourceHash,
          outputSha256: hash(target.content),
          navigation: 'SIDE',
          acceptedException,
        });
        continue;
      }
      // Only an excepted screen without a valid layout lacks one; it left above.
      presentation = presentation!;
      if (!acceptedException) {
        const checkpoint = file(cachePath, json(presentation), {
          kind: 'DOCUMENTATION',
          origin: 'AI_ASSISTED',
          planElements: [
            `route:${route.path}`,
            `design-source:${entry!.artifactVersionId}`,
            `design-source:${blueprintEntry!.artifactVersionId}`,
          ],
        });
        await this.prisma.generatedFile.upsert({
          where: { generationRunId_path: { generationRunId, path: cachePath } },
          update: {},
          create: {
            generationRunId,
            path: checkpoint.path,
            content: checkpoint.content,
            kind: checkpoint.kind,
            origin: checkpoint.origin,
            sha256: hash(checkpoint.content),
          },
        });
        output.push(checkpoint);
      }
      target.content = applyPresentation(target.content, presentation);
      target.origin = 'AI_ASSISTED';
      target.planElements = [
        ...target.planElements,
        `design-source:${entry!.artifactVersionId}`,
        `design-source:${blueprintEntry!.artifactVersionId}`,
      ];
      records.push({
        routePath: route.path,
        screenLocalId: screen.localId,
        mockupSha256: hash(html),
        sourceSha256: sourceHash,
        outputSha256: hash(target.content),
        navigation: presentation.navigation,
        presentation,
        ...(acceptedException ? { acceptedException } : {}),
      });
    }
    if (incomplete.length)
      throw new UnprocessableEntityException(
        `${incomplete.length === 1 ? 'Una pantalla necesita' : `${incomplete.length} pantallas necesitan`} completar sus enlaces funcionales.\n${incomplete.join('\n')}`,
      );
    applyPresentationShell(output, records, projectName, themeToggle);
    output.push(
      file(
        'docs/design-fidelity.json',
        json({
          schemaVersion: 1,
          baselineId,
          mockupVersionId: entry!.artifactVersionId,
          blueprintVersionId: blueprintEntry!.artifactVersionId,
          scope: 'STRUCTURAL_PRESENTATION',
          visualReviewRequired: true,
          assets: output
            .filter(
              (item) =>
                item.path === 'apps/web/app/layout.tsx' ||
                item.path === 'apps/web/app/globals.css' ||
                item.path.startsWith('apps/web/components/'),
            )
            .map((item) => ({ path: item.path, sha256: hash(item.content) })),
          records,
        }),
        {
          kind: 'DOCUMENTATION',
          origin: 'DETERMINISTIC',
          planElements: [
            `design-source:${entry!.artifactVersionId}`,
            `design-source:${blueprintEntry!.artifactVersionId}`,
          ],
        },
      ),
    );
    return { files: output, records };
  }
}

// Shared (non-primitive) web components a page imports by relative path.
export function sharedComponentImports(pagePath: string, source: string): Set<string> {
  const found = new Set<string>();
  for (const match of source.matchAll(/from '(\.{1,2}\/[^']+)'/g)) {
    const resolved = posix.normalize(posix.join(posix.dirname(pagePath), match[1]!));
    if (resolved.startsWith('apps/web/components/') && !resolved.includes('/ui/'))
      found.add(`${resolved}.tsx`);
  }
  return found;
}

// Methods with this name in the generated API sources (service and controller).
export function serverMethods(
  files: readonly { path: string; content: string }[],
  name: string,
): { path: string; source: string }[] {
  const methods: { path: string; source: string }[] = [];
  for (const item of files) {
    if (!item.path.startsWith('apps/api/src/') || !item.path.endsWith('.ts')) continue;
    if (item.path.endsWith('.spec.ts') || !item.content.includes(name)) continue;
    const sourceFile = ts.createSourceFile(item.path, item.content, ts.ScriptTarget.Latest, true);
    const visit = (node: ts.Node) => {
      if (ts.isMethodDeclaration(node) && node.name.getText(sourceFile) === name)
        methods.push({ path: item.path, source: node.getText(sourceFile) });
      ts.forEachChild(node, visit);
    };
    visit(sourceFile);
  }
  return methods;
}

// Who judges the screens. Part of the checkpoint key, so a verdict from a
// development model (AI_ROUTE_FRONTEND_PRESENTATION) is never reused once the
// default model evaluates.
export function screenEvaluator(environment: NodeJS.ProcessEnv): string {
  const route = loadAIRoutes(environment).get('frontend_presentation');
  return route
    ? `${route.id}:${route.model}`
    : `${environment.AI_PROVIDER ?? 'disabled'}:${environment.AI_MODEL ?? ''}`;
}
