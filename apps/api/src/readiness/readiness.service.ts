import { Injectable } from '@nestjs/common';
import type { ReadinessStage } from '@caseflow-ai/contracts';
import { PrismaService } from '../database/prisma.service';
import { FirstDeliverableSnapshotService } from '../first-deliverable/first-deliverable-snapshot.service';
import { RequirementsService } from '../requirements/requirements.service';
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
  ) {}

  // Read-only deterministic evaluation of persisted authoritative state
  // (spec Phase G): never creates, approves or mutates anything. Authoritative
  // version selection is delegated to FirstDeliverableSnapshotService — the
  // single shared "current authoritative version" policy also used by Export
  // (spec Phase H), never duplicated here.
  async evaluate(projectId: string) {
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
      'UI Blueprint',
      blueprintResult,
    );
    const mockupsStage = await this.mockupsStage(projectId, blueprintResult);
    const impactStage = await this.impactStage(projectId);

    const stages: ReadinessStage[] = [
      sources,
      context,
      requirementsStage,
      useCasesResult.stage,
      useCaseDiagramStage,
      dataModelStage,
      erDiagramStage,
      navigationStage,
      softwareArchitectureStage,
      systemArchitectureStage,
      uiBlueprintStage,
      mockupsStage,
      impactStage,
    ];

    const blockers = stages.flatMap((s) => s.blockers);
    const warnings = stages.flatMap((s) => s.warnings);
    const ready = stages.every((s) => s.satisfied);

    return { ready, stages, blockers, warnings };
  }

  private async sourcesStage(projectId: string): Promise<ReadinessStage> {
    const artifacts = await this.prisma.artifact.findMany({
      where: { projectId, artifactTypeCode: 'PROJECT_SOURCE' },
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
        ? `${approved} fuente(s) aprobada(s) de ${total}.`
        : 'No hay fuentes de proyecto aprobadas.',
      counts: { total, approved, pending },
      blockers: satisfied ? [] : ['Se requiere al menos una fuente de proyecto APPROVED.'],
      nextAction: satisfied ? null : 'Aprobar al menos una fuente de conocimiento del proyecto.',
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
    if (!version) blockers.push('Se requiere un Contexto de Proyecto APPROVED.');
    else if (!sourceBacked)
      blockers.push(
        'El Contexto de Proyecto APPROVED no está respaldado por ninguna fuente APPROVED.',
      );
    return stage({
      key: 'CONTEXT',
      label: 'Contexto del proyecto',
      satisfied,
      summary: satisfied
        ? `Contexto ${artifact!.code} v${version!.versionNumber} respaldado por fuentes aprobadas.`
        : 'No hay un Contexto de Proyecto oficial (aprobado y respaldado por fuentes).',
      evidence: version ? { artifactVersionId: version.id, code: artifact!.code } : undefined,
      blockers,
      nextAction: satisfied
        ? null
        : 'Aprobar el Contexto del Proyecto respaldado por fuentes APPROVED.',
    });
  }

  private async requirementsStage(projectId: string): Promise<ReadinessStage> {
    const approved = await this.prisma.artifactVersion.findMany({
      where: { projectId, status: 'APPROVED', artifact: { artifactTypeCode: 'REQUIREMENT' } },
      include: { requirementDetail: true },
    });
    const rf = approved.filter((v) => v.requirementDetail?.requirementType === 'FUNCTIONAL').length;
    const rnf = approved.filter(
      (v) => v.requirementDetail?.requirementType === 'NON_FUNCTIONAL',
    ).length;
    const satisfied = approved.length >= 1;
    const quality = satisfied ? await this.requirements.qualityReport(projectId) : null;
    return stage({
      key: 'REQUIREMENTS',
      label: 'Requisitos',
      satisfied,
      summary: satisfied
        ? `${approved.length} requisito(s) aprobado(s) (RF ${rf}, RNF ${rnf}).`
        : 'No hay requisitos aprobados.',
      counts: { approved: approved.length, functional: rf, nonFunctional: rnf },
      blockers: satisfied ? [] : ['Se requiere al menos un Requisito APPROVED.'],
      // Quality findings are advisory (spec §4.3): they never block readiness.
      warnings: quality?.issues.map((i) => `${i.code}: ${i.message}`) ?? [],
      nextAction: satisfied ? null : 'Aprobar al menos un Requisito.',
    });
  }

  private async useCasesStage(
    projectId: string,
  ): Promise<{ stage: ReadinessStage; approvedVersionIds: string[] }> {
    const approved = await this.prisma.artifactVersion.findMany({
      where: { projectId, status: 'APPROVED', artifact: { artifactTypeCode: 'USE_CASE' } },
    });
    const satisfied = approved.length >= USE_CASE_MINIMUM;
    return {
      approvedVersionIds: approved.map((v) => v.id),
      stage: stage({
        key: 'USE_CASES',
        label: 'Casos de uso',
        satisfied,
        summary: `${approved.length} caso(s) de uso aprobado(s) (mínimo académico ${USE_CASE_MINIMUM}).`,
        counts: { approved: approved.length, minimumRequired: USE_CASE_MINIMUM },
        blockers: satisfied
          ? []
          : [
              `Se requieren al menos ${USE_CASE_MINIMUM} Casos de Uso APPROVED (hay ${approved.length}).`,
            ],
        nextAction: satisfied
          ? null
          : 'Aprobar más Casos de Uso hasta alcanzar el mínimo académico.',
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
        summary: 'No hay Casos de Uso aprobados para representar en un diagrama.',
        blockers: ['El diagrama de casos de uso requiere Casos de Uso APPROVED.'],
        nextAction: 'Aprobar Casos de Uso antes de generar el diagrama.',
      });
    const diagrams = await this.prisma.artifact.findMany({
      where: { projectId, artifactTypeCode: 'USE_CASE_DIAGRAM' },
      include: {
        versions: {
          orderBy: { versionNumber: 'desc' },
          take: 1,
          include: { diagramDetail: { include: { sources: true } } },
        },
      },
      orderBy: { code: 'asc' },
    });
    const match = diagrams.find((d) =>
      d.versions[0]?.diagramDetail?.sources.some((s) =>
        approvedUseCaseVersionIds.includes(s.sourceArtifactVersionId),
      ),
    );
    const satisfied = Boolean(match);
    return stage({
      key: 'USE_CASE_DIAGRAM',
      label: 'Diagrama de casos de uso',
      satisfied,
      summary: satisfied
        ? `Diagrama ${match!.code} generado a partir de Casos de Uso aprobados.`
        : 'No existe un diagrama de casos de uso generado a partir de Casos de Uso aprobados vigentes.',
      evidence: match ? { artifactVersionId: match.versions[0]!.id, code: match.code } : undefined,
      blockers: satisfied
        ? []
        : [
            'Se requiere un diagrama de casos de uso derivado de los Casos de Uso APPROVED vigentes.',
          ],
      nextAction: satisfied ? null : 'Generar el diagrama de casos de uso.',
    });
  }

  private singleArtifactStage(
    key: 'DATA_MODEL' | 'UI_BLUEPRINT',
    label: string,
    result: { code: string; versionId: string } | null,
  ): ReadinessStage {
    const satisfied = Boolean(result);
    return stage({
      key,
      label,
      satisfied,
      summary: satisfied ? `${result!.code} está APPROVED.` : `No hay ${label} APPROVED.`,
      evidence: result ? { artifactVersionId: result.versionId, code: result.code } : undefined,
      blockers: satisfied ? [] : [`Se requiere un ${label} APPROVED.`],
      nextAction: satisfied ? null : `Aprobar un ${label}.`,
    });
  }

  private async erDiagramStage(
    dataModel: { code: string; versionId: string } | null,
  ): Promise<ReadinessStage> {
    if (!dataModel)
      return stage({
        key: 'ER_DIAGRAM',
        label: 'Diagrama ER',
        satisfied: false,
        summary: 'No hay Modelo de Datos aprobado del cual derivar el diagrama ER.',
        blockers: ['El diagrama ER requiere un Modelo de Datos APPROVED.'],
        nextAction: 'Aprobar un Modelo de Datos.',
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
        ? `Diagrama ER disponible para ${dataModel.code}.`
        : `${dataModel.code} (APPROVED) no tiene diagrama ER generado.`,
      evidence: satisfied
        ? { artifactVersionId: dataModel.versionId, code: dataModel.code }
        : undefined,
      blockers: satisfied
        ? []
        : ['El Modelo de Datos APPROVED seleccionado no tiene una representación ER generada.'],
      nextAction: satisfied ? null : 'Generar el diagrama ER del Modelo de Datos aprobado.',
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
        summary: `No hay ${label} APPROVED.`,
        blockers: [`Se requiere un ${label} APPROVED.`],
        nextAction: `Aprobar ${label}.`,
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
        ? `${result.code} está APPROVED con diagrama generado.`
        : `${result.code} está APPROVED pero no tiene diagrama generado.`,
      evidence: { artifactVersionId: result.versionId, code: result.code },
      blockers: satisfied
        ? []
        : [`${label} APPROVED no tiene una representación de diagrama generada.`],
      nextAction: satisfied ? null : `Generar el diagrama de ${label}.`,
    });
  }

  private async mockupsStage(
    projectId: string,
    blueprint: { code: string; versionId: string } | null,
  ): Promise<ReadinessStage> {
    if (!blueprint)
      return stage({
        key: 'MOCKUPS',
        label: 'Mockups',
        satisfied: false,
        summary: 'No hay UI Blueprint aprobado del cual derivar Mockups.',
        blockers: ['Los Mockups requieren un UI Blueprint APPROVED.'],
        nextAction: 'Aprobar un UI Blueprint.',
      });
    const mockups = await this.prisma.artifact.findMany({
      where: { projectId, artifactTypeCode: 'MOCKUP' },
      include: {
        versions: {
          where: { status: 'APPROVED' },
          orderBy: { versionNumber: 'desc' },
          take: 1,
          include: { mockupDetail: true },
        },
      },
    });
    const match = mockups.find(
      (m) => m.versions[0]?.mockupDetail?.uiBlueprintVersionId === blueprint.versionId,
    );
    const satisfied = Boolean(match);
    return stage({
      key: 'MOCKUPS',
      label: 'Mockups',
      satisfied,
      summary: satisfied
        ? `${match!.code} aprobado, derivado exactamente de ${blueprint.code}.`
        : `No hay un Mockup APPROVED derivado exactamente del UI Blueprint ${blueprint.code} vigente.`,
      evidence: match ? { artifactVersionId: match.versions[0]!.id, code: match.code } : undefined,
      blockers: satisfied
        ? []
        : [
            'Se requiere un Mockup APPROVED derivado exactamente del UI Blueprint APPROVED vigente.',
          ],
      nextAction: satisfied ? null : 'Generar y aprobar el Mockup del UI Blueprint aprobado.',
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
        return `DOWNSTREAM_REVIEW_RECOMMENDED: ${node?.code ?? id} depende de conocimiento potencialmente desactualizado (HAS_POTENTIALLY_AFFECTED_UPSTREAM).`;
      });
    }

    const warnings = [
      ...affected.map(
        (a) => `POTENTIALLY_AFFECTED: ${a.code} (v${a.versionNumber}) — revisión recomendada.`,
      ),
      ...downstreamWarnings,
    ];
    const satisfied = !directlyStale;
    return stage({
      key: 'IMPACT',
      label: 'Impacto potencial',
      satisfied,
      summary: directlyStale
        ? 'El Contexto del Proyecto vigente excluye conocimiento de fuente APPROVED más reciente.'
        : affected.length
          ? 'Sin bloqueo directo; existen artefactos potencialmente afectados que requieren revisión.'
          : 'Sin advertencias de impacto potencial pendientes.',
      counts: { potentiallyAffected: affected.length },
      blockers: directlyStale
        ? [
            'El Contexto del Proyecto APPROVED no incluye conocimiento de fuente APPROVED más reciente (staleness sin resolver).',
          ]
        : [],
      warnings,
      nextAction: directlyStale
        ? 'Actualizar y volver a aprobar el Contexto del Proyecto con el conocimiento de fuente más reciente.'
        : null,
    });
  }
}
