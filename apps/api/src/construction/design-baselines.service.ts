import { Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import {
  DESIGN_BASELINE_ROLES,
  type CreateDesignBaselineRequest,
  type DesignBaselineResponse,
  type DesignBaselineRole,
} from '@caseflow-ai/contracts';
import { PrismaService } from '../database/prisma.service';
import { AuditService } from '../audit/audit.service';

const ROLE_LABELS: Record<DesignBaselineRole, string> = {
  GENERATION_PLAN: 'el plan de generación',
  CONCEPTUAL_DOMAIN_MODEL: 'el modelo conceptual',
  NAVIGATION_TREE: 'la navegación',
  UI_BLUEPRINT: 'el plano de interfaz',
  DESIGN_THEME: 'el tema y los colores',
  MOCKUP: 'el boceto',
  SOFTWARE_ARCHITECTURE: 'la arquitectura de software',
  SYSTEM_ARCHITECTURE: 'la arquitectura de sistema',
};

const baselineInclude = {
  entries: {
    include: {
      artifactVersion: {
        select: {
          id: true,
          versionNumber: true,
          title: true,
          artifact: { select: { id: true, code: true } },
        },
      },
    },
  },
} as const;

// The Design Gate (spec §160, DEC-094): creating a baseline is the human
// approval that freezes the exact approved design an ImplementationPlan and
// official code generation must use. Baselines are immutable history; the
// latest one is the current design.
@Injectable()
export class DesignBaselinesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async create(
    projectId: string,
    approvedByUserId: string,
    input: CreateDesignBaselineRequest,
  ): Promise<DesignBaselineResponse> {
    // DEC-118: the theme is mandatory only for projects created after it existed.
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
      select: { designThemeRequired: true },
    });
    if (project?.designThemeRequired && !input.versions.DESIGN_THEME)
      throw new UnprocessableEntityException('Seleccione el tema aprobado del proyecto.');
    // Role order matters: the database checks the mockup against the UI
    // blueprint entry, so UI_BLUEPRINT is inserted before MOCKUP.
    const entries = DESIGN_BASELINE_ROLES.flatMap((role) => {
      const artifactVersionId = input.versions[role];
      return artifactVersionId ? [{ role, artifactVersionId }] : [];
    });
    await this.assertFreezable(projectId, entries);

    const baseline = await this.prisma.$transaction(async (tx) => {
      const created = await tx.designBaseline.create({
        data: { projectId, label: input.label, note: input.note ?? null, approvedByUserId },
      });
      for (const entry of entries)
        await tx.designBaselineEntry.create({ data: { baselineId: created.id, ...entry } });
      await this.audit.record(
        {
          projectId,
          actorUserId: approvedByUserId,
          action: 'DESIGN_BASELINE_APPROVED',
          entityType: 'DESIGN_BASELINE',
          entityId: created.id,
          metadata: {
            label: created.label,
            versions: Object.fromEntries(
              entries.map((entry) => [entry.role, entry.artifactVersionId]),
            ),
          },
        },
        tx,
      );
      return tx.designBaseline.findUniqueOrThrow({
        where: { id: created.id },
        include: baselineInclude,
      });
    });
    return this.map(baseline);
  }

  async list(projectId: string): Promise<{ items: DesignBaselineResponse[] }> {
    const rows = await this.prisma.designBaseline.findMany({
      where: { projectId },
      include: baselineInclude,
      orderBy: { createdAt: 'desc' },
    });
    return { items: rows.map((row) => this.map(row)) };
  }

  async get(projectId: string, id: string): Promise<DesignBaselineResponse> {
    const row = await this.prisma.designBaseline.findFirst({
      where: { id, projectId },
      include: baselineInclude,
    });
    if (!row) throw new NotFoundException('Línea base de diseño no encontrada.');
    return this.map(row);
  }

  // Gate for later construction stages: an ImplementationPlan and official
  // code generation require an approved Design Baseline of the same project.
  async assertApproved(projectId: string, id: string): Promise<DesignBaselineResponse> {
    const row = await this.prisma.designBaseline.findFirst({
      where: { id, projectId },
      include: baselineInclude,
    });
    if (!row)
      throw new UnprocessableEntityException(
        'Se requiere una línea base de diseño aprobada del mismo proyecto.',
      );
    return this.map(row);
  }

  private async assertFreezable(
    projectId: string,
    entries: { role: DesignBaselineRole; artifactVersionId: string }[],
  ) {
    const versions = await this.prisma.artifactVersion.findMany({
      where: { id: { in: entries.map((entry) => entry.artifactVersionId) }, projectId },
      select: {
        id: true,
        status: true,
        artifact: { select: { artifactTypeCode: true } },
        mockupDetail: { select: { uiBlueprintVersionId: true, designThemeVersionId: true } },
      },
    });
    const byId = new Map(versions.map((version) => [version.id, version]));
    for (const { role, artifactVersionId } of entries) {
      const version = byId.get(artifactVersionId);
      if (!version || version.artifact.artifactTypeCode !== role)
        throw new UnprocessableEntityException(
          `La versión indicada para ${ROLE_LABELS[role]} no existe en este proyecto.`,
        );
      if (version.status !== 'APPROVED')
        throw new UnprocessableEntityException(
          `Apruebe ${ROLE_LABELS[role]} antes de congelar el diseño.`,
        );
    }
    const mockup = entries.find((entry) => entry.role === 'MOCKUP');
    const uiBlueprint = entries.find((entry) => entry.role === 'UI_BLUEPRINT');
    if (
      mockup &&
      byId.get(mockup.artifactVersionId)?.mockupDetail?.uiBlueprintVersionId !==
        uiBlueprint?.artifactVersionId
    )
      throw new UnprocessableEntityException(
        'El boceto debe haberse generado a partir de la versión seleccionada del plano de interfaz.',
      );
    const theme = entries.find((entry) => entry.role === 'DESIGN_THEME');
    if (
      mockup &&
      (byId.get(mockup.artifactVersionId)?.mockupDetail?.designThemeVersionId ?? null) !==
        (theme?.artifactVersionId ?? null)
    )
      throw new UnprocessableEntityException(
        theme
          ? 'El boceto debe haberse generado con la versión seleccionada del tema.'
          : 'El boceto se generó con un tema: inclúyalo en la línea base.',
      );
  }

  private map(row: {
    id: string;
    projectId: string;
    label: string;
    note: string | null;
    approvedByUserId: string;
    createdAt: Date;
    entries: {
      role: DesignBaselineRole;
      artifactVersion: {
        id: string;
        versionNumber: number;
        title: string;
        artifact: { id: string; code: string };
      };
    }[];
  }): DesignBaselineResponse {
    const order = new Map(DESIGN_BASELINE_ROLES.map((role, index) => [role, index]));
    return {
      id: row.id,
      projectId: row.projectId,
      label: row.label,
      note: row.note,
      approvedByUserId: row.approvedByUserId,
      createdAt: row.createdAt.toISOString(),
      entries: [...row.entries]
        .sort((a, b) => order.get(a.role)! - order.get(b.role)!)
        .map((entry) => ({
          role: entry.role,
          artifactId: entry.artifactVersion.artifact.id,
          artifactVersionId: entry.artifactVersion.id,
          code: entry.artifactVersion.artifact.code,
          title: entry.artifactVersion.title,
          versionNumber: entry.artifactVersion.versionNumber,
        })),
    };
  }
}
