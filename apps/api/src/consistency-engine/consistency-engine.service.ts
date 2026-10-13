import { Injectable, UnprocessableEntityException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import type {
  ConsistencyIssue,
  ConsistencyReportResponse,
  StructuredAnalysisKind,
  UiBlueprintContent,
} from '@caseflow-ai/contracts';
import {
  COHERENCE_KINDS,
  coherenceGaps,
  upstreamFromSources,
  type CoherenceGap,
  type CoherenceSource,
} from './coherence-rules';
import { contextCoverage } from '../requirements/context-coverage';

const KIND_LABELS = { NEED: 'necesidad', BUSINESS_RULE: 'regla de negocio' } as const;

const RULE_LABELS: Record<CoherenceGap['chain'], string> = {
  QUALITY_REQUIREMENT_DESIGN: 'Requisito no funcional → diseño',
  CONTEXT_REQUIREMENT: 'Contexto → requisito',
  REQUIREMENT_USE_CASE_SCREEN: 'Requisito → caso de uso → pantalla',
  ENTITY_CLASS_PLAN: 'Entidad → clase → plan de implementación',
  NAVIGATION_SCREEN_ROUTE: 'Navegación → pantalla → ruta',
  ACTION_ENDPOINT: 'Acción de pantalla → operación o endpoint',
};

// Artifact types with a single authoritative instance: the most recently
// approved one is the one that counts (the same policy Readiness uses).
const SINGLE_TYPES = new Set([
  'DATA_MODEL',
  'CLASS_DIAGRAM',
  'NAVIGATION_TREE',
  'UI_BLUEPRINT',
  'CONCEPTUAL_DOMAIN_MODEL',
  'IMPLEMENTATION_PLAN',
]);

const VERSION_INCLUDE = {
  artifact: true,
  structuredAnalysisDetail: true,
  dataModelDetail: { include: { entities: { include: { attributes: true } } } },
  mockupsSourcedFromHere: { include: { screens: true } },
  useCaseDetail: { include: { requirementLinks: { include: { requirementVersion: true } } } },
} as const;

@Injectable()
export class ConsistencyEngineService {
  constructor(private readonly prisma: PrismaService) {}

  async generateReport(projectId: string): Promise<ConsistencyReportResponse> {
    const [versions, strict] = await Promise.all([
      this.approvedVersions(projectId),
      this.coherenceRequired(projectId),
    ]);
    const issues: ConsistencyIssue[] = [];
    const severity = strict ? 'ERROR' : 'WARNING';
    const sources = versions.map(toSource);
    const upstream = upstreamFromSources(sources);

    // Coverage chains (DEC-121): every stage against the approved one above it.
    for (const version of versions) {
      const kind = version.artifact.artifactTypeCode as StructuredAnalysisKind;
      if (!COHERENCE_KINDS.has(kind)) continue;
      const above =
        kind === 'IMPLEMENTATION_PLAN'
          ? upstreamFromSources(await this.baselineSources(projectId, version))
          : upstream;
      for (const gap of coherenceGaps(kind, version.structuredAnalysisDetail?.content, above))
        issues.push(this.issue(gap, severity, version.artifact));
    }
    for (const gap of this.requirementGaps(versions))
      issues.push(this.issue(gap.gap, severity, gap.artifact));
    const design = versions.filter((v) =>
      ['NAVIGATION_TREE', 'UI_BLUEPRINT', 'SOFTWARE_ARCHITECTURE', 'SYSTEM_ARCHITECTURE'].includes(
        v.artifact.artifactTypeCode,
      ),
    );
    if (design.length) {
      const coveredCodes = new Set(
        design.flatMap((version) => {
          const content = version.structuredAnalysisDetail?.content as {
            nodes?: { relatedSourceCodes?: string[] }[];
            components?: { relatedSourceCodes?: string[] }[];
            screens?: { relatedSourceCodes?: string[] }[];
          } | null;
          return [
            ...(content?.nodes ?? []),
            ...(content?.components ?? []),
            ...(content?.screens ?? []),
          ].flatMap((item) => item.relatedSourceCodes ?? []);
        }),
      );
      for (const requirement of versions.filter((v) => v.requirementType === 'NON_FUNCTIONAL'))
        if (!coveredCodes.has(requirement.artifact.code))
          issues.push(
            this.issue(
              {
                chain: 'QUALITY_REQUIREMENT_DESIGN',
                message: `El requisito no funcional ${requirement.artifact.code} no tiene cobertura explícita en el diseño aprobado. Relaciónelo con el componente, nodo o pantalla pertinente y revise cómo se atiende.`,
              },
              'WARNING',
              requirement.artifact,
            ),
          );
    }

    // DEC-126: the approved context reaches the approved requirements.
    const covered = await contextCoverage(this.prisma, projectId, { approvedOnly: true });
    if (covered.context) {
      const context = { id: covered.context.artifactId, artifactTypeCode: 'REQUIREMENT' };
      for (const gap of contextGaps(covered.items)) issues.push(this.issue(gap, severity, context));
      for (const item of covered.items.filter((i) => !i.mandatory && !i.coveredBy.length))
        issues.push(
          this.issue(
            {
              chain: 'CONTEXT_REQUIREMENT',
              message: `La restricción ${item.code} «${item.description}» no está atendida por ningún requisito aprobado.`,
            },
            'OBSERVATION',
            context,
          ),
        );
      for (const requirement of covered.withoutOrigin)
        issues.push(
          this.issue(
            {
              chain: 'CONTEXT_REQUIREMENT',
              message: `El requisito ${requirement.code} no indica qué elementos del contexto atiende ni por qué se incluye.`,
            },
            'WARNING',
            { id: requirement.id, artifactTypeCode: 'REQUIREMENT' },
          ),
        );
    }

    // Every approved UI blueprint screen has an approved mockup.
    for (const version of versions.filter((v) => v.artifact.artifactTypeCode === 'UI_BLUEPRINT')) {
      const content = version.structuredAnalysisDetail?.content as UiBlueprintContent | undefined;
      const painted = new Set(
        version.mockupsSourcedFromHere.flatMap((m) => m.screens.map((s) => s.screenLocalId)),
      );
      for (const screen of content?.screens ?? [])
        if (!painted.has(screen.localId))
          issues.push({
            rule: 'Mockup Association',
            severity: 'ERROR',
            message: `La pantalla '${screen.name}' del plano de interfaz ${version.artifact.code} no tiene un boceto asociado.`,
            affectedArtifactIds: [version.artifact.id],
          });
    }

    // No two approved use cases share a name.
    const byName = new Map<string, string[]>();
    for (const version of versions) {
      const name = version.useCaseDetail?.name.trim().toLowerCase();
      if (name) byName.set(name, [...(byName.get(name) ?? []), version.artifact.id]);
    }
    for (const ids of byName.values())
      if (ids.length > 1)
        issues.push({
          rule: 'Unique Use Case Name',
          severity: 'ERROR',
          message: `El nombre del caso de uso está duplicado (${ids.length} ocurrencias).`,
          affectedArtifactIds: ids,
        });

    return {
      standard: 'ConsistencyEngine-V2',
      totalArtifacts: versions.length,
      coherenceRequired: strict,
      issues,
    };
  }

  // Approval gate (DEC-121): in projects with mandatory coherence, an artifact
  // with coverage gaps against what is approved above it cannot be approved.
  async assertCoherent(projectId: string, kind: StructuredAnalysisKind, content: unknown) {
    if (!COHERENCE_KINDS.has(kind) || !(await this.coherenceRequired(projectId))) return;
    const sources =
      kind === 'IMPLEMENTATION_PLAN'
        ? await this.sourcesOfVersions(
            projectId,
            await this.baselineVersionIds(
              projectId,
              (content as { designBaselineId: string }).designBaselineId,
            ),
          )
        : (await this.approvedVersions(projectId)).map(toSource);
    this.throwOnGaps(coherenceGaps(kind, content, upstreamFromSources(sources)));
  }

  // Design Gate (DEC-121): the frozen versions must be coherent with each
  // other, and every approved requirement and use case must reach a screen.
  async assertDesignCoherent(projectId: string, frozenVersionIds: string[]) {
    if (!(await this.coherenceRequired(projectId))) return;
    const frozen = await this.sourcesOfVersions(projectId, frozenVersionIds);
    const approved = await this.approvedVersions(projectId);
    const analysis = approved
      .filter((v) =>
        ['REQUIREMENT', 'USE_CASE', 'DATA_MODEL'].includes(v.artifact.artifactTypeCode),
      )
      .map(toSource);
    const upstream = upstreamFromSources([...analysis, ...frozen]);
    const gaps = frozen.flatMap((source) =>
      COHERENCE_KINDS.has(source.type as StructuredAnalysisKind) &&
      source.type !== 'IMPLEMENTATION_PLAN'
        ? coherenceGaps(source.type as StructuredAnalysisKind, source.content, upstream)
        : [],
    );
    const covered = await contextCoverage(this.prisma, projectId, { approvedOnly: true });
    this.throwOnGaps([
      ...contextGaps(covered.items),
      ...this.requirementGaps(approved).map((g) => g.gap),
      ...gaps,
    ]);
  }

  private throwOnGaps(gaps: CoherenceGap[]) {
    if (!gaps.length) return;
    const shown = gaps.slice(0, 3).map((gap) => gap.message);
    throw new UnprocessableEntityException(
      `Hay elementos sin cubrir entre etapas. ${shown.join(' ')}${
        gaps.length > shown.length ? ` Y ${gaps.length - shown.length} más.` : ''
      } Revise la matriz de coherencia.`,
    );
  }

  // Every approved functional requirement is realised by an approved use case.
  private requirementGaps(versions: ApprovedVersion[]) {
    const realised = new Set(
      versions.flatMap(
        (v) => v.useCaseDetail?.requirementLinks.map((l) => l.requirementVersion.artifactId) ?? [],
      ),
    );
    const requirements = versions.filter((v) => v.artifact.artifactTypeCode === 'REQUIREMENT');
    return requirements
      .filter((v) => v.requirementType === 'FUNCTIONAL' && !realised.has(v.artifact.id))
      .map((v) => ({
        artifact: v.artifact,
        gap: {
          chain: 'REQUIREMENT_USE_CASE_SCREEN' as const,
          message: `El requisito ${v.artifact.code} no está cubierto por ningún caso de uso aprobado.`,
        },
      }));
  }

  private issue(
    gap: CoherenceGap,
    severity: ConsistencyIssue['severity'],
    artifact: { id: string; artifactTypeCode: string },
  ): ConsistencyIssue {
    return {
      rule: RULE_LABELS[gap.chain],
      severity,
      message: gap.message,
      affectedArtifactIds: [artifact.id],
      chain: gap.chain,
      artifactType: artifact.artifactTypeCode,
    };
  }

  private async coherenceRequired(projectId: string) {
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
      select: { coherenceRequired: true },
    });
    return project?.coherenceRequired ?? true;
  }

  // The latest approved version of every artifact, keeping only the most
  // recently approved instance of the single-instance types.
  private async approvedVersions(projectId: string) {
    const artifacts = await this.prisma.artifact.findMany({
      where: { projectId, archivedAt: null, versions: { some: { status: 'APPROVED' } } },
      include: {
        versions: {
          where: { status: 'APPROVED' },
          orderBy: { versionNumber: 'desc' },
          take: 1,
          include: { ...VERSION_INCLUDE, requirementDetail: { select: { requirementType: true } } },
        },
      },
    });
    const latest = new Map<string, ApprovedVersion>();
    const all: ApprovedVersion[] = [];
    for (const artifact of artifacts) {
      const raw = artifact.versions[0];
      if (!raw) continue;
      const version: ApprovedVersion = {
        ...raw,
        artifact,
        requirementType: raw.requirementDetail?.requirementType ?? null,
      };
      const type = artifact.artifactTypeCode;
      if (!SINGLE_TYPES.has(type)) {
        all.push(version);
        continue;
      }
      const current = latest.get(type);
      if (
        !current ||
        (version.approvedAt ?? version.createdAt) > (current.approvedAt ?? current.createdAt)
      )
        latest.set(type, version);
    }
    return [...all, ...latest.values()];
  }

  private async baselineVersionIds(projectId: string, designBaselineId: string) {
    const entries = await this.prisma.designBaselineEntry.findMany({
      where: { baselineId: designBaselineId, baseline: { projectId } },
      select: { artifactVersionId: true },
    });
    return entries.map((entry) => entry.artifactVersionId);
  }

  private async baselineSources(projectId: string, plan: ApprovedVersion) {
    const content = plan.structuredAnalysisDetail?.content as { designBaselineId?: string } | null;
    return content?.designBaselineId
      ? this.sourcesOfVersions(
          projectId,
          await this.baselineVersionIds(projectId, content.designBaselineId),
        )
      : [];
  }

  private async sourcesOfVersions(projectId: string, ids: string[]): Promise<CoherenceSource[]> {
    const versions = await this.prisma.artifactVersion.findMany({
      where: { id: { in: ids }, projectId },
      include: VERSION_INCLUDE,
    });
    return versions.map(toSource);
  }
}

