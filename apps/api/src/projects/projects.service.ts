import {
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
  UnprocessableEntityException,
} from '@nestjs/common';
import type { StorageProvider } from '@caseflow-ai/integrations';
import {
  WORKFLOW_ROUTES,
  type CreateProjectRequest,
  type WorkflowRoute,
  type ProjectListResponse,
  type ProjectResponse,
  type ProjectLanguage,
  type listProjectsQuerySchema,
} from '@caseflow-ai/contracts';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../database/prisma.service';
import { toProjectResponse } from './projects.mapper';
import { STORAGE_PROVIDER } from '../sources/storage-provider.token';
import type { Prisma } from '../generated/prisma/client';
import type { z } from 'zod';

type ListProjectsQueryOutput = z.output<typeof listProjectsQuerySchema>;
const logger = new Logger('ProjectsService');

@Injectable()
export class ProjectsService {
  private readonly audit: AuditService;

  constructor(
    private readonly prisma: PrismaService,
    // Injected by Nest; code constructing the service directly still audits.
    @Optional() audit?: AuditService,
    // Files of a deleted project; optional so code without storage still works.
    @Optional() @Inject(STORAGE_PROVIDER) private readonly storage?: StorageProvider,
  ) {
    this.audit = audit ?? new AuditService(prisma);
  }

  async create(input: CreateProjectRequest, userId: string): Promise<ProjectResponse> {
    const workspace = await this.prisma.workspace.findUnique({
      where: { id: input.workspaceId },
      select: { id: true },
    });
    if (!workspace) {
      throw new NotFoundException('Workspace no encontrado.');
    }

    const project = await this.prisma.$transaction(async (tx) => {
      const newProject = await tx.project.create({
        data: {
          workspaceId: input.workspaceId,
          name: input.name,
          description: input.description ?? null,
          workflowRoute: input.workflowRoute ?? 'FULL',
        },
      });
      await tx.projectMembership.create({
        data: {
          projectId: newProject.id,
          userId: userId,
          role: 'OWNER',
        },
      });
      return newProject;
    });
    return toProjectResponse(project, false);
  }

