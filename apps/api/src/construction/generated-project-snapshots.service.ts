import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { StorageProvider } from '@caseflow-ai/integrations';
import type { GeneratedProjectSnapshotResponse } from '@caseflow-ai/contracts';
import type { GeneratedProjectSnapshot } from '../generated/prisma/client';
import { PrismaService } from '../database/prisma.service';
import { AuditService } from '../audit/audit.service';
import { STORAGE_PROVIDER } from '../sources/storage-provider.token';

// Read side of the immutable snapshots; the ZIP is a private object, streamed
// only to project members and every download is audited (spec §178).
@Injectable()
export class GeneratedProjectSnapshotsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    @Inject(STORAGE_PROVIDER) private readonly storage: StorageProvider,
  ) {}

  async list(projectId: string): Promise<{ items: GeneratedProjectSnapshotResponse[] }> {
    const rows = await this.prisma.generatedProjectSnapshot.findMany({
      where: { projectId },
      orderBy: { createdAt: 'desc' },
    });
    return { items: rows.map((row) => this.map(row)) };
  }

  async get(projectId: string, snapshotId: string): Promise<GeneratedProjectSnapshotResponse> {
    return this.map(await this.find(projectId, snapshotId));
  }

  async archive(projectId: string, snapshotId: string, userId: string) {
    const snapshot = await this.find(projectId, snapshotId);
    const body = await this.storage.getObject(snapshot.archiveStorageKey);
    await this.audit.record({
      projectId,
      actorUserId: userId,
      action: 'GENERATED_PROJECT_SNAPSHOT_DOWNLOADED',
      entityType: 'GENERATED_PROJECT_SNAPSHOT',
      entityId: snapshot.id,
      metadata: { archiveSha256: snapshot.archiveSha256 },
    });
    return { body, filename: `proyecto-generado-${snapshot.id}.zip` };
  }

  private async find(projectId: string, snapshotId: string) {
    const row = await this.prisma.generatedProjectSnapshot.findFirst({
      where: { id: snapshotId, projectId },
    });
    if (!row) throw new NotFoundException('Proyecto generado no encontrado.');
    return row;
  }

  private map(row: GeneratedProjectSnapshot): GeneratedProjectSnapshotResponse {
    return {
      id: row.id,
      generationRunId: row.generationRunId,
      sandboxRunId: row.sandboxRunId,
      targetTemplateIdentifier: row.targetTemplateIdentifier,
      targetTemplateVersion: row.targetTemplateVersion,
      generationPlanVersionId: row.generationPlanVersionId,
      designBaselineId: row.designBaselineId,
      implementationPlanVersionId: row.implementationPlanVersionId,
      fileCount: row.fileCount,
      manifestHash: row.manifestHash,
      archiveSha256: row.archiveSha256,
      archiveSize: row.archiveSize,
      createdByUserId: row.createdByUserId,
      createdAt: row.createdAt.toISOString(),
    };
  }
}