// Every need and business rule of the approved context answered by some
// approved requirement (DEC-126).
function contextGaps(items: Awaited<ReturnType<typeof contextCoverage>>['items']): CoherenceGap[] {
  return items
    .filter((item) => item.mandatory && !item.coveredBy.length)
    .map((item) => ({
      chain: 'CONTEXT_REQUIREMENT',
      message: `La ${KIND_LABELS[item.kind as keyof typeof KIND_LABELS]} ${item.code} «${item.description}» del contexto no está cubierta por ningún requisito aprobado.`,
    }));
}

type ApprovedVersion = {
  approvedAt: Date | null;
  createdAt: Date;
  requirementType: string | null;
  artifact: { id: string; code: string; artifactTypeCode: string };
  structuredAnalysisDetail: { content: unknown } | null;
  dataModelDetail: { entities: { name: string; attributes: { name: string }[] }[] } | null;
  mockupsSourcedFromHere: { screens: { screenLocalId: string }[] }[];
  useCaseDetail: {
    name: string;
    requirementLinks: { requirementVersion: { artifactId: string } }[];
  } | null;
};

function toSource(version: {
  artifact: { code: string; artifactTypeCode: string };
  structuredAnalysisDetail: { content: unknown } | null;
  dataModelDetail: { entities: { name: string; attributes: { name: string }[] }[] } | null;
}): CoherenceSource {
  return {
    code: version.artifact.code,
    type: version.artifact.artifactTypeCode,
    content:
      version.structuredAnalysisDetail?.content ??
      (version.dataModelDetail
        ? {
            entities: version.dataModelDetail.entities.map((entity) => ({
              name: entity.name,
              attributes: entity.attributes.map((attribute) => ({ name: attribute.name })),
            })),
          }
        : undefined),
  };
}
