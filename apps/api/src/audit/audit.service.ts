import { Global, Injectable, Module } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import type { Prisma } from '../generated/prisma/client';

export const AUDIT_ACTIONS = [
  'REQUIREMENT_GENERATION_STARTED',
  'REQUIREMENT_GENERATION_FINISHED',
  'STAGE_CONFIRMED_CURRENT',
  'PROJECT_WORKFLOW_ROUTE_CHANGED',
  'PROJECT_DETAILS_UPDATED',
  'WORKFLOW_RUN_STARTED',
  'WORKFLOW_RUN_FINISHED',
  'DEPENDENCY_PROPOSAL_CREATED',
  'DEPENDENCY_PROPOSAL_DECIDED',
  'GENERATION_PLAN_APPROVED',
  'CONCEPTUAL_DOMAIN_MODEL_APPROVED',
  'DESIGN_THEME_APPROVED',
  'CLASS_DIAGRAM_APPROVED',
  'DESIGN_BASELINE_APPROVED',
  'IMPLEMENTATION_PLAN_APPROVED',
  'GENERATION_RUN_STARTED',
  'GENERATION_RUN_FINISHED',
  'SANDBOX_RUN_STARTED',
  'SANDBOX_RUN_FINISHED',
  'AUTO_REPAIR_ROUND',
  'GENERATED_PROJECT_SNAPSHOT_CREATED',
  'GENERATED_PROJECT_SNAPSHOT_DOWNLOADED',
] as const;
export type AuditAction = (typeof AUDIT_ACTIONS)[number];

export interface AuditEventInput {
  projectId: string;
  actorUserId: string | null;
  action: AuditAction;
  entityType: string;
  entityId: string;
  // Non-sensitive context only (AGENTS.md §35): never secrets or raw payloads.
  metadata?: Prisma.InputJsonObject;
}

type AuditClient = Pick<Prisma.TransactionClient, 'auditEvent'>;

// Append-only audit trail. Pass the transaction client so the event commits
// (or rolls back) together with the change it records.
@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  async record(event: AuditEventInput, client: AuditClient = this.prisma): Promise<void> {
    await client.auditEvent.create({ data: { ...event, metadata: event.metadata ?? {} } });
  }
}

@Global()
@Module({ providers: [AuditService], exports: [AuditService] })
export class AuditModule {}
