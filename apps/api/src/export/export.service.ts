import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { DataModelsService } from '../data-models/data-models.service';
import { FirstDeliverableSnapshotService } from '../first-deliverable/first-deliverable-snapshot.service';
import { MockupsService } from '../mockups/mockups.service';
import { ProjectContextService } from '../project-context/project-context.service';
import { ReadinessService } from '../readiness/readiness.service';
import { RequirementsService } from '../requirements/requirements.service';
import { SourcesService } from '../sources/sources.service';
import { StalenessService } from '../staleness/staleness.service';
import { StructuredAnalysisService } from '../structured-analysis/structured-analysis.service';
import { TraceabilityService } from '../traceability/traceability.service';
import { UseCasesService } from '../use-cases/use-cases.service';

// Builds the First Deliverable Export snapshot (spec Phase H): a read-only
// composition of already-approved authoritative state, reusing each feature
// service's own mapping instead of re-querying/re-mapping from Prisma, and
// delegating "current authoritative version" selection exclusively to
// FirstDeliverableSnapshotService — the same policy Readiness uses — so
// selection logic is never duplicated across the two consumers.
@Injectable()
export class ExportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly snapshot: FirstDeliverableSnapshotService,
    private readonly sources: SourcesService,
    private readonly context: ProjectContextService,
    private readonly requirements: RequirementsService,
    private readonly useCases: UseCasesService,
    private readonly dataModels: DataModelsService,
    private readonly structuredAnalysis: StructuredAnalysisService,
    private readonly mockups: MockupsService,
    private readonly readiness: ReadinessService,
    private readonly staleness: StalenessService,
    private readonly traceability: TraceabilityService,
  ) {}

  async buildSnapshot(projectId: string) {
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
      select: { name: true },
    });
    if (!project) throw new NotFoundException('Proyecto no encontrado.');

    const [
      sourcesList,
      requirementsList,
      useCasesList,
      contextResult,
      dataModelResult,
      navResult,
      swResult,
      sysResult,
      blueprintResult,
      readinessResult,
      stalenessEntries,
      traceabilityGraph,
    ] = await Promise.all([
      this.sources.list(projectId),
      this.requirements.listApproved(projectId),
      this.useCases.listApproved(projectId),
      this.snapshot.approvedArtifactVersion(projectId, 'PROJECT_CONTEXT'),
      this.snapshot.approvedArtifactVersion(projectId, 'DATA_MODEL'),
      this.snapshot.approvedArtifactVersion(projectId, 'NAVIGATION_TREE'),
      this.snapshot.approvedArtifactVersion(projectId, 'SOFTWARE_ARCHITECTURE'),
      this.snapshot.approvedArtifactVersion(projectId, 'SYSTEM_ARCHITECTURE'),
      this.snapshot.approvedArtifactVersion(projectId, 'UI_BLUEPRINT'),
      this.readiness.evaluate(projectId),
      this.staleness.analyzeProject(projectId),
      this.traceability.buildGraph(projectId),
    ]);

    const [context, dataModel, navigation, softwareArchitecture, systemArchitecture, uiBlueprint] =
      await Promise.all([
        contextResult
          ? this.context.getVersion(projectId, contextResult.artifactId, contextResult.versionId)
          : null,
        dataModelResult
          ? this.dataModels.getVersion(
              projectId,
              dataModelResult.artifactId,
              dataModelResult.versionId,
            )
          : null,
        navResult
          ? this.structuredAnalysis.getVersion(
              projectId,
              'NAVIGATION_TREE',
              navResult.artifactId,
              navResult.versionId,
            )
          : null,
        swResult
          ? this.structuredAnalysis.getVersion(
              projectId,
              'SOFTWARE_ARCHITECTURE',
              swResult.artifactId,
              swResult.versionId,
            )
          : null,
        sysResult
          ? this.structuredAnalysis.getVersion(
              projectId,
              'SYSTEM_ARCHITECTURE',
              sysResult.artifactId,
              sysResult.versionId,
            )
          : null,
        blueprintResult
          ? this.structuredAnalysis.getVersion(
              projectId,
              'UI_BLUEPRINT',
              blueprintResult.artifactId,
              blueprintResult.versionId,
            )
          : null,
      ]);

    const [erDiagram, navigationDiagram, softwareArchitectureDiagram, systemArchitectureDiagram] =
      await Promise.all([
        dataModelResult
          ? this.dataModels
              .getERDiagramForVersion(
                projectId,
                dataModelResult.artifactId,
                dataModelResult.versionId,
              )
              .catch(() => null)
          : null,
        navResult
          ? this.structuredAnalysis
              .getDiagramForVersion(
                projectId,
                'NAVIGATION_TREE',
                navResult.artifactId,
                navResult.versionId,
              )
              .catch(() => null)
          : null,
        swResult
          ? this.structuredAnalysis
              .getDiagramForVersion(
                projectId,
                'SOFTWARE_ARCHITECTURE',
                swResult.artifactId,
                swResult.versionId,
              )
              .catch(() => null)
          : null,
        sysResult
          ? this.structuredAnalysis
              .getDiagramForVersion(
                projectId,
                'SYSTEM_ARCHITECTURE',
                sysResult.artifactId,
                sysResult.versionId,
              )
              .catch(() => null)
          : null,
      ]);

    const useCaseDiagram = await this.findUseCaseDiagram(
      projectId,
      useCasesList.items.map((uc) => uc.version.id),
    );

    const mockupsList = blueprintResult
      ? await this.mockups.listApprovedForBlueprint(projectId, blueprintResult.versionId)
      : [];

    const requirementQuality = requirementsList.items.length
      ? await this.requirements.qualityReport(projectId)
      : null;

    return {
      projectId,
      projectName: project.name,
      generatedAt: new Date().toISOString(),
      sources: sourcesList.items,
      context,
      requirements: requirementsList.items,
      requirementQuality,
      useCases: useCasesList.items,
      useCaseDiagram,
      dataModel: dataModel
        ? {
            code: dataModel.code,
            versionId: dataModel.version.id,
            entities: dataModel.dataModel.entities,
            relationships: dataModel.dataModel.relationships,
          }
        : null,
      erDiagram,
      navigation,
      navigationDiagram,
      softwareArchitecture,
      softwareArchitectureDiagram,
      systemArchitecture,
      systemArchitectureDiagram,
      uiBlueprint,
      mockups: mockupsList,
      traceabilitySummary: {
        nodeCount: traceabilityGraph.nodes.length,
        edgeCount: traceabilityGraph.edges.length,
        truncated: traceabilityGraph.truncated,
      },
      stalenessSummary: {
        projectId,
        generatedAt: new Date().toISOString(),
        entries: stalenessEntries.entries,
      },
      readiness: {
        projectId,
        generatedAt: new Date().toISOString(),
        ...readinessResult,
      },
    };
  }

  // Use Case Diagram existence-plus-match is a small, bounded lookup — not
  // part of the shared authoritative-selection policy, since this artifact
  // type is SYSTEM_GENERATED and never reaches APPROVED status (mirrors
  // ReadinessService.useCaseDiagramStage's matching, deliberately not
  // centralized in FirstDeliverableSnapshotService).
  private async findUseCaseDiagram(projectId: string, approvedUseCaseVersionIds: string[]) {
    if (!approvedUseCaseVersionIds.length) return null;
    const diagrams = await this.prisma.artifact.findMany({
      where: { projectId, artifactTypeCode: 'USE_CASE_DIAGRAM' },
      include: {
        versions: {
          orderBy: { versionNumber: 'desc' },
          take: 1,
          include: { diagramDetail: { include: { sources: true } } },
        },
      },
      orderBy: { code: 'asc' },
    });
    const match = diagrams.find((d) =>
      d.versions[0]?.diagramDetail?.sources.some((s) =>
        approvedUseCaseVersionIds.includes(s.sourceArtifactVersionId),
      ),
    );
    if (!match) return null;
    return this.dataModels.getUseCaseDiagram(projectId, match.id);
  }
}
