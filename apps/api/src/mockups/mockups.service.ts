import { Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { canTransitionArtifactVersionStatus, initialStatusForOrigin } from '@caseflow-ai/domain';
import { uiBlueprintContentSchema, type ArtifactVersionStatus } from '@caseflow-ai/contracts';
import { PrismaService } from '../database/prisma.service';
import type { Prisma } from '../generated/prisma/client';
import { sanitizeDiagramSvg } from '../data-models/svg-sanitizer';
import { MOCKUP_GENERATOR_VERSION, MockupRenderer } from './mockup-renderer';

type Tx = Prisma.TransactionClient;
const MOCKUP_CODE_PREFIX = 'MCK';

@Injectable()
export class MockupsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly renderer: MockupRenderer,
  ) {}

  async create(projectId: string, uiBlueprintVersionId: string) {
    const svg = await this.renderFromApprovedBlueprint(projectId, uiBlueprintVersionId);
    return this.prisma.$transaction((tx) =>
      this.createInTx(tx, projectId, uiBlueprintVersionId, svg),
    );
  }

  async list(projectId: string) {
    const rows = await this.prisma.artifact.findMany({
      where: { projectId, artifactTypeCode: 'MOCKUP' },
      include: {
        versions: {
          orderBy: { versionNumber: 'desc' },
          take: 1,
          include: { mockupDetail: true },
        },
      },
      orderBy: { code: 'asc' },
    });
    return { items: rows.map((row) => this.map(row, row.versions[0]!)) };
  }

  async get(projectId: string, mockupId: string) {
    const row = await this.findLatest(projectId, mockupId);
    return this.map(row, row.versions[0]!);
  }

  // Authoritative collection for Export (spec Phase H): APPROVED mockups
  // derived exactly from the selected authoritative UI Blueprint version —
  // never a mockup left over from a superseded blueprint version.
  async listApprovedForBlueprint(projectId: string, uiBlueprintVersionId: string) {
    const rows = await this.prisma.artifact.findMany({
      where: { projectId, artifactTypeCode: 'MOCKUP', versions: { some: { status: 'APPROVED' } } },
      include: {
        versions: {
          where: { status: 'APPROVED' },
          orderBy: { versionNumber: 'desc' },
          take: 1,
          include: { mockupDetail: true },
        },
      },
      orderBy: { code: 'asc' },
    });
    return rows
      .filter((row) => row.versions[0]?.mockupDetail?.uiBlueprintVersionId === uiBlueprintVersionId)
      .map((row) => {
        const version = row.versions[0]!;
        const detail = version.mockupDetail!;
        return {
          id: row.id,
          projectId: row.projectId,
          code: row.code,
          versionId: version.id,
          uiBlueprintVersionId: detail.uiBlueprintVersionId,
          svg: detail.svg,
          createdAt: version.createdAt.toISOString(),
        };
      });
  }

  async getPreview(projectId: string, mockupId: string) {
    const row = await this.findLatest(projectId, mockupId);
    const version = row.versions[0]!;
    const detail = version.mockupDetail!;
    return {
      id: row.id,
      projectId: row.projectId,
      code: row.code,
      versionId: version.id,
      uiBlueprintVersionId: detail.uiBlueprintVersionId,
      svg: detail.svg,
      createdAt: version.createdAt.toISOString(),
    };
  }

  async version(projectId: string, mockupId: string, uiBlueprintVersionId: string) {
    const svg = await this.renderFromApprovedBlueprint(projectId, uiBlueprintVersionId);
    return this.prisma.$transaction(async (tx) => {
      const locked = await tx.$queryRaw<{ id: string }[]>`
        SELECT id FROM artifacts WHERE id=${mockupId}::uuid AND project_id=${projectId}::uuid AND artifact_type_code='MOCKUP' FOR NO KEY UPDATE`;
      if (!locked.length) throw new NotFoundException('Artefacto no encontrado.');
      const latest = await tx.artifactVersion.findFirstOrThrow({
        where: { artifactId: mockupId },
        orderBy: { versionNumber: 'desc' },
      });
      const version = await tx.artifactVersion.create({
        data: {
          artifactId: mockupId,
          projectId,
          versionNumber: latest.versionNumber + 1,
          title: latest.title,
          status: initialStatusForOrigin('SYSTEM_GENERATED'),
          origin: 'SYSTEM_GENERATED',
        },
      });
      await tx.mockupDetail.create({
        data: {
          artifactVersionId: version.id,
          uiBlueprintVersionId,
          generatorVersion: MOCKUP_GENERATOR_VERSION,
          svg,
        },
      });
      return this.loadAndMap(tx, mockupId, version.id);
    });
  }

  async transition(
    projectId: string,
    artifactId: string,
    versionId: string,
    status: ArtifactVersionStatus,
  ) {
    const version = await this.prisma.artifactVersion.findFirst({
      where: { id: versionId, projectId, artifactId, artifact: { artifactTypeCode: 'MOCKUP' } },
    });
    if (!version) throw new NotFoundException('Versión no encontrada.');
    if (!canTransitionArtifactVersionStatus(version.status, status))
      throw new UnprocessableEntityException('Transición de estado no permitida.');
    return this.prisma.artifactVersion.update({
      where: { id: versionId },
      data: {
        status,
        submittedAt: status === 'IN_REVIEW' ? new Date() : version.submittedAt,
        approvedAt: status === 'APPROVED' ? new Date() : version.approvedAt,
      },
    });
  }

  // Rendered/sanitized before any transaction opens, matching the established
  // "no network/CPU-heavy work under a DB lock" pattern used elsewhere.
  private async renderFromApprovedBlueprint(
    projectId: string,
    uiBlueprintVersionId: string,
  ): Promise<string> {
    const source = await this.prisma.artifactVersion.findFirst({
      where: {
        id: uiBlueprintVersionId,
        projectId,
        status: 'APPROVED',
        artifact: { artifactTypeCode: 'UI_BLUEPRINT' },
      },
      include: { structuredAnalysisDetail: true },
    });
    if (!source?.structuredAnalysisDetail)
      throw new UnprocessableEntityException(
        'Se requiere una versión exacta APPROVED de UI Blueprint del mismo proyecto.',
      );
    const content = uiBlueprintContentSchema.parse(source.structuredAnalysisDetail.content);
    return sanitizeDiagramSvg(this.renderer.render(content));
  }

  private async createInTx(tx: Tx, projectId: string, uiBlueprintVersionId: string, svg: string) {
    if (!(await tx.project.findUnique({ where: { id: projectId } })))
      throw new NotFoundException('Proyecto no encontrado.');
    const number = await this.allocate(tx, projectId, MOCKUP_CODE_PREFIX);
    const artifact = await tx.artifact.create({
      data: {
        projectId,
        artifactTypeCode: 'MOCKUP',
        code: `${MOCKUP_CODE_PREFIX}-${String(number).padStart(3, '0')}`,
      },
    });
    // Deterministic derivation from an already-approved UI Blueprint, with no
    // manual authoring and no AI involvement — SYSTEM_GENERATED (spec §6.3).
    const version = await tx.artifactVersion.create({
      data: {
        artifactId: artifact.id,
        projectId,
        versionNumber: 1,
        title: 'Mockup',
        status: initialStatusForOrigin('SYSTEM_GENERATED'),
        origin: 'SYSTEM_GENERATED',
      },
    });
    await tx.mockupDetail.create({
      data: {
        artifactVersionId: version.id,
        uiBlueprintVersionId,
        generatorVersion: MOCKUP_GENERATOR_VERSION,
        svg,
      },
    });
    return this.loadAndMap(tx, artifact.id, version.id);
  }

  private async findLatest(projectId: string, mockupId: string) {
    const row = await this.prisma.artifact.findFirst({
      where: { id: mockupId, projectId, artifactTypeCode: 'MOCKUP' },
      include: {
        versions: {
          orderBy: { versionNumber: 'desc' },
          take: 1,
          include: { mockupDetail: true },
        },
      },
    });
    if (!row?.versions[0]?.mockupDetail) throw new NotFoundException('Artefacto no encontrado.');
    return row;
  }

  private async allocate(tx: Tx, projectId: string, prefix: string) {
    const rows = await tx.$queryRaw<
      { last_number: number }[]
    >`INSERT INTO project_code_counters(project_id,code_prefix,last_number) VALUES(${projectId}::uuid,${prefix},1) ON CONFLICT(project_id,code_prefix) DO UPDATE SET last_number=project_code_counters.last_number+1 RETURNING last_number`;
    return rows[0]!.last_number;
  }

  private async loadAndMap(tx: Tx, artifactId: string, versionId: string) {
    const artifact = await tx.artifact.findUniqueOrThrow({ where: { id: artifactId } });
    const version = await tx.artifactVersion.findUniqueOrThrow({
      where: { id: versionId },
      include: { mockupDetail: true },
    });
    return this.map(artifact, version);
  }

  private map(
    artifact: { id: string; projectId: string; code: string; createdAt: Date },
    version: {
      id: string;
      versionNumber: number;
      status: string;
      origin: string;
      createdAt: Date;
      mockupDetail: { uiBlueprintVersionId: string } | null;
    },
  ) {
    return {
      id: artifact.id,
      projectId: artifact.projectId,
      code: artifact.code,
      uiBlueprintVersionId: version.mockupDetail!.uiBlueprintVersionId,
      version: {
        id: version.id,
        versionNumber: version.versionNumber,
        status: version.status,
        origin: version.origin,
        createdAt: version.createdAt.toISOString(),
      },
      createdAt: artifact.createdAt.toISOString(),
    };
  }
}
