import { Inject, Injectable, UnprocessableEntityException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { AIOrchestrator } from '@caseflow-ai/ai';
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
    }[] = [];
    const output = files.map((item) => ({ ...item }));
    if (baseline.entries.some((item) => item.artifactVersion.projectId !== projectId))
      throw new UnprocessableEntityException('Las fuentes del diseño no pertenecen al proyecto.');
    const language = await getProjectLanguage(this.prisma, projectId);
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
      const loginRoute = plan.routes.find((item) =>
        item.actions.some((action) => action.endpoint === 'POST /auth/login'),
      );
      const loginPage =
        route.actions.some((action) => action.endpoint === 'POST /auth/logout') && loginRoute
          ? `apps/web/app${loginRoute.path}/page.tsx`
          : undefined;
      const bindings = {
        functionalPageSource: target.content,
        route,
        operationContext: plan.authentication.local?.scope ?? null,
        functionalComponents: output
          .filter(
            (item) =>
              item.path === 'apps/web/components/operation-context.tsx' || item.path === loginPage,
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
        sharedCapabilities: {
          serverSessionValidation: Boolean(plan.authentication.local),
          sessionExpiryRedirect: Boolean(plan.authentication.local),
          logoutRoute: plan.authentication.local
            ? (plan.routes.find((item) =>
                item.actions.some((action) => action.endpoint === 'POST /auth/logout'),
              )?.path ?? null)
            : null,
        },
        entity: plan.entities.find((item) => item.localId === route.entityLocalId) ?? null,
        endpoints: plan.customEndpoints.filter((endpoint) =>
          route.actions.some((action) => action.endpoint === `${endpoint.method} ${endpoint.path}`),
        ),
      };
      const cacheHash = hash(
        json({ version: 6, sourceHash, htmlHash: hash(html), screen, bindings, baselineId }),
      );
      const cachePath = `docs/presentations/${cacheHash}.json`;
      const cached = await this.prisma.generatedFile.findFirst({
        where: { path: cachePath, generationRun: { projectId, designBaselineId: baselineId } },
        select: { content: true },
      });
      let presentation;
      if (cached) {
        presentation = presentationSchema.parse(JSON.parse(cached.content));
        validatePresentation(presentation, sources);
      } else {
        const result = await this.ai.generateStructured({
          projectId,
          language,
          sourceArtifactVersionId: entry!.artifactVersionId,
          promptKey: 'frontend-design.generate',
          promptVersion: 6,
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
        presentation = presentationSchema.parse(result.data);
        if (presentation.limitations.length) {
          const findings = presentation.limitations
            .map((item) => `${item.code}: ${item.description}`)
            .join(' ');
          throw new UnprocessableEntityException(
            `La pantalla «${screen.name}» (${route.path}) necesita completar sus enlaces funcionales. ${findings}`,
          );
        }
        validatePresentation(presentation, sources);
      }
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
      });
    }
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
