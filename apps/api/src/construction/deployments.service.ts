import {
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
  ServiceUnavailableException,
} from '@nestjs/common';
import {
  DEPLOYMENT_PROVIDER,
  type DeploymentProvider,
  type StorageProvider,
} from '@caseflow-ai/integrations';
import type {
  DeploymentResponse,
  ResumeDeploymentRequest,
  StartDeploymentRequest,
} from '@caseflow-ai/contracts';
import { PrismaService } from '../database/prisma.service';
import { AuditService } from '../audit/audit.service';
import { STORAGE_PROVIDER } from '../sources/storage-provider.token';
import { assertCanGenerate } from '../common/generation-cancelled';
import { INTERRUPTED_BY_RESTART } from '../common/interrupted';
import { readSnapshotFiles } from './snapshot-archive';

const logger = new Logger('DeploymentsService');
const DEPLOY_FAILED =
  'No se pudo desplegar el software. Compruebe que Docker está en ejecución y que hay conexión a internet, e inténtelo de nuevo.';

type Row = Awaited<ReturnType<PrismaService['generatedProjectDeployment']['findFirstOrThrow']>>;

// ADR-019 (DEC-157): a READY snapshot is deployed on this machine and published
// through Cloudflare Tunnel. Only one deployment of a project is active at a
// time. Deploying takes minutes, so it runs after the request returns.
@Injectable()
export class DeploymentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    @Inject(STORAGE_PROVIDER) private readonly storage: StorageProvider,
    @Optional() @Inject(DEPLOYMENT_PROVIDER) private readonly provider?: DeploymentProvider | null,
  ) {}

  async list(projectId: string): Promise<{ items: DeploymentResponse[] }> {
    const rows = await this.prisma.generatedProjectDeployment.findMany({
      where: { projectId },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });
    return { items: rows.map(map) };
  }

  async start(
    projectId: string,
    userId: string,
    input: StartDeploymentRequest,
  ): Promise<DeploymentResponse> {
    await assertCanGenerate(this.prisma, projectId, userId);
    const provider = this.requireProvider();
    const snapshot = await this.prisma.generatedProjectSnapshot.findFirst({
      where: { id: input.snapshotId, projectId },
    });
    if (!snapshot) throw new NotFoundException('Versión de software validada no encontrada.');
    if (
      await this.prisma.generatedProjectDeployment.findFirst({
        where: { projectId, status: 'STARTING' },
      })
    )
      throw new ConflictException('Ya hay un despliegue en preparación para este proyecto.');
    // The previous deployment of the project stops before a new one starts.
    for (const running of await this.prisma.generatedProjectDeployment.findMany({
      where: { projectId, status: 'RUNNING' },
    }))
      await this.stop(projectId, userId, running.id);
    const row = await this.prisma.$transaction(async (tx) => {
      const created = await tx.generatedProjectDeployment.create({
        data: {
          projectId,
          snapshotId: snapshot.id,
          tunnelMode: input.tunnelToken ? 'NAMED' : 'QUICK',
          createdByUserId: userId,
        },
      });
      await this.audit.record(
        {
          projectId,
          actorUserId: userId,
          action: 'DEPLOYMENT_STARTED',
          entityType: 'GENERATED_PROJECT_DEPLOYMENT',
          entityId: created.id,
          metadata: { snapshotId: snapshot.id, tunnelMode: created.tunnelMode },
        },
        tx,
      );
      return created;
    });
    void this.run(row.id, projectId, userId, snapshot, provider, input).catch(() => undefined);
    return map(row);
  }

  async stop(projectId: string, userId: string, id: string): Promise<DeploymentResponse> {
    await assertCanGenerate(this.prisma, projectId, userId);
    const row = await this.find(projectId, id);
    if (row.status !== 'RUNNING')
      throw new ConflictException('Solo se puede detener un despliegue en ejecución.');
    await this.requireProvider().stop(id);
    return this.finish(row, userId, 'DEPLOYMENT_STOPPED', { status: 'STOPPED' });
  }

  async resume(
    projectId: string,
    userId: string,
    id: string,
    input: ResumeDeploymentRequest,
  ): Promise<DeploymentResponse> {
    await assertCanGenerate(this.prisma, projectId, userId);
    const row = await this.find(projectId, id);
    if (row.status !== 'STOPPED')
      throw new ConflictException('Solo se puede iniciar un despliegue detenido.');
    if (
      await this.prisma.generatedProjectDeployment.findFirst({
        where: { projectId, status: { in: ['RUNNING', 'STARTING'] } },
      })
    )
      throw new ConflictException('Detenga primero el despliegue activo del proyecto.');
    try {
      const { publicUrl } = await this.requireProvider().start(id, input.tunnelToken);
      return this.finish(row, userId, 'DEPLOYMENT_RESUMED', {
        status: 'RUNNING',
        publicUrl,
        tunnelMode: input.tunnelToken ? 'NAMED' : 'QUICK',
        errorMessage: null,
      });
    } catch (error) {
      logger.warn(`Deployment "${id}" did not resume: ${describe(error)}`);
      throw new ServiceUnavailableException(DEPLOY_FAILED);
    }
  }

  // A deployment being prepared when the API stopped was cut off; whatever it
  // had created is removed so nothing stays exposed.
  async markInterrupted(bootedAt: Date): Promise<number> {
    const rows = await this.prisma.generatedProjectDeployment.findMany({
      where: { status: 'STARTING', updatedAt: { lt: bootedAt } },
      select: { id: true },
    });
    for (const row of rows) await this.provider?.remove(row.id).catch(() => undefined);
    const { count } = await this.prisma.generatedProjectDeployment.updateMany({
      where: { id: { in: rows.map((row) => row.id) }, status: 'STARTING' },
      data: { status: 'FAILED', errorMessage: INTERRUPTED_BY_RESTART },
    });
    return count;
  }

  private async run(
    id: string,
    projectId: string,
    userId: string,
    snapshot: { archiveStorageKey: string; archiveSha256: string; archiveSize: number },
    provider: DeploymentProvider,
    input: StartDeploymentRequest,
  ) {
    const row = await this.find(projectId, id);
    try {
      const files = await readSnapshotFiles(this.storage, snapshot);
      const result = await provider.deploy({
        deploymentId: id,
        files,
        initialPassword: input.initialPassword,
        tunnelToken: input.tunnelToken,
      });
      await this.finish(row, userId, 'DEPLOYMENT_RUNNING', {
        status: 'RUNNING',
        publicUrl: result.publicUrl,
        accounts: result.accounts,
      });
    } catch (error) {
      logger.warn(`Deployment "${id}" failed: ${describe(error)}`);
      await provider.remove(id).catch(() => undefined);
      await this.finish(row, userId, 'DEPLOYMENT_FAILED', {
        status: 'FAILED',
        errorMessage: DEPLOY_FAILED,
      });
    }
  }

  private async finish(
    row: Row,
    userId: string,
    action:
      'DEPLOYMENT_RUNNING' | 'DEPLOYMENT_FAILED' | 'DEPLOYMENT_STOPPED' | 'DEPLOYMENT_RESUMED',
    data: {
      status: 'RUNNING' | 'STOPPED' | 'FAILED';
      publicUrl?: string | null;
      accounts?: { role: string; identifier: string }[];
      errorMessage?: string | null;
      tunnelMode?: 'QUICK' | 'NAMED';
    },
  ): Promise<DeploymentResponse> {
    const updated = await this.prisma.$transaction(async (tx) => {
      const next = await tx.generatedProjectDeployment.update({ where: { id: row.id }, data });
      await this.audit.record(
        {
          projectId: row.projectId,
          actorUserId: userId,
          action,
          entityType: 'GENERATED_PROJECT_DEPLOYMENT',
          entityId: row.id,
          metadata: { status: data.status, publicUrl: next.publicUrl },
        },
        tx,
      );
      return next;
    });
    return map(updated);
  }

  private async find(projectId: string, id: string) {
    const row = await this.prisma.generatedProjectDeployment.findFirst({
      where: { id, projectId },
    });
    if (!row) throw new NotFoundException('Despliegue no encontrado.');
    return row;
  }

  private requireProvider(): DeploymentProvider {
    if (!this.provider)
      throw new ServiceUnavailableException('El despliegue no está disponible en este entorno.');
    return this.provider;
  }
}

const describe = (error: unknown) => (error instanceof Error ? error.message : 'unknown');

function map(row: Row): DeploymentResponse {
  return {
    id: row.id,
    snapshotId: row.snapshotId,
    status: row.status,
    tunnelMode: row.tunnelMode,
    publicUrl: row.publicUrl,
    accounts: row.accounts as { role: string; identifier: string }[],
    errorMessage: row.errorMessage,
    createdByUserId: row.createdByUserId,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
