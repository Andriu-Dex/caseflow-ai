import { randomUUID } from 'node:crypto';
import {
  Inject,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { canTransitionArtifactVersionStatus, initialStatusForOrigin } from '@caseflow-ai/domain';
import { uiBlueprintContentSchema, type ArtifactVersionStatus } from '@caseflow-ai/contracts';
import { PrismaService } from '../database/prisma.service';
import type { Prisma } from '../generated/prisma/client';
import { sanitizeDiagramSvg } from '../data-models/svg-sanitizer';
import {
  MockupProviderError,
  type MockupGenerationResult,
  type MockupProvider,
  type StorageProvider,
} from '@caseflow-ai/integrations';
import { MOCKUP_GENERATOR_VERSION } from './mockup-renderer';
import { MOCKUP_PROVIDER } from './mockup-provider.token';
import { STORAGE_PROVIDER } from './storage-provider.token';

type Tx = Prisma.TransactionClient;
const MOCKUP_CODE_PREFIX = 'MCK';
type StoredGeneration =
  | { kind: 'INTERNAL_WIREFRAME'; svg: string }
  | {
      kind: 'STITCH';
      screens: {
        screenLocalId: string;
        screenName: string;
        imageStorageKey: string;
        imageContentType: string;
        htmlStorageKey: string;
      }[];
    };

@Injectable()
export class MockupsService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(MOCKUP_PROVIDER) private readonly mockupProvider: MockupProvider,
    @Inject(STORAGE_PROVIDER) private readonly storage: StorageProvider,
  ) {}

  async create(projectId: string, uiBlueprintVersionId: string) {
    const generated = await this.generateFromApprovedBlueprint(projectId, uiBlueprintVersionId);
    return this.prisma.$transaction((tx) =>
      this.createInTx(tx, projectId, uiBlueprintVersionId, generated),
    );
  }

  async list(projectId: string) {
    const rows = await this.prisma.artifact.findMany({
      where: { projectId, artifactTypeCode: 'MOCKUP', archivedAt: null },
      include: {
        versions: {
          orderBy: { versionNumber: 'desc' },
          take: 1,
          include: { mockupDetail: { include: { screens: true } } },
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
          include: { mockupDetail: { include: { screens: true } } },
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
          generatorKind: detail.generatorKind,
          screens:
            detail.generatorKind === 'STITCH'
              ? this.screenLinks(projectId, row.id, detail.screens)
              : null,
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
      generatorKind: detail.generatorKind,
      svg: detail.svg,
      screens:
        detail.generatorKind === 'STITCH'
          ? this.screenLinks(projectId, row.id, detail.screens)
          : null,
      createdAt: version.createdAt.toISOString(),
    };
  }

  async version(projectId: string, mockupId: string, uiBlueprintVersionId: string) {
    const generated = await this.generateFromApprovedBlueprint(projectId, uiBlueprintVersionId);
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
      await this.saveDetail(tx, version.id, uiBlueprintVersionId, generated);
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
  private async generateFromApprovedBlueprint(
    projectId: string,
    uiBlueprintVersionId: string,
  ): Promise<StoredGeneration> {
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
        'Se requiere una versión exacta APPROVED de plano de interfaz del mismo proyecto.',
      );
    const content = uiBlueprintContentSchema.parse(source.structuredAnalysisDetail.content);
    let generated: MockupGenerationResult;
    try {
      generated = await this.mockupProvider.generate(content);
    } catch (error) {
      if (error instanceof MockupProviderError)
        throw new ServiceUnavailableException({ message: error.message, code: error.code });
      throw error;
    }
    if (generated.kind === 'INTERNAL_WIREFRAME')
      return { kind: generated.kind, svg: sanitizeDiagramSvg(generated.svg) };
    if (
      generated.screens.length !== content.screens.length ||
      new Set(generated.screens.map((screen) => screen.screenLocalId)).size !==
        content.screens.length
    )
      throw new ServiceUnavailableException('El proveedor devolvió pantallas incompletas.');
    const expectedIds = new Set(content.screens.map((screen) => screen.localId));
    if (generated.screens.some((screen) => !expectedIds.has(screen.screenLocalId)))
      throw new ServiceUnavailableException('El proveedor devolvió pantallas inesperadas.');
    const screens: StoredGeneration & { kind: 'STITCH' } = { kind: 'STITCH', screens: [] };
    try {
      for (const screen of generated.screens) {
        const extension =
          screen.image.contentType === 'image/jpeg'
            ? 'jpg'
            : screen.image.contentType === 'image/webp'
              ? 'webp'
              : 'png';
        const prefix = `mockups/${projectId}/${randomUUID()}`;
        const imageStorageKey = `${prefix}.${extension}`;
        const htmlStorageKey = `${prefix}.html`;
        await this.storage.putObject({
          key: imageStorageKey,
          body: screen.image.body,
          contentType: screen.image.contentType,
        });
        await this.storage.putObject({
          key: htmlStorageKey,
          body: Buffer.from(screen.html, 'utf8'),
          contentType: 'text/html',
        });
        screens.screens.push({
          screenLocalId: screen.screenLocalId,
          screenName: screen.screenName,
          imageStorageKey,
          imageContentType: screen.image.contentType,
          htmlStorageKey,
        });
      }
    } catch {
      throw new ServiceUnavailableException('No se pudieron guardar los archivos del boceto.');
    }
    return screens;
  }

  private async createInTx(
    tx: Tx,
    projectId: string,
    uiBlueprintVersionId: string,
    generated: StoredGeneration,
  ) {
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
    // Internal or Stitch derivation from an approved UI Blueprint; both remain
    // SYSTEM_GENERATED candidates requiring human review.
    const version = await tx.artifactVersion.create({
      data: {
        artifactId: artifact.id,
        projectId,
        versionNumber: 1,
        title: 'Boceto',
        status: initialStatusForOrigin('SYSTEM_GENERATED'),
        origin: 'SYSTEM_GENERATED',
      },
    });
    await this.saveDetail(tx, version.id, uiBlueprintVersionId, generated);
    return this.loadAndMap(tx, artifact.id, version.id);
  }

  private async findLatest(projectId: string, mockupId: string) {
    const row = await this.prisma.artifact.findFirst({
      where: { id: mockupId, projectId, artifactTypeCode: 'MOCKUP' },
      include: {
        versions: {
          orderBy: { versionNumber: 'desc' },
          take: 1,
          include: { mockupDetail: { include: { screens: true } } },
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

  private async saveDetail(
    tx: Tx,
    versionId: string,
    uiBlueprintVersionId: string,
    generated: StoredGeneration,
  ) {
    await tx.mockupDetail.create({
      data: {
        artifactVersionId: versionId,
        uiBlueprintVersionId,
        generatorKind: generated.kind,
        generatorVersion:
          generated.kind === 'STITCH' ? 'stitch-sdk-0.3.5' : MOCKUP_GENERATOR_VERSION,
        svg: generated.kind === 'INTERNAL_WIREFRAME' ? generated.svg : null,
        ...(generated.kind === 'STITCH' ? { screens: { create: generated.screens } } : {}),
      },
    });
  }

  private screenLinks(
    projectId: string,
    mockupId: string,
    screens: { id: string; screenLocalId: string; screenName: string }[],
  ) {
    return screens.map((screen) => ({
      id: screen.id,
      screenLocalId: screen.screenLocalId,
      screenName: screen.screenName,
      imageUrl: `/projects/${projectId}/mockups/${mockupId}/screens/${screen.id}/image`,
      htmlUrl: `/projects/${projectId}/mockups/${mockupId}/screens/${screen.id}/html`,
    }));
  }

  private async findScreen(projectId: string, mockupId: string, screenId: string) {
    const screen = await this.prisma.mockupScreenDetail.findFirst({
      where: {
        id: screenId,
        mockup: {
          artifactVersion: {
            projectId,
            artifactId: mockupId,
            artifact: { artifactTypeCode: 'MOCKUP' },
          },
        },
      },
    });
    if (!screen) throw new NotFoundException('Pantalla no encontrada.');
    return screen;
  }

  async downloadScreenImage(projectId: string, mockupId: string, screenId: string) {
    const screen = await this.findScreen(projectId, mockupId, screenId);
    return {
      body: await this.storage.getObject(screen.imageStorageKey),
      contentType: screen.imageContentType,
    };
  }

  async downloadScreenHtml(projectId: string, mockupId: string, screenId: string) {
    const screen = await this.findScreen(projectId, mockupId, screenId);
    return { body: await this.storage.getObject(screen.htmlStorageKey) };
  }

  private async loadAndMap(tx: Tx, artifactId: string, versionId: string) {
    const artifact = await tx.artifact.findUniqueOrThrow({ where: { id: artifactId } });
    const version = await tx.artifactVersion.findUniqueOrThrow({
      where: { id: versionId },
      include: { mockupDetail: { include: { screens: true } } },
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
