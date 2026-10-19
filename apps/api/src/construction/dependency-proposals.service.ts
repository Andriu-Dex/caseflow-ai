import {
  ConflictException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { findCatalogDependency, findTargetTemplate } from '@caseflow-ai/domain';
import type {
  CreateDependencyProposalRequest,
  DecideDependencyProposalRequest,
  DependencyProposalResponse,
} from '@caseflow-ai/contracts';
import { PrismaService } from '../database/prisma.service';
import { AuditService } from '../audit/audit.service';
import type { DependencyProposal } from '../generated/prisma/client';

const isUniqueViolation = (error: unknown): boolean =>
  typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2002';

// Project-scoped exceptions to a template's Approved Dependency Catalog
// (spec §155): DependencyProposal → human decision → approved for this project.
@Injectable()
export class DependencyProposalsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async create(
    projectId: string,
    requestedByUserId: string | null,
    input: CreateDependencyProposalRequest,
  ): Promise<DependencyProposalResponse> {
    const template = findTargetTemplate(
      input.targetTemplateIdentifier,
      input.targetTemplateVersion,
    );
    if (!template)
      throw new UnprocessableEntityException('La plantilla indicada no está soportada.');
    if (findCatalogDependency(template, input.packageName))
      throw new ConflictException(
        'Este paquete ya forma parte del catálogo aprobado de la plantilla.',
      );
    if (!(await this.prisma.project.findUnique({ where: { id: projectId }, select: { id: true } })))
      throw new NotFoundException('Proyecto no encontrado.');
    try {
      const proposal = await this.prisma.$transaction(async (tx) => {
        const created = await tx.dependencyProposal.create({
          data: { projectId, requestedByUserId, ...input },
        });
        await this.audit.record(
          {
            projectId,
            actorUserId: requestedByUserId,
            action: 'DEPENDENCY_PROPOSAL_CREATED',
            entityType: 'DEPENDENCY_PROPOSAL',
            entityId: created.id,
            metadata: { packageName: created.packageName, version: created.version },
          },
          tx,
        );
        return created;
      });
      return this.map(proposal);
    } catch (error) {
      if (isUniqueViolation(error))
        throw new ConflictException(
          'Ya existe una propuesta pendiente o aprobada para este paquete.',
        );
      throw error;
    }
  }

  async list(projectId: string): Promise<{ items: DependencyProposalResponse[] }> {
    const rows = await this.prisma.dependencyProposal.findMany({
      where: { projectId },
      orderBy: { createdAt: 'desc' },
    });
    return { items: rows.map((row) => this.map(row)) };
  }

  async decide(
    projectId: string,
    proposalId: string,
    decidedByUserId: string,
    input: DecideDependencyProposalRequest,
  ): Promise<DependencyProposalResponse> {
    const decided = await this.prisma.$transaction(async (tx) => {
      // Conditional update: two concurrent decisions cannot both succeed.
      const { count } = await tx.dependencyProposal.updateMany({
        where: { id: proposalId, projectId, status: 'PENDING' },
        data: {
          status: input.decision,
          decidedByUserId,
          decidedAt: new Date(),
          decisionNote: input.note ?? null,
        },
      });
      const row = await tx.dependencyProposal.findFirst({ where: { id: proposalId, projectId } });
      if (!row) throw new NotFoundException('Propuesta no encontrada.');
      if (!count) throw new ConflictException('Esta propuesta ya fue decidida.');
      await this.audit.record(
        {
          projectId,
          actorUserId: decidedByUserId,
          action: 'DEPENDENCY_PROPOSAL_DECIDED',
          entityType: 'DEPENDENCY_PROPOSAL',
          entityId: row.id,
          metadata: { packageName: row.packageName, version: row.version, decision: row.status },
        },
        tx,
      );
      return row;
    });
    return this.map(decided);
  }

  private map(row: DependencyProposal): DependencyProposalResponse {
    return {
      id: row.id,
      projectId: row.projectId,
      targetTemplateIdentifier: row.targetTemplateIdentifier,
      targetTemplateVersion: row.targetTemplateVersion,
      packageName: row.packageName,
      version: row.version,
      layer: row.layer,
      dev: row.dev,
      justification: row.justification,
      status: row.status,
      requestedByUserId: row.requestedByUserId,
      decidedByUserId: row.decidedByUserId,
      decidedAt: row.decidedAt?.toISOString() ?? null,
      decisionNote: row.decisionNote,
      createdAt: row.createdAt.toISOString(),
    };
  }
}
