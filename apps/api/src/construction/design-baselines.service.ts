import { createHash } from 'node:crypto';
import {
  ConflictException,
  Injectable,
  NotFoundException,
  Optional,
  UnprocessableEntityException,
} from '@nestjs/common';
import { StageCurrencyService } from '../readiness/stage-currency';
import {
  DESIGN_BASELINE_ROLES,
  type CreateDesignBaselineRequest,
  type CreateScreenDesignExceptionRequest,
  type ScreenDesignExceptionResponse,
  type ScreenFindingsResponse,
  type DesignBaselineResponse,
  type DesignBaselineRole,
} from '@caseflow-ai/contracts';
import { PrismaService } from '../database/prisma.service';
import { AuditService } from '../audit/audit.service';
import { ConsistencyEngineService } from '../consistency-engine/consistency-engine.service';
import { assertCanGenerate } from '../common/generation-cancelled';

const ROLE_LABELS: Record<DesignBaselineRole, string> = {
  GENERATION_PLAN: 'el plan de generación',
  CONCEPTUAL_DOMAIN_MODEL: 'el modelo conceptual',
  CLASS_DIAGRAM: 'el diagrama de clases',
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
    private readonly consistency: ConsistencyEngineService,
    @Optional() private readonly currency?: StageCurrencyService,
  ) {}

  async create(
    projectId: string,
    approvedByUserId: string,
    input: CreateDesignBaselineRequest,
    // HUMAN_BULK when frozen by an EXPRESS bulk approval (DEC-116).
    approvalOrigin?: 'HUMAN_BULK',
  ): Promise<DesignBaselineResponse> {
    // DEC-118: the theme is mandatory only for projects created after it existed.
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
      select: { designThemeRequired: true, coherenceRequired: true },
    });
    if (project?.designThemeRequired && !input.versions.DESIGN_THEME)
      throw new UnprocessableEntityException('Seleccione el tema aprobado del proyecto.');
    // DEC-121: the class diagram is part of the frozen design in new projects.
    if (project?.coherenceRequired && !input.versions.CLASS_DIAGRAM)
      throw new UnprocessableEntityException(
        'Seleccione el diagrama de clases aprobado del proyecto.',
      );
    // Role order matters: the database checks the mockup against the UI
    // blueprint entry, so UI_BLUEPRINT is inserted before MOCKUP.
    const entries = DESIGN_BASELINE_ROLES.flatMap((role) => {
      const artifactVersionId = input.versions[role];
      return artifactVersionId ? [{ role, artifactVersionId }] : [];
    });
    await this.assertFreezable(projectId, entries);
    await this.currency?.assertCurrent(projectId);
    // DEC-121: what is frozen must be coherent with itself and the analysis.
    await this.consistency.assertDesignCoherent(
      projectId,
      entries.map((entry) => entry.artifactVersionId),
    );

    const baseline = await this.prisma.$transaction(async (tx) => {
      const created = await tx.designBaseline.create({
        data: {
          projectId,
          label: input.label,
          note: input.note ?? null,
          approvedByUserId,
          ...(approvalOrigin ? { approvalOrigin } : {}),
        },
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

  // The findings of the latest run of this design that recorded any (each run
  // records the findings it reports or reuses), with the justified exception
  // that covers them, if any. Older evaluations are history, not current.
  async screenFindings(projectId: string, baselineId: string): Promise<ScreenFindingsResponse> {
    await this.get(projectId, baselineId);
    const findingsPath = { startsWith: 'docs/presentation-findings/' };
    const latestRun = await this.prisma.generatedFile.findFirst({
      where: { path: findingsPath, generationRun: { projectId, designBaselineId: baselineId } },
      orderBy: [{ generationRun: { createdAt: 'desc' } }, { id: 'desc' }],
      select: { generationRunId: true },
    });
    if (!latestRun) return { items: [] };
    const files = await this.prisma.generatedFile.findMany({
      where: { path: findingsPath, generationRunId: latestRun.generationRunId },
      orderBy: { id: 'desc' },
      select: { content: true },
    });
    const exceptions = await this.prisma.screenDesignException.findMany({
      where: { projectId, designBaselineId: baselineId },
    });
    const latest = new Map<string, { findings: string; evaluator: string | null }>();
    for (const file of files) {
      const stored = JSON.parse(file.content) as {
        routePath: string;
        findings: string;
        evaluator?: string;
      };
      if (!latest.has(stored.routePath))
        latest.set(stored.routePath, {
          findings: stored.findings,
          evaluator: stored.evaluator ?? null,
        });
    }
    return {
      items: [...latest].map(([routePath, { findings, evaluator }]) => {
        const findingsSha256 = sha256(findings);
        const exception = exceptions.find(
          (item) => item.routePath === routePath && item.findingsSha256 === findingsSha256,
        );
        return {
          routePath,
          findings,
          findingsSha256,
          evaluator,
          exception: exception ? this.mapException(exception) : null,
        };
      }),
    };
  }

  // Accepts recorded findings of one screen with a justification. Only
  // findings actually recorded for this design can be accepted.
  // A hand-written screen that follows its mockup (DEC-161). Generation checks
  // its functional bindings; here it is only recorded, audited and immutable.
  async recordScreenOverride(
    projectId: string,
    baselineId: string,
    userId: string,
    input: { routePath: string; content: string; justification: string },
  ): Promise<{ id: string; contentSha256: string }> {
    await assertCanGenerate(this.prisma, projectId, userId);
    const baseline = await this.prisma.designBaseline.findFirst({
      where: { id: baselineId, projectId },
      select: { id: true },
    });
    if (!baseline) throw new NotFoundException('Diseño aprobado no encontrado.');
    if (
      !input.routePath.startsWith('/') ||
      !input.content.trim() ||
      input.justification.trim().length < 10
    )
      throw new UnprocessableEntityException(
        'Indique la ruta, el código de la pantalla y una justificación de al menos 10 caracteres.',
      );
    const contentSha256 = createHash('sha256').update(input.content).digest('hex');
    return this.prisma.$transaction(async (tx) => {
      const row = await tx.screenDesignOverride.create({
        data: {
          projectId,
          designBaselineId: baselineId,
          routePath: input.routePath,
          content: input.content,
          contentSha256,
          justification: input.justification.trim(),
          createdByUserId: userId,
        },
      });
      await this.audit.record(
        {
          projectId,
          actorUserId: userId,
          action: 'SCREEN_DESIGN_OVERRIDE_RECORDED',
          entityType: 'SCREEN_DESIGN_OVERRIDE',
          entityId: row.id,
          metadata: { designBaselineId: baselineId, routePath: input.routePath, contentSha256 },
        },
        tx,
      );
      return { id: row.id, contentSha256 };
    });
  }

  async createScreenException(
    projectId: string,
    baselineId: string,
    userId: string,
    input: CreateScreenDesignExceptionRequest,
  ): Promise<ScreenDesignExceptionResponse> {
    await assertCanGenerate(this.prisma, projectId, userId);
    const recorded = (await this.screenFindings(projectId, baselineId)).items.find(
      (item) => item.routePath === input.routePath && item.findingsSha256 === input.findingsSha256,
    );
    if (!recorded)
      throw new NotFoundException('No hay hallazgos registrados que coincidan con esta pantalla.');
    try {
      const created = await this.prisma.$transaction(async (tx) => {
        const row = await tx.screenDesignException.create({
          data: {
            projectId,
            designBaselineId: baselineId,
            routePath: input.routePath,
            findingsSha256: input.findingsSha256,
            findings: recorded.findings,
            justification: input.justification,
            createdByUserId: userId,
          },
        });
        await this.audit.record(
          {
            projectId,
            actorUserId: userId,
            action: 'SCREEN_DESIGN_EXCEPTION_ACCEPTED',
            entityType: 'SCREEN_DESIGN_EXCEPTION',
            entityId: row.id,
            metadata: {
              designBaselineId: baselineId,
              routePath: input.routePath,
              findingsSha256: input.findingsSha256,
            },
          },
          tx,
        );
        return row;
      });
      return this.mapException(created);
    } catch (error) {
      if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2002')
        throw new ConflictException('Estos hallazgos ya fueron aceptados.');
      throw error;
    }
  }

  private mapException(row: {
    id: string;
    routePath: string;
    findingsSha256: string;
    findings: string;
    justification: string;
    createdByUserId: string;
    createdAt: Date;
  }): ScreenDesignExceptionResponse {
    return {
      id: row.id,
      routePath: row.routePath,
      findingsSha256: row.findingsSha256,
      findings: row.findings,
      justification: row.justification,
      createdByUserId: row.createdByUserId,
      createdAt: row.createdAt.toISOString(),
    };
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

const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');