  async list(query: ListProjectsQueryOutput, userId: string): Promise<ProjectListResponse> {
    const { workspaceId, limit, offset, search, status, workflowRoute, sort } = query;
    const where: Prisma.ProjectWhereInput = {
      workspaceId,
      projectMemberships: { some: { userId } },
      ...(status === 'ACTIVE' ? { archivedAt: null } : {}),
      ...(status === 'ARCHIVED' ? { archivedAt: { not: null } } : {}),
      ...(workflowRoute ? { workflowRoute } : {}),
      ...(search
        ? {
            OR: [
              { name: { contains: search, mode: 'insensitive' } },
              { description: { contains: search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };
    // The id tie-breaker keeps pages stable when sort values repeat.
    const orderBy: Prisma.ProjectOrderByWithRelationInput[] = {
      OLDEST: [{ createdAt: 'asc' }, { id: 'asc' }],
      RECENT: [{ createdAt: 'desc' }, { id: 'desc' }],
      UPDATED: [{ updatedAt: 'desc' }, { id: 'desc' }],
      NAME: [{ name: 'asc' }, { id: 'asc' }],
    }[sort] as Prisma.ProjectOrderByWithRelationInput[];
    const [projects, total] = await Promise.all([
      this.prisma.project.findMany({ where, orderBy, take: limit, skip: offset }),
      this.prisma.project.count({ where }),
    ]);
    const approvedProjectIds = await this.projectIdsWithApprovedArtifacts(
      projects.map((p) => p.id),
    );
    return {
      items: projects.map((p) => toProjectResponse(p, approvedProjectIds.has(p.id))),
      total,
      limit,
      offset,
    };
  }

  async get(projectId: string): Promise<ProjectResponse> {
    const project = await this.prisma.project.findUnique({ where: { id: projectId } });
    if (!project) {
      throw new NotFoundException('Proyecto no encontrado.');
    }
    return toProjectResponse(project, await this.hasApprovedArtifacts(projectId));
  }

  private async hasApprovedArtifacts(projectId: string): Promise<boolean> {
    const count = await this.prisma.artifactVersion.count({
      where: { projectId, status: 'APPROVED' },
    });
    return count > 0;
  }

  private async projectIdsWithApprovedArtifacts(projectIds: string[]): Promise<Set<string>> {
    if (projectIds.length === 0) return new Set();
    const rows = await this.prisma.artifactVersion.findMany({
      where: { projectId: { in: projectIds }, status: 'APPROVED' },
      select: { projectId: true },
      distinct: ['projectId'],
    });
    return new Set(rows.map((r) => r.projectId));
  }

  // Archival is the alternative to deletion once a project has approved
  // history (spec §87: "fuentes utilizadas → archivar antes que borrar").
  // Purely additive on the Project row — never touches any ArtifactVersion,
  // so it needs no immutability exception.
  async archive(projectId: string): Promise<ProjectResponse> {
    const project = await this.prisma.project.findUnique({ where: { id: projectId } });
    if (!project) throw new NotFoundException('Proyecto no encontrado.');
    if (project.archivedAt)
      throw new UnprocessableEntityException('El proyecto ya está archivado.');

    const updated = await this.prisma.project.update({
      where: { id: projectId },
      data: { archivedAt: new Date() },
    });
    return toProjectResponse(updated, await this.hasApprovedArtifacts(projectId));
  }

  // Undoes archive(): the project becomes active again, history untouched.
  async unarchive(projectId: string): Promise<ProjectResponse> {
    const project = await this.prisma.project.findUnique({ where: { id: projectId } });
    if (!project) throw new NotFoundException('Proyecto no encontrado.');
    if (!project.archivedAt)
      throw new UnprocessableEntityException('El proyecto no está archivado.');
    const updated = await this.prisma.project.update({
      where: { id: projectId },
      data: { archivedAt: null },
    });
    return toProjectResponse(updated, await this.hasApprovedArtifacts(projectId));
  }

  // DEC-116: a route only moves up (BUILD_ONLY -> EXPRESS -> FULL); the
  // database enforces it too. Every change is audited.
  async upgradeWorkflowRoute(
    projectId: string,
    workflowRoute: WorkflowRoute,
    userId: string,
  ): Promise<ProjectResponse> {
    const project = await this.prisma.project.findUnique({ where: { id: projectId } });
    if (!project) throw new NotFoundException('Proyecto no encontrado.');
    if (WORKFLOW_ROUTES.indexOf(workflowRoute) <= WORKFLOW_ROUTES.indexOf(project.workflowRoute))
      throw new UnprocessableEntityException(
        'La ruta de trabajo solo puede subir: de Solo construcción a Exprés y de Exprés a Completa.',
      );
    const updated = await this.prisma.$transaction(async (tx) => {
      const row = await tx.project.update({ where: { id: projectId }, data: { workflowRoute } });
      await this.audit.record(
        {
          projectId,
          actorUserId: userId,
          action: 'PROJECT_WORKFLOW_ROUTE_CHANGED',
          entityType: 'PROJECT',
          entityId: projectId,
          metadata: { from: project.workflowRoute, to: workflowRoute },
        },
        tx,
      );
      return row;
    });
    return toProjectResponse(updated, await this.hasApprovedArtifacts(projectId));
  }

  async update(
    projectId: string,
    input: { name: string; description?: string | null },
    userId: string,
  ): Promise<ProjectResponse> {
    const project = await this.prisma.project.findUnique({ where: { id: projectId } });
    if (!project) throw new NotFoundException('Proyecto no encontrado.');
    const description = input.description || null;
    const updated = await this.prisma.$transaction(async (tx) => {
      const row = await tx.project.update({
        where: { id: projectId },
        data: { name: input.name, description },
      });
      await this.audit.record(
        {
          projectId,
          actorUserId: userId,
          action: 'PROJECT_DETAILS_UPDATED',
          entityType: 'PROJECT',
          entityId: projectId,
          metadata: {
            from: { name: project.name, description: project.description },
            to: { name: input.name, description },
          },
        },
        tx,
      );
      return row;
    });
    return toProjectResponse(updated, await this.hasApprovedArtifacts(projectId));
  }

  async updateLanguage(projectId: string, language: ProjectLanguage): Promise<ProjectResponse> {
    const project = await this.prisma.project.findUnique({ where: { id: projectId } });
    if (!project) throw new NotFoundException('Proyecto no encontrado.');
    const updated = await this.prisma.project.update({
      where: { id: projectId },
      data: { language },
    });
    return toProjectResponse(updated, await this.hasApprovedArtifacts(projectId));
  }

  // Permanent deletion of a whole project (DEC-134, spec §87), approved
  // history included: only its owner or the workspace's owner or admins, and
  // only after typing its exact name, checked here and not only in the page.
  // Every relation in the schema is ON DELETE RESTRICT and the history is
  // guarded by triggers, so this walks the dependency graph leaf-to-root in
  // one transaction that marks itself as a project purge, the only thing
  // those triggers let through. Who deleted it is kept in project_deletions,
  // since the project's own audit trail goes with it.
  async delete(projectId: string, confirmName: string, userId: string): Promise<void> {
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
      include: {
        projectMemberships: { where: { userId }, select: { role: true } },
        workspace: { select: { memberships: { where: { userId }, select: { role: true } } } },
      },
    });
    if (!project) throw new NotFoundException('Proyecto no encontrado.');
    const allowed =
      project.projectMemberships.some((m) => m.role === 'OWNER') ||
      project.workspace.memberships.some((m) => m.role === 'OWNER' || m.role === 'ADMIN');
    if (!allowed)
      throw new ForbiddenException(
        'Solo el propietario del proyecto o el propietario o un administrador del espacio de trabajo pueden eliminarlo.',
      );
    if (confirmName.trim() !== project.name)
      throw new UnprocessableEntityException(
        'El nombre escrito no coincide con el del proyecto. Escríbalo exactamente para confirmar.',
      );
    const files = await this.storedFiles(projectId);

    await this.prisma.$transaction(
      async (tx) => {
        const p = projectId;
        // Only this transaction may remove the guarded history (DEC-134).
        await tx.$queryRaw`SELECT set_config('caseflow.project_purge', 'on', true)`;

        // Construction output (references design baselines and plan versions)
        await tx.$executeRaw`DELETE FROM code_trace_links WHERE generated_file_id IN (SELECT gf.id FROM generated_files gf JOIN generation_runs gr ON gr.id = gf.generation_run_id WHERE gr.project_id = ${p})`;
        await tx.$executeRaw`DELETE FROM repair_findings WHERE auto_repair_attempt_id IN (SELECT a.id FROM auto_repair_attempts a JOIN generation_runs gr ON gr.id = a.generation_run_id WHERE gr.project_id = ${p})`;
        await tx.$executeRaw`DELETE FROM repair_patches WHERE auto_repair_attempt_id IN (SELECT a.id FROM auto_repair_attempts a JOIN generation_runs gr ON gr.id = a.generation_run_id WHERE gr.project_id = ${p})`;
        await tx.$executeRaw`DELETE FROM generated_project_snapshots WHERE project_id = ${p}`;
        await tx.$executeRaw`DELETE FROM auto_repair_attempts WHERE generation_run_id IN (SELECT id FROM generation_runs WHERE project_id = ${p})`;
        await tx.$executeRaw`DELETE FROM sandbox_stage_results WHERE sandbox_run_id IN (SELECT id FROM sandbox_runs WHERE project_id = ${p})`;
        await tx.$executeRaw`DELETE FROM sandbox_runs WHERE project_id = ${p}`;
        await tx.$executeRaw`DELETE FROM generated_files WHERE generation_run_id IN (SELECT id FROM generation_runs WHERE project_id = ${p})`;
        await tx.$executeRaw`DELETE FROM generation_runs WHERE project_id = ${p}`;
        await tx.$executeRaw`DELETE FROM dependency_proposals WHERE project_id = ${p}`;

        // Baselines
        await tx.$executeRaw`DELETE FROM design_baseline_entries WHERE baseline_id IN (SELECT id FROM design_baselines WHERE project_id = ${p})`;
        await tx.$executeRaw`DELETE FROM design_baselines WHERE project_id = ${p}`;
        await tx.$executeRaw`DELETE FROM project_baseline_entries WHERE baseline_id IN (SELECT id FROM project_baselines WHERE project_id = ${p})`;
        await tx.$executeRaw`DELETE FROM project_baselines WHERE project_id = ${p}`;

        // Requirements
        await tx.$executeRaw`DELETE FROM requirement_candidate_dependencies WHERE candidate_id IN (SELECT rc.id FROM requirement_candidates rc JOIN requirement_generations rg ON rg.id = rc.generation_id WHERE rg.project_id = ${p}) OR depends_on_candidate_id IN (SELECT rc.id FROM requirement_candidates rc JOIN requirement_generations rg ON rg.id = rc.generation_id WHERE rg.project_id = ${p})`;
        await tx.$executeRaw`DELETE FROM requirement_actors WHERE artifact_version_id IN (SELECT id FROM artifact_versions WHERE project_id = ${p})`;
        await tx.$executeRaw`DELETE FROM requirement_preconditions WHERE artifact_version_id IN (SELECT id FROM artifact_versions WHERE project_id = ${p})`;
        await tx.$executeRaw`DELETE FROM requirement_postconditions WHERE artifact_version_id IN (SELECT id FROM artifact_versions WHERE project_id = ${p})`;
        await tx.$executeRaw`DELETE FROM requirement_dependencies WHERE artifact_version_id IN (SELECT id FROM artifact_versions WHERE project_id = ${p})`;
        await tx.$executeRaw`DELETE FROM requirement_context_links WHERE artifact_version_id IN (SELECT id FROM artifact_versions WHERE project_id = ${p})`;
        await tx.$executeRaw`DELETE FROM requirement_details WHERE artifact_version_id IN (SELECT id FROM artifact_versions WHERE project_id = ${p})`;
        await tx.$executeRaw`DELETE FROM requirement_generation_parts WHERE job_id IN (SELECT id FROM requirement_generation_jobs WHERE project_id = ${p})`;
        await tx.$executeRaw`DELETE FROM requirement_generation_jobs WHERE project_id = ${p}`;
        await tx.$executeRaw`DELETE FROM requirement_candidates WHERE generation_id IN (SELECT id FROM requirement_generations WHERE project_id = ${p})`;
        await tx.$executeRaw`DELETE FROM requirement_generations WHERE project_id = ${p}`;

        // Use cases
        await tx.$executeRaw`DELETE FROM structured_generation_parts WHERE job_id IN (SELECT id FROM structured_generation_jobs WHERE project_id = ${p})`;
        await tx.$executeRaw`DELETE FROM structured_generation_job_sources WHERE job_id IN (SELECT id FROM structured_generation_jobs WHERE project_id = ${p})`;
        await tx.$executeRaw`DELETE FROM structured_generation_jobs WHERE project_id = ${p}`;
        await tx.$executeRaw`DELETE FROM use_case_generation_parts WHERE job_id IN (SELECT id FROM use_case_generation_jobs WHERE project_id = ${p})`;
        await tx.$executeRaw`DELETE FROM use_case_generation_job_sources WHERE job_id IN (SELECT id FROM use_case_generation_jobs WHERE project_id = ${p})`;
        await tx.$executeRaw`DELETE FROM use_case_generation_jobs WHERE project_id = ${p}`;
        await tx.$executeRaw`DELETE FROM use_case_candidate_sources WHERE generation_id IN (SELECT id FROM use_case_generations WHERE project_id = ${p})`;
        await tx.$executeRaw`DELETE FROM use_case_requirement_links WHERE artifact_version_id IN (SELECT id FROM artifact_versions WHERE project_id = ${p})`;
        await tx.$executeRaw`DELETE FROM use_case_alternative_flow_steps WHERE alternative_flow_id IN (SELECT id FROM use_case_alternative_flows WHERE artifact_version_id IN (SELECT id FROM artifact_versions WHERE project_id = ${p}))`;
        await tx.$executeRaw`DELETE FROM use_case_alternative_flows WHERE artifact_version_id IN (SELECT id FROM artifact_versions WHERE project_id = ${p})`;
        await tx.$executeRaw`DELETE FROM use_case_main_flow_steps WHERE artifact_version_id IN (SELECT id FROM artifact_versions WHERE project_id = ${p})`;
        await tx.$executeRaw`DELETE FROM use_case_postconditions WHERE artifact_version_id IN (SELECT id FROM artifact_versions WHERE project_id = ${p})`;
        await tx.$executeRaw`DELETE FROM use_case_preconditions WHERE artifact_version_id IN (SELECT id FROM artifact_versions WHERE project_id = ${p})`;
        await tx.$executeRaw`DELETE FROM use_case_secondary_actors WHERE artifact_version_id IN (SELECT id FROM artifact_versions WHERE project_id = ${p})`;
        await tx.$executeRaw`DELETE FROM use_case_relations WHERE artifact_version_id IN (SELECT id FROM artifact_versions WHERE project_id = ${p})`;
        await tx.$executeRaw`DELETE FROM use_case_details WHERE artifact_version_id IN (SELECT id FROM artifact_versions WHERE project_id = ${p})`;
        await tx.$executeRaw`DELETE FROM use_case_candidates WHERE generation_id IN (SELECT id FROM use_case_generations WHERE project_id = ${p})`;
        await tx.$executeRaw`DELETE FROM use_case_generation_sources WHERE generation_id IN (SELECT id FROM use_case_generations WHERE project_id = ${p})`;
        await tx.$executeRaw`DELETE FROM use_case_generations WHERE project_id = ${p}`;

        // Data model
        await tx.$executeRaw`DELETE FROM data_model_relationships WHERE artifact_version_id IN (SELECT id FROM artifact_versions WHERE project_id = ${p})`;
        await tx.$executeRaw`DELETE FROM data_model_attributes WHERE entity_id IN (SELECT id FROM data_model_entities WHERE artifact_version_id IN (SELECT id FROM artifact_versions WHERE project_id = ${p}))`;
        await tx.$executeRaw`DELETE FROM data_model_entities WHERE artifact_version_id IN (SELECT id FROM artifact_versions WHERE project_id = ${p})`;
        await tx.$executeRaw`DELETE FROM data_model_details WHERE artifact_version_id IN (SELECT id FROM artifact_versions WHERE project_id = ${p})`;
        await tx.$executeRaw`DELETE FROM data_model_candidates WHERE generation_id IN (SELECT id FROM data_model_generations WHERE project_id = ${p})`;
        await tx.$executeRaw`DELETE FROM data_model_generation_sources WHERE generation_id IN (SELECT id FROM data_model_generations WHERE project_id = ${p})`;
        await tx.$executeRaw`DELETE FROM data_model_generations WHERE project_id = ${p}`;

        // Diagrams
        await tx.$executeRaw`DELETE FROM diagram_source_versions WHERE diagram_version_id IN (SELECT id FROM artifact_versions WHERE project_id = ${p})`;
        await tx.$executeRaw`DELETE FROM diagram_details WHERE artifact_version_id IN (SELECT id FROM artifact_versions WHERE project_id = ${p})`;

        // Structured analysis (Navigation / Software / System Architecture / UI Blueprint)
        await tx.$executeRaw`DELETE FROM structured_analysis_details WHERE artifact_version_id IN (SELECT id FROM artifact_versions WHERE project_id = ${p})`;
        await tx.$executeRaw`DELETE FROM structured_analysis_candidates WHERE generation_id IN (SELECT id FROM structured_analysis_generations WHERE project_id = ${p})`;
        await tx.$executeRaw`DELETE FROM structured_analysis_generation_sources WHERE generation_id IN (SELECT id FROM structured_analysis_generations WHERE project_id = ${p})`;
        await tx.$executeRaw`DELETE FROM structured_analysis_generations WHERE project_id = ${p}`;

        // Mockups
        await tx.$executeRaw`DELETE FROM mockup_screen_details WHERE mockup_version_id IN (SELECT id FROM artifact_versions WHERE project_id = ${p})`;
        await tx.$executeRaw`DELETE FROM mockup_details WHERE artifact_version_id IN (SELECT id FROM artifact_versions WHERE project_id = ${p})`;
        await tx.$executeRaw`DELETE FROM mockup_generation_jobs WHERE project_id = ${p}`;

        // Sources
        await tx.$executeRaw`DELETE FROM source_report_details WHERE artifact_version_id IN (SELECT id FROM artifact_versions WHERE project_id = ${p})`;
        await tx.$executeRaw`DELETE FROM source_report_job_parts WHERE job_id IN (SELECT id FROM source_report_jobs WHERE project_id = ${p})`;
        await tx.$executeRaw`DELETE FROM source_report_jobs WHERE project_id = ${p}`;
        await tx.$executeRaw`DELETE FROM source_processing_jobs WHERE project_id = ${p}`;
        await tx.$executeRaw`DELETE FROM source_report_candidates WHERE project_id = ${p}`;
        // Indexed sections (DEC-127) have no foreign key: nothing would stop them
        // from staying behind.
        await tx.$executeRaw`DELETE FROM source_fragments WHERE project_id = ${p}`;
        await tx.$executeRaw`DELETE FROM source_details WHERE artifact_version_id IN (SELECT id FROM artifact_versions WHERE project_id = ${p})`;

        // Project context
        await tx.$executeRaw`DELETE FROM project_context_sources WHERE project_context_version_id IN (SELECT id FROM artifact_versions WHERE project_id = ${p})`;
        await tx.$executeRaw`DELETE FROM project_context_actors WHERE artifact_version_id IN (SELECT id FROM artifact_versions WHERE project_id = ${p})`;
        await tx.$executeRaw`DELETE FROM project_context_needs WHERE artifact_version_id IN (SELECT id FROM artifact_versions WHERE project_id = ${p})`;
        await tx.$executeRaw`DELETE FROM project_context_constraints WHERE artifact_version_id IN (SELECT id FROM artifact_versions WHERE project_id = ${p})`;
        await tx.$executeRaw`DELETE FROM project_context_business_rules WHERE artifact_version_id IN (SELECT id FROM artifact_versions WHERE project_id = ${p})`;
        await tx.$executeRaw`DELETE FROM project_context_scope_items WHERE artifact_version_id IN (SELECT id FROM artifact_versions WHERE project_id = ${p})`;
        await tx.$executeRaw`DELETE FROM project_context_details WHERE artifact_version_id IN (SELECT id FROM artifact_versions WHERE project_id = ${p})`;

        await tx.$executeRaw`DELETE FROM context_generation_jobs WHERE project_id = ${p}`;
        await tx.$executeRaw`DELETE FROM project_context_candidates WHERE project_id = ${p}`;

        // The project's own audit trail
        await tx.$executeRaw`DELETE FROM audit_events WHERE project_id = ${p}`;

        // AI runs (referenced by many of the tables already cleared above)
        await tx.$executeRaw`DELETE FROM ai_runs WHERE project_id = ${p}`;

        // Artifact versions and artifacts
        await tx.$executeRaw`DELETE FROM artifact_versions WHERE project_id = ${p}`;
        await tx.$executeRaw`DELETE FROM artifacts WHERE project_id = ${p}`;

        // Route orchestrations that stopped before anything was approved
        await tx.$executeRaw`DELETE FROM workflow_run_stages WHERE run_id IN (SELECT id FROM workflow_runs WHERE project_id = ${p})`;
        await tx.$executeRaw`DELETE FROM workflow_runs WHERE project_id = ${p}`;

        // Project-level bookkeeping
        await tx.$executeRaw`DELETE FROM project_code_counters WHERE project_id = ${p}`;
        await tx.$executeRaw`DELETE FROM project_memberships WHERE project_id = ${p}`;
        await tx.$executeRaw`DELETE FROM stage_confirmations WHERE project_id = ${p}`;
        await tx.$executeRaw`DELETE FROM projects WHERE id = ${p}`;

        await tx.projectDeletion.create({
          data: {
            workspaceId: project.workspaceId,
            projectId,
            projectName: project.name,
            deletedByUserId: userId,
          },
        });
      },
      // A large project takes more than Prisma's default 5 s.
      { timeout: 120_000 },
    );

    // Only after the rows are gone; a file left behind is unreachable, so a
    // failure is logged, never undoing the deletion.
    for (const key of files)
      await this.storage
        ?.deleteObject(key)
        .catch((error: unknown) =>
          logger.warn(`Could not delete file of deleted project: ${String(error)}`),
        );
  }

  // Keys of every file the project stored: sources, mockup screens and
  // generated project archives.
  private async storedFiles(projectId: string): Promise<string[]> {
    const rows = await this.prisma.$queryRaw<{ key: string }[]>`
      SELECT storage_key AS key FROM source_details
        WHERE storage_key IS NOT NULL AND artifact_version_id IN (SELECT id FROM artifact_versions WHERE project_id = ${projectId})
      UNION SELECT image_storage_key FROM mockup_screen_details
        WHERE mockup_version_id IN (SELECT id FROM artifact_versions WHERE project_id = ${projectId})
      UNION SELECT html_storage_key FROM mockup_screen_details
        WHERE mockup_version_id IN (SELECT id FROM artifact_versions WHERE project_id = ${projectId})
      UNION SELECT archive_storage_key FROM generated_project_snapshots WHERE project_id = ${projectId}`;
    return rows.map((row) => row.key);
  }
}
