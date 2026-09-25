import { Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import type {
  CreateProjectRequest,
  ProjectListResponse,
  ProjectResponse,
} from '@caseflow-ai/contracts';
import { PrismaService } from '../database/prisma.service';
import { toProjectResponse } from './projects.mapper';

@Injectable()
export class ProjectsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(input: CreateProjectRequest): Promise<ProjectResponse> {
    const workspace = await this.prisma.workspace.findUnique({
      where: { id: input.workspaceId },
      select: { id: true },
    });
    if (!workspace) {
      throw new NotFoundException('Workspace no encontrado.');
    }

    const project = await this.prisma.project.create({
      data: {
        workspaceId: input.workspaceId,
        name: input.name,
        description: input.description ?? null,
      },
    });
    return toProjectResponse(project);
  }

  async list(workspaceId: string, limit: number, offset: number): Promise<ProjectListResponse> {
    const projects = await this.prisma.project.findMany({
      where: { workspaceId },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      take: limit,
      skip: offset,
    });
    return { items: projects.map(toProjectResponse), limit, offset };
  }

  async get(projectId: string): Promise<ProjectResponse> {
    const project = await this.prisma.project.findUnique({ where: { id: projectId } });
    if (!project) {
      throw new NotFoundException('Proyecto no encontrado.');
    }
    return toProjectResponse(project);
  }

  // Hard delete — only permitted while the project has never had anything
  // approved (spec §31.3: approved/historical ArtifactVersions are never
  // deleted). A project in this state has no approved history worth
  // protecting, so a full cascade is safe. Every relation in the schema is
  // intentionally ON DELETE RESTRICT (no cascading FKs), so this walks the
  // dependency graph leaf-to-root inside one transaction instead of relying
  // on the database to cascade.
  async delete(projectId: string): Promise<void> {
    const project = await this.prisma.project.findUnique({ where: { id: projectId } });
    if (!project) throw new NotFoundException('Proyecto no encontrado.');

    const approvedCount = await this.prisma.artifactVersion.count({
      where: { projectId, status: 'APPROVED' },
    });
    if (approvedCount > 0) {
      throw new UnprocessableEntityException(
        'No se puede eliminar un proyecto con artefactos aprobados; el historial aprobado no puede borrarse.',
      );
    }

    await this.prisma.$transaction(async (tx) => {
      const p = projectId;

      // Requirements
      await tx.$executeRaw`DELETE FROM requirement_candidate_dependencies WHERE candidate_id IN (SELECT rc.id FROM requirement_candidates rc JOIN requirement_generations rg ON rg.id = rc.generation_id WHERE rg.project_id = ${p}) OR depends_on_candidate_id IN (SELECT rc.id FROM requirement_candidates rc JOIN requirement_generations rg ON rg.id = rc.generation_id WHERE rg.project_id = ${p})`;
      await tx.$executeRaw`DELETE FROM requirement_actors WHERE artifact_version_id IN (SELECT id FROM artifact_versions WHERE project_id = ${p})`;
      await tx.$executeRaw`DELETE FROM requirement_preconditions WHERE artifact_version_id IN (SELECT id FROM artifact_versions WHERE project_id = ${p})`;
      await tx.$executeRaw`DELETE FROM requirement_postconditions WHERE artifact_version_id IN (SELECT id FROM artifact_versions WHERE project_id = ${p})`;
      await tx.$executeRaw`DELETE FROM requirement_dependencies WHERE artifact_version_id IN (SELECT id FROM artifact_versions WHERE project_id = ${p})`;
      await tx.$executeRaw`DELETE FROM requirement_details WHERE artifact_version_id IN (SELECT id FROM artifact_versions WHERE project_id = ${p})`;
      await tx.$executeRaw`DELETE FROM requirement_candidates WHERE generation_id IN (SELECT id FROM requirement_generations WHERE project_id = ${p})`;
      await tx.$executeRaw`DELETE FROM requirement_generations WHERE project_id = ${p}`;

      // Use cases
      await tx.$executeRaw`DELETE FROM use_case_candidate_sources WHERE generation_id IN (SELECT id FROM use_case_generations WHERE project_id = ${p})`;
      await tx.$executeRaw`DELETE FROM use_case_requirement_links WHERE artifact_version_id IN (SELECT id FROM artifact_versions WHERE project_id = ${p})`;
      await tx.$executeRaw`DELETE FROM use_case_alternative_flow_steps WHERE alternative_flow_id IN (SELECT id FROM use_case_alternative_flows WHERE artifact_version_id IN (SELECT id FROM artifact_versions WHERE project_id = ${p}))`;
      await tx.$executeRaw`DELETE FROM use_case_alternative_flows WHERE artifact_version_id IN (SELECT id FROM artifact_versions WHERE project_id = ${p})`;
      await tx.$executeRaw`DELETE FROM use_case_main_flow_steps WHERE artifact_version_id IN (SELECT id FROM artifact_versions WHERE project_id = ${p})`;
      await tx.$executeRaw`DELETE FROM use_case_postconditions WHERE artifact_version_id IN (SELECT id FROM artifact_versions WHERE project_id = ${p})`;
      await tx.$executeRaw`DELETE FROM use_case_preconditions WHERE artifact_version_id IN (SELECT id FROM artifact_versions WHERE project_id = ${p})`;
      await tx.$executeRaw`DELETE FROM use_case_secondary_actors WHERE artifact_version_id IN (SELECT id FROM artifact_versions WHERE project_id = ${p})`;
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
      await tx.$executeRaw`DELETE FROM mockup_details WHERE artifact_version_id IN (SELECT id FROM artifact_versions WHERE project_id = ${p})`;

      // Sources
      await tx.$executeRaw`DELETE FROM source_report_details WHERE artifact_version_id IN (SELECT id FROM artifact_versions WHERE project_id = ${p})`;
      await tx.$executeRaw`DELETE FROM source_report_candidates WHERE project_id = ${p}`;
      await tx.$executeRaw`DELETE FROM source_details WHERE artifact_version_id IN (SELECT id FROM artifact_versions WHERE project_id = ${p})`;

      // Project context
      await tx.$executeRaw`DELETE FROM project_context_sources WHERE project_context_version_id IN (SELECT id FROM artifact_versions WHERE project_id = ${p})`;
      await tx.$executeRaw`DELETE FROM project_context_actors WHERE artifact_version_id IN (SELECT id FROM artifact_versions WHERE project_id = ${p})`;
      await tx.$executeRaw`DELETE FROM project_context_needs WHERE artifact_version_id IN (SELECT id FROM artifact_versions WHERE project_id = ${p})`;
      await tx.$executeRaw`DELETE FROM project_context_constraints WHERE artifact_version_id IN (SELECT id FROM artifact_versions WHERE project_id = ${p})`;
      await tx.$executeRaw`DELETE FROM project_context_business_rules WHERE artifact_version_id IN (SELECT id FROM artifact_versions WHERE project_id = ${p})`;
      await tx.$executeRaw`DELETE FROM project_context_scope_items WHERE artifact_version_id IN (SELECT id FROM artifact_versions WHERE project_id = ${p})`;
      await tx.$executeRaw`DELETE FROM project_context_details WHERE artifact_version_id IN (SELECT id FROM artifact_versions WHERE project_id = ${p})`;

      // AI runs (referenced by many of the tables already cleared above)
      await tx.$executeRaw`DELETE FROM ai_runs WHERE project_id = ${p}`;

      // Artifact versions and artifacts
      await tx.$executeRaw`DELETE FROM artifact_versions WHERE project_id = ${p}`;
      await tx.$executeRaw`DELETE FROM artifacts WHERE project_id = ${p}`;

      // Project-level bookkeeping
      await tx.$executeRaw`DELETE FROM project_code_counters WHERE project_id = ${p}`;
      await tx.$executeRaw`DELETE FROM projects WHERE id = ${p}`;
    });
  }
}
