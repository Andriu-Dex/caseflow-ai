import {
  ForbiddenException,
  Injectable,
  Optional,
  UnprocessableEntityException,
} from '@nestjs/common';
import { PIPELINE_LABELS, PIPELINE_ORDER, type ReadinessStage } from '@caseflow-ai/contracts';
import { StageCurrencyService } from './stage-currency';
import { AuditService } from '../audit/audit.service';
import { ConsistencyEngineService } from '../consistency-engine/consistency-engine.service';
import { PrismaService } from '../database/prisma.service';
import { FirstDeliverableSnapshotService } from '../first-deliverable/first-deliverable-snapshot.service';
import { RequirementsService } from '../requirements/requirements.service';
import { contextCoverage } from '../requirements/context-coverage';
import { StalenessService } from '../staleness/staleness.service';
import { TraceabilityService } from '../traceability/traceability.service';

const USE_CASE_MINIMUM = 4;

function stage(
  partial: Omit<ReadinessStage, 'blockers' | 'warnings' | 'nextAction'> & {
    blockers?: string[];
    warnings?: string[];
    nextAction?: string | null;
  },
): ReadinessStage {
  return {
    blockers: [],
    warnings: [],
    nextAction: null,
    ...partial,
  };
}

@Injectable()
export class ReadinessService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly requirements: RequirementsService,
    private readonly staleness: StalenessService,
    private readonly traceability: TraceabilityService,
    private readonly snapshot: FirstDeliverableSnapshotService,
    @Optional() private readonly currency?: StageCurrencyService,
    @Optional() private readonly audit?: AuditService,
    @Optional() private readonly consistency?: ConsistencyEngineService,
  ) {}

  // Read-only deterministic evaluation of persisted authoritative state
  // (spec Phase G): never creates, approves or mutates anything. Authoritative
  // version selection is delegated to FirstDeliverableSnapshotService — the
  // single shared "current authoritative version" policy also used by Export
  // (spec Phase H), never duplicated here.
  async evaluate(projectId: string, applyCurrency = true) {
    const [
      sources,
      context,
      requirementsStage,
      useCasesResult,
      dataModelResult,
      navResult,
      swResult,
      sysResult,
      blueprintResult,
      themeResult,
      classDiagramResult,
      project,
    ] = await Promise.all([
      this.sourcesStage(projectId),
      this.contextStage(projectId),
      this.requirementsStage(projectId),
      this.useCasesStage(projectId),
      this.snapshot.approvedArtifactVersion(projectId, 'DATA_MODEL'),
      this.snapshot.approvedArtifactVersion(projectId, 'NAVIGATION_TREE'),
      this.snapshot.approvedArtifactVersion(projectId, 'SOFTWARE_ARCHITECTURE'),
      this.snapshot.approvedArtifactVersion(projectId, 'SYSTEM_ARCHITECTURE'),
      this.snapshot.approvedArtifactVersion(projectId, 'UI_BLUEPRINT'),
      this.snapshot.approvedArtifactVersion(projectId, 'DESIGN_THEME'),
      this.snapshot.approvedArtifactVersion(projectId, 'CLASS_DIAGRAM'),
      this.prisma.project.findUnique({
        where: { id: projectId },
        select: { designThemeRequired: true, coherenceRequired: true },
      }),
    ]);

    const useCaseDiagramStage = await this.useCaseDiagramStage(
      projectId,
      useCasesResult.approvedVersionIds,
    );
    const dataModelStage = this.singleArtifactStage(
      'DATA_MODEL',
      'Modelo de datos',
      dataModelResult,
    );
    const erDiagramStage = await this.erDiagramStage(dataModelResult);
    const classDiagramStage = this.classDiagramStage(
      project?.coherenceRequired ?? true,
      classDiagramResult,
    );
    const navigationStage = await this.diagramBackedStage('NAVIGATION', 'Navegación', navResult);
    const softwareArchitectureStage = await this.diagramBackedStage(
      'SOFTWARE_ARCHITECTURE',
      'Arquitectura de software',
      swResult,
    );
    const systemArchitectureStage = await this.diagramBackedStage(
      'SYSTEM_ARCHITECTURE',
      'Arquitectura de sistema',
      sysResult,
    );
    const uiBlueprintStage = this.singleArtifactStage(
      'UI_BLUEPRINT',
      'Plano de interfaz',
      blueprintResult,
    );
    const themeRequired = project?.designThemeRequired ?? true;
    const designThemeStage = this.designThemeStage(themeRequired, themeResult);
    const mockupsStage = await this.mockupsStage(
      projectId,
      blueprintResult,
      themeRequired && !themeResult ? undefined : themeResult,
    );
    const impactStage = await this.impactStage(projectId);

    const stages: ReadinessStage[] = [
      sources,
      context,
      requirementsStage,
      useCasesResult.stage,
      useCaseDiagramStage,
      dataModelStage,
      erDiagramStage,
      classDiagramStage,
      navigationStage,
      softwareArchitectureStage,
      systemArchitectureStage,
      uiBlueprintStage,
      designThemeStage,
      mockupsStage,
      impactStage,
    ];

    const currencies =
      this.currency && applyCurrency ? await this.currency.stageCurrency(projectId) : undefined;
    if (
      currencies?.CONTEXT.currency === 'CURRENT' &&
      currencies.CONTEXT.reviewedAt &&
      !impactStage.satisfied
    ) {
      impactStage.satisfied = true;
      impactStage.warnings.push(...impactStage.blockers);
      impactStage.blockers = [];
      impactStage.nextAction = null;
      impactStage.summary =
        'El contexto fue revisado y confirmado vigente; se conserva la procedencia histórica.';
    }
    for (const item of stages) {
      const current = item.key !== 'IMPACT' ? currencies?.[item.key] : undefined;
      Object.assign(item, current ?? { currency: 'CURRENT' });
      if (current && current.currency !== 'CURRENT') {
        item.satisfied = false;
        const upstream =
          stages.find((s) => s.key === current.outdatedSince?.stage)?.label ??
          current.outdatedSince?.stage;
        item.blockers = [`Cambió ${upstream}. Rehaga este paso o confirme que sigue vigente.`];
        item.nextAction =
          current.currency === 'OUTDATED'
            ? 'Rehacer este paso o confirmar que sigue vigente.'
            : 'Revisar primero el paso anterior pendiente.';
      }
    }
    const blockers = stages.flatMap((s) => s.blockers);
    const warnings = stages.flatMap((s) => s.warnings);
    const ready = stages.every((s) => s.satisfied);

    return { ready, stages, blockers, warnings };
  }

  async confirmCurrent(
    projectId: string,
    stageKey: (typeof PIPELINE_ORDER)[number],
    userId: string,
    note?: string,
  ) {
    if (!this.currency)
      throw new UnprocessableEntityException('La revisión de vigencia no está disponible.');
    const base = (await this.evaluate(projectId, false)).stages.find(
      (stage) => stage.key === stageKey,
    );
    const typeByStage: Record<string, string> = {
      SOURCES: 'PROJECT_SOURCE',
      CONTEXT: 'PROJECT_CONTEXT',
      REQUIREMENTS: 'REQUIREMENT',
      USE_CASES: 'USE_CASE',
      DATA_MODEL: 'DATA_MODEL',
      NAVIGATION: 'NAVIGATION_TREE',
      MOCKUPS: 'MOCKUP',
    };
    const issues = this.consistency
      ? (await this.consistency.generateReport(projectId)).issues
      : [];
    const errors = issues.filter(
      (issue) =>
        issue.severity === 'ERROR' && issue.artifactType === (typeByStage[stageKey] ?? stageKey),
    );
    if (errors.length)
      throw new UnprocessableEntityException(
        `Corrija la coherencia de este paso antes de confirmar: ${errors[0]!.message}`,
      );
    await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM projects WHERE id = ${projectId}::uuid FOR UPDATE`;
      const membership = await tx.projectMembership.findFirst({
        where: {
          projectId,
          userId,
          role: { in: ['OWNER', 'EDITOR', 'REVIEWER'] },
          project: { workspace: { memberships: { some: { userId } } } },
        },
      });
      if (!membership) throw new ForbiddenException('No tiene permiso para confirmar este paso.');
      const currencies = await this.currency!.stageCurrency(projectId, tx);
      const current = currencies[stageKey];
      if (current.currency === 'BLOCKED') {
        const first = PIPELINE_ORDER.find((key) => currencies[key].currency === 'OUTDATED');
        throw new UnprocessableEntityException(
          `Primero revise ${first ? PIPELINE_LABELS[first] : 'el paso anterior'}.`,
        );
      }
      if (current.currency !== 'OUTDATED')
        throw new UnprocessableEntityException('Este paso no está pendiente de revisión.');
      if (!base?.satisfied)
        throw new UnprocessableEntityException(
          base?.blockers[0] ?? 'Complete este paso antes de confirmar su vigencia.',
        );
      const confirmation = await tx.stageConfirmation.create({
        data: { projectId, stage: stageKey, confirmedByUserId: userId, note },
      });
      await (this.audit ?? new AuditService(this.prisma)).record(
        {
          projectId,
          actorUserId: userId,
          action: 'STAGE_CONFIRMED_CURRENT',
          entityType: 'STAGE_CONFIRMATION',
          entityId: confirmation.id,
          metadata: {
            stage: stageKey,
            upstreamStage: current.outdatedSince?.stage ?? null,
            note: note ?? null,
          },
        },
        tx,
      );
    });
    return {
      projectId,
      generatedAt: new Date().toISOString(),
      ...(await this.evaluate(projectId)),
    };
  }

  private async sourcesStage(projectId: string): Promise<ReadinessStage> {
    const artifacts = await this.prisma.artifact.findMany({
      where: { projectId, artifactTypeCode: 'PROJECT_SOURCE', archivedAt: null },
      include: { versions: { orderBy: { versionNumber: 'desc' }, take: 1 } },
    });
    const total = artifacts.length;
    const approved = artifacts.filter((a) => a.versions[0]?.status === 'APPROVED').length;
    const pending = total - approved;
    const satisfied = approved >= 1;
    return stage({
      key: 'SOURCES',
      label: 'Fuentes del proyecto',
      satisfied,
      summary: satisfied
        ? `${approved} de ${total} ${total === 1 ? 'fuente aprobada' : 'fuentes aprobadas'}.`
        : 'Aún no hay fuentes aprobadas.',
      counts: { total, approved, pending },
      blockers: satisfied ? [] : ['Apruebe al menos una fuente del proyecto.'],
      nextAction: satisfied ? null : 'Aprobar al menos una fuente del proyecto.',
    });
  }

  private async contextStage(projectId: string): Promise<ReadinessStage> {
    const artifact = await this.prisma.artifact.findFirst({
      where: { projectId, artifactTypeCode: 'PROJECT_CONTEXT' },
      include: {
        versions: {
          where: { status: 'APPROVED' },
          orderBy: { versionNumber: 'desc' },
          take: 1,
          include: { projectContextDetail: { include: { sources: true } } },
        },
      },
    });
    const version = artifact?.versions[0];
    const sourceBacked = (version?.projectContextDetail?.sources.length ?? 0) > 0;
    const satisfied = Boolean(version) && sourceBacked;
    const blockers: string[] = [];
    if (!version) blockers.push('Falta aprobar el contexto del proyecto.');
    else if (!sourceBacked)
      blockers.push('El contexto aprobado no está respaldado por ninguna fuente aprobada.');
    return stage({
      key: 'CONTEXT',
      label: 'Contexto del proyecto',
      satisfied,
      summary: satisfied
        ? `Contexto ${artifact!.code} (versión ${version!.versionNumber}) aprobado y respaldado por fuentes.`
        : 'El contexto del proyecto aún no está aprobado ni respaldado por fuentes.',
      evidence: version ? { artifactVersionId: version.id, code: artifact!.code } : undefined,
      blockers,
      nextAction: satisfied
        ? null
        : 'Aprobar el contexto del proyecto vinculándolo a fuentes aprobadas.',
    });
  }

  private async requirementsStage(projectId: string): Promise<ReadinessStage> {
    const approved = await this.prisma.artifactVersion.findMany({
      where: {
        projectId,
        status: 'APPROVED',
        artifact: { artifactTypeCode: 'REQUIREMENT', archivedAt: null },
      },
      distinct: ['artifactId'],
      orderBy: [{ artifactId: 'asc' }, { versionNumber: 'desc' }],
      include: { requirementDetail: true },
    });
    const rf = approved.filter((v) => v.requirementDetail?.requirementType === 'FUNCTIONAL').length;
    const rnf = approved.filter(
      (v) => v.requirementDetail?.requirementType === 'NON_FUNCTIONAL',
    ).length;
    const quality = approved.length ? await this.requirements.qualityReport(projectId) : null;
    // DEC-126: every need and business rule of the approved context must be
    // answered by an approved requirement; it blocks only where coherence is
    // mandatory.
    const [covered, project] = await Promise.all([
      contextCoverage(this.prisma, projectId, { approvedOnly: true }),
      this.prisma.project.findUnique({
        where: { id: projectId },
        select: { coherenceRequired: true },
      }),
    ]);
    const mandatory = covered.items.filter((item) => item.mandatory);
    const uncovered = mandatory.filter((item) => !item.coveredBy.length);
    const coverageMessages = uncovered.map(
      (item) =>
        `${item.code} «${item.description}» del contexto no está cubierto por ningún requisito aprobado.`,
    );
    const strict = project?.coherenceRequired ?? true;
    const blockers = [
      ...(approved.length ? [] : ['Apruebe al menos un requisito.']),
      ...(strict ? coverageMessages : []),
    ];
    const satisfied = blockers.length === 0;
    return stage({
      key: 'REQUIREMENTS',
      label: 'Requisitos',
      satisfied,
      summary: approved.length
        ? `${approved.length} ${approved.length === 1 ? 'requisito aprobado' : 'requisitos aprobados'} (${rf} funcionales, ${rnf} no funcionales)${
            mandatory.length
              ? `; cubren ${mandatory.length - uncovered.length} de ${mandatory.length} necesidades y reglas del contexto`
              : ''
          }.`
        : 'Aún no hay requisitos aprobados.',
      counts: {
        approved: approved.length,
        functional: rf,
        nonFunctional: rnf,
        contextItemsCovered: mandatory.length - uncovered.length,
        contextItemsTotal: mandatory.length,
      },
      blockers,
      // Quality findings are advisory (spec §4.3): they never block readiness.
      warnings: [
        ...(strict ? [] : coverageMessages),
        ...(quality?.issues.map((i) => `${i.code}: ${i.message}`) ?? []),
      ],
      nextAction: !approved.length
        ? 'Aprobar al menos un requisito.'
        : uncovered.length && strict
          ? 'Cubrir con requisitos aprobados las necesidades y reglas pendientes del contexto.'
          : null,
    });
  }

  private async useCasesStage(
    projectId: string,
  ): Promise<{ stage: ReadinessStage; approvedVersionIds: string[] }> {
    const approved = await this.prisma.artifactVersion.findMany({
      where: {
        projectId,
        status: 'APPROVED',
        artifact: { artifactTypeCode: 'USE_CASE', archivedAt: null },
      },
      distinct: ['artifactId'],
      orderBy: [{ artifactId: 'asc' }, { versionNumber: 'desc' }],
    });
    const satisfied = approved.length >= USE_CASE_MINIMUM;
    return {
      approvedVersionIds: approved.map((v) => v.id),
      stage: stage({
        key: 'USE_CASES',
        label: 'Casos de uso',
        satisfied,
        summary: `${approved.length} ${approved.length === 1 ? 'caso de uso aprobado' : 'casos de uso aprobados'}.`,
        counts: { approved: approved.length, minimumRequired: USE_CASE_MINIMUM },
        blockers: satisfied
          ? []
          : [
              `Se necesitan al menos ${USE_CASE_MINIMUM} casos de uso aprobados (hay ${approved.length}).`,
            ],
        nextAction: satisfied ? null : `Aprobar casos de uso hasta llegar a ${USE_CASE_MINIMUM}.`,
      }),
    };
  }

  // Use Case Diagram is a deterministic SYSTEM_GENERATED artifact with no
  // approval capability of its own (spec §6.3/established policy): existence
  // plus relevant sourcing to the currently-approved Use Cases is what
  // satisfies this stage, not an APPROVED status that the artifact can never
  // reach.
  private async useCaseDiagramStage(
    projectId: string,
    approvedUseCaseVersionIds: string[],
  ): Promise<ReadinessStage> {
    if (!approvedUseCaseVersionIds.length)
      return stage({
        key: 'USE_CASE_DIAGRAM',
        label: 'Diagrama de casos de uso',
        satisfied: false,
        summary: 'Aún no hay casos de uso aprobados para representar en el diagrama.',
        blockers: ['Apruebe casos de uso para poder generar su diagrama.'],
        nextAction: 'Aprobar casos de uso antes de generar el diagrama.',
      });
    const diagrams = await this.prisma.artifact.findMany({
      where: { projectId, artifactTypeCode: 'USE_CASE_DIAGRAM', archivedAt: null },
      include: {
        versions: {
          orderBy: { versionNumber: 'desc' },
          take: 1,
          include: { diagramDetail: { include: { sources: true } } },
        },
      },
      orderBy: { code: 'asc' },
    });
    const match = diagrams.find((d) => {
      const represented = new Set(
        d.versions[0]?.diagramDetail?.sources.map((s) => s.sourceArtifactVersionId) ?? [],
      );
      return approvedUseCaseVersionIds.every((id) => represented.has(id));
    });
    const satisfied = Boolean(match);
    return stage({
      key: 'USE_CASE_DIAGRAM',
      label: 'Diagrama de casos de uso',
      satisfied,
      summary: satisfied
        ? `Diagrama ${match!.code} generado a partir de los casos de uso aprobados.`
        : 'Aún no se ha generado el diagrama con los casos de uso aprobados actuales.',
      evidence: match ? { artifactVersionId: match.versions[0]!.id, code: match.code } : undefined,
      blockers: satisfied
        ? []
        : ['Genere el diagrama de casos de uso desde la página de Casos de uso.'],
      nextAction: satisfied ? null : 'Generar el diagrama de casos de uso.',
    });
  }

  private singleArtifactStage(
    key: 'DATA_MODEL' | 'UI_BLUEPRINT' | 'DESIGN_THEME' | 'CLASS_DIAGRAM',
    label: string,
    result: { code: string; versionId: string } | null,
  ): ReadinessStage {
    const satisfied = Boolean(result);
    return stage({
      key,
      label,
      satisfied,
      summary: satisfied
        ? `${result!.code} está aprobado.`
        : `Aún no hay ${label.toLowerCase()} aprobado.`,
      evidence: result ? { artifactVersionId: result.versionId, code: result.code } : undefined,
      blockers: satisfied ? [] : [`Falta aprobar: ${label.toLowerCase()}.`],
      nextAction: satisfied ? null : `Aprobar ${label.toLowerCase()}.`,
    });
  }

  // DEC-118: required for projects created after the theme step existed;
  // older projects keep the standard design unless they approve a theme.
  private designThemeStage(
    required: boolean,
    theme: { code: string; versionId: string } | null,
  ): ReadinessStage {
    if (!theme && !required)
      return stage({
        key: 'DESIGN_THEME',
        label: 'Tema y colores',
        satisfied: true,
        summary: 'Este proyecto usa el diseño estándar de CASEFlow.',
      });
    return this.singleArtifactStage('DESIGN_THEME', 'Tema y colores', theme);
  }

  // DEC-121: required for projects created with mandatory coherence; older
  // projects may skip it.
  private classDiagramStage(
    required: boolean,
    classDiagram: { code: string; versionId: string } | null,
  ): ReadinessStage {
    if (!classDiagram && !required)
      return stage({
        key: 'CLASS_DIAGRAM',
        label: 'Diagrama de clases',
        satisfied: true,
        summary: 'El diagrama de clases es opcional en este proyecto.',
      });
    return this.singleArtifactStage('CLASS_DIAGRAM', 'Diagrama de clases', classDiagram);
  }

  private async erDiagramStage(
    dataModel: { code: string; versionId: string } | null,
  ): Promise<ReadinessStage> {
    if (!dataModel)
      return stage({
        key: 'ER_DIAGRAM',
        label: 'Diagrama ER',
        satisfied: false,
        summary:
          'Aún no hay un modelo de datos aprobado para generar el diagrama entidad-relación.',
        blockers: ['Apruebe un modelo de datos para obtener su diagrama entidad-relación.'],
        nextAction: 'Aprobar un modelo de datos.',
      });
    const detail = await this.prisma.diagramDetail.findUnique({
      where: { artifactVersionId: dataModel.versionId },
    });
    const satisfied = Boolean(detail);
    return stage({
      key: 'ER_DIAGRAM',
      label: 'Diagrama ER',
      satisfied,
      summary: satisfied
        ? `Diagrama entidad-relación disponible para ${dataModel.code}.`
        : `${dataModel.code} está aprobado pero aún no tiene diagrama entidad-relación.`,
      evidence: satisfied
        ? { artifactVersionId: dataModel.versionId, code: dataModel.code }
        : undefined,
      blockers: satisfied
        ? []
        : ['El modelo de datos aprobado aún no tiene diagrama entidad-relación.'],
      nextAction: satisfied
        ? null
        : 'Generar el diagrama entidad-relación del modelo de datos aprobado.',
    });
  }

  private async diagramBackedStage(
    key: 'NAVIGATION' | 'SOFTWARE_ARCHITECTURE' | 'SYSTEM_ARCHITECTURE',
    label: string,
    result: { code: string; versionId: string } | null,
  ): Promise<ReadinessStage> {
    if (!result)
      return stage({
        key,
        label,
        satisfied: false,
        summary: `Aún no hay ${label.toLowerCase()} aprobada.`,
        blockers: [`Falta aprobar: ${label.toLowerCase()}.`],
        nextAction: `Aprobar ${label.toLowerCase()}.`,
      });
    const detail = await this.prisma.diagramDetail.findUnique({
      where: { artifactVersionId: result.versionId },
    });
    const satisfied = Boolean(detail);
    return stage({
      key,
      label,
      satisfied,
      summary: satisfied
        ? `${result.code} está aprobado y tiene su diagrama.`
        : `${result.code} está aprobado pero aún no tiene diagrama.`,
      evidence: { artifactVersionId: result.versionId, code: result.code },
      blockers: satisfied ? [] : [`${label} aprobada aún no tiene diagrama.`],
      nextAction: satisfied ? null : `Generar el diagrama de ${label.toLowerCase()}.`,
    });
  }

  private async mockupsStage(
    projectId: string,
    blueprint: { code: string; versionId: string } | null,
    // undefined: a required theme is still missing; null: standard design.
    theme: { code: string; versionId: string } | null | undefined,
  ): Promise<ReadinessStage> {
    if (blueprint && theme === undefined)
      return stage({
        key: 'MOCKUPS',
        label: 'Bocetos',
        satisfied: false,
        summary: 'Aún no hay un tema aprobado con el que pintar los bocetos.',
        blockers: ['Apruebe el tema y los colores antes de generar los bocetos.'],
        nextAction: 'Aprobar el tema y los colores.',
      });
    if (!blueprint)
      return stage({
        key: 'MOCKUPS',
        label: 'Bocetos',
        satisfied: false,
        summary: 'Aún no hay un plano de interfaz aprobado para generar bocetos.',
        blockers: ['Apruebe un plano de interfaz para poder generar sus bocetos.'],
        nextAction: 'Aprobar un plano de interfaz.',
      });
    const mockups = await this.prisma.artifact.findMany({
      where: { projectId, artifactTypeCode: 'MOCKUP', archivedAt: null },
      include: {
        versions: {
          where: { status: 'APPROVED' },
          orderBy: { versionNumber: 'desc' },
          take: 1,
          include: { mockupDetail: true },
        },
      },
    });
    const themeVersionId = theme?.versionId ?? null;
    const match = mockups.find(
      (m) =>
        m.versions[0]?.mockupDetail?.uiBlueprintVersionId === blueprint.versionId &&
        (m.versions[0].mockupDetail.designThemeVersionId ?? null) === themeVersionId,
    );
    const satisfied = Boolean(match);
    return stage({
      key: 'MOCKUPS',
      label: 'Bocetos',
      satisfied,
      summary: satisfied
        ? `${match!.code} aprobado, derivado exactamente de ${blueprint.code}.`
        : theme
          ? `Falta aprobar un boceto generado a partir del plano de interfaz ${blueprint.code} y el tema ${theme.code} vigentes.`
          : `Falta aprobar un boceto generado a partir del plano de interfaz ${blueprint.code} vigente.`,
      evidence: match ? { artifactVersionId: match.versions[0]!.id, code: match.code } : undefined,
      blockers: satisfied
        ? []
        : ['Apruebe un boceto generado a partir del plano de interfaz aprobado vigente.'],
      nextAction: satisfied ? null : 'Generar y aprobar el boceto del plano de interfaz aprobado.',
    });
  }

  private async impactStage(projectId: string): Promise<ReadinessStage> {
    const { entries } = await this.staleness.analyzeProject(projectId);
    const contextEntry = entries.find((e) => e.artifactType === 'PROJECT_CONTEXT');
    const directlyStale = contextEntry?.impactState === 'NEWER_APPROVED_KNOWLEDGE_AVAILABLE';
    const affected = entries.filter((e) => e.impactState === 'POTENTIALLY_AFFECTED');

    // Extend to further downstream artifacts using the traceability graph
    // (spec: "use Phase F graph topology"), without claiming semantic impact.
    let downstreamWarnings: string[] = [];
    if (affected.length) {
      const { edges, nodes } = await this.traceability.buildGraph(projectId);
      const seeds = new Set(affected.map((a) => a.artifactVersionId));
      const frontier = new Set(seeds);
      const reached = new Set<string>();
      for (let hop = 0; hop < 5; hop++) {
        const next = new Set<string>();
        for (const edge of edges)
          if (frontier.has(edge.fromId) && !seeds.has(edge.toId) && !reached.has(edge.toId)) {
            next.add(edge.toId);
            reached.add(edge.toId);
          }
        if (!next.size) break;
        frontier.clear();
        for (const id of next) frontier.add(id);
      }
      downstreamWarnings = [...reached].map((id) => {
        const node = nodes.find((n) => n.id === id);
        return `${node?.code ?? id} depende de artefactos potencialmente desactualizados: se recomienda revisarlo.`;
      });
    }

    const warnings = [
      ...affected.map(
        (a) =>
          `${a.code} (v${a.versionNumber}) podría estar desactualizado: se recomienda revisarlo.`,
      ),
      ...downstreamWarnings,
    ];
    const satisfied = !directlyStale;
    return stage({
      key: 'IMPACT',
      label: 'Impacto potencial',
      satisfied,
      summary: directlyStale
        ? 'Hay fuentes aprobadas más recientes que el contexto del proyecto todavía no incluye.'
        : affected.length
          ? 'Sin bloqueo directo; existen artefactos potencialmente afectados que requieren revisión.'
          : 'Sin advertencias de impacto potencial pendientes.',
      counts: { potentiallyAffected: affected.length },
      blockers: directlyStale
        ? ['Actualice el contexto del proyecto para incluir las fuentes aprobadas más recientes.']
        : [],
      warnings,
      nextAction: directlyStale
        ? 'Actualizar y volver a aprobar el Contexto del Proyecto con el conocimiento de fuente más reciente.'
        : null,
    });
  }
}
