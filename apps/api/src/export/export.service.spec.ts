import { describe, expect, it, vi } from 'vitest';
import type { PrismaService } from '../database/prisma.service';
import type { DataModelsService } from '../data-models/data-models.service';
import type { FirstDeliverableSnapshotService } from '../first-deliverable/first-deliverable-snapshot.service';
import type { MockupsService } from '../mockups/mockups.service';
import type { ProjectContextService } from '../project-context/project-context.service';
import type { ReadinessService } from '../readiness/readiness.service';
import type { RequirementsService } from '../requirements/requirements.service';
import type { SourcesService } from '../sources/sources.service';
import type { StalenessService } from '../staleness/staleness.service';
import type { StructuredAnalysisService } from '../structured-analysis/structured-analysis.service';
import type { TraceabilityService } from '../traceability/traceability.service';
import type { UseCasesService } from '../use-cases/use-cases.service';
import { ExportService } from './export.service';

function setup() {
  const prisma = {
    project: { findUnique: vi.fn().mockResolvedValue({ name: 'Proyecto Demo' }) },
    artifact: { findMany: vi.fn().mockResolvedValue([]) },
  };
  const snapshot = { approvedArtifactVersion: vi.fn().mockResolvedValue(null) };
  const sources = { list: vi.fn().mockResolvedValue({ items: [] }) };
  const context = { getVersion: vi.fn() };
  const requirements = {
    listApproved: vi.fn().mockResolvedValue({ items: [] }),
    qualityReport: vi.fn().mockResolvedValue({ issues: [] }),
  };
  const useCases = { listApproved: vi.fn().mockResolvedValue({ items: [] }) };
  const dataModels = {
    getVersion: vi.fn(),
    getERDiagramForVersion: vi.fn(),
    getUseCaseDiagram: vi.fn(),
  };
  const structuredAnalysis = { getVersion: vi.fn(), getDiagramForVersion: vi.fn() };
  const mockups = { listApprovedForBlueprint: vi.fn() };
  const readiness = {
    evaluate: vi.fn().mockResolvedValue({ ready: false, stages: [], blockers: [], warnings: [] }),
  };
  const staleness = { analyzeProject: vi.fn().mockResolvedValue({ entries: [] }) };
  const traceability = {
    buildGraph: vi.fn().mockResolvedValue({ nodes: [], edges: [], truncated: false }),
  };
  return {
    prisma,
    snapshot,
    sources,
    context,
    requirements,
    useCases,
    dataModels,
    structuredAnalysis,
    mockups,
    readiness,
    staleness,
    traceability,
    service: new ExportService(
      prisma as unknown as PrismaService,
      snapshot as unknown as FirstDeliverableSnapshotService,
      sources as unknown as SourcesService,
      context as unknown as ProjectContextService,
      requirements as unknown as RequirementsService,
      useCases as unknown as UseCasesService,
      dataModels as unknown as DataModelsService,
      structuredAnalysis as unknown as StructuredAnalysisService,
      mockups as unknown as MockupsService,
      readiness as unknown as ReadinessService,
      staleness as unknown as StalenessService,
      traceability as unknown as TraceabilityService,
    ),
  };
}

describe('ExportService', () => {
  it('produces a coherent snapshot for an empty/incomplete project (no approved artifacts)', async () => {
    const { service } = setup();
    const snapshot = await service.buildSnapshot('p');
    expect(snapshot.projectName).toBe('Proyecto Demo');
    expect(snapshot.context).toBeNull();
    expect(snapshot.dataModel).toBeNull();
    expect(snapshot.erDiagram).toBeNull();
    expect(snapshot.useCaseDiagram).toBeNull();
    expect(snapshot.mockups).toEqual([]);
    expect(snapshot.requirementQuality).toBeNull();
  });

  it('never invokes the quality report when there are no approved requirements', async () => {
    const { service, requirements } = setup();
    await service.buildSnapshot('p');
    expect(requirements.qualityReport).not.toHaveBeenCalled();
  });

  it('uses FirstDeliverableSnapshotService for every project-level singleton type, never a second selection policy', async () => {
    const { service, snapshot } = setup();
    await service.buildSnapshot('p');
    const types = snapshot.approvedArtifactVersion.mock.calls.map((call: unknown[]) => call[1]);
    expect(types).toEqual(
      expect.arrayContaining([
        'PROJECT_CONTEXT',
        'DATA_MODEL',
        'NAVIGATION_TREE',
        'SOFTWARE_ARCHITECTURE',
        'SYSTEM_ARCHITECTURE',
        'UI_BLUEPRINT',
      ]),
    );
  });

  it('fetches the exact selected version, never the latest version regardless of status', async () => {
    const { service, context, snapshot } = setup();
    snapshot.approvedArtifactVersion.mockImplementation((_p: string, type: string) =>
      type === 'PROJECT_CONTEXT'
        ? Promise.resolve({ artifactId: 'ctx-artifact', code: 'CTX-001', versionId: 'ctx-v1' })
        : Promise.resolve(null),
    );
    context.getVersion.mockResolvedValue({
      code: 'CTX-001',
      problemStatement: 'x',
      objective: 'y',
    });
    await service.buildSnapshot('p');
    expect(context.getVersion).toHaveBeenCalledWith('p', 'ctx-artifact', 'ctx-v1');
  });

  it('rejects an unknown project', async () => {
    const { service, prisma } = setup();
    prisma.project.findUnique.mockResolvedValue(null);
    await expect(service.buildSnapshot('missing')).rejects.toThrow('Proyecto no encontrado.');
  });

  it('only requests mockups matching the exact selected UI Blueprint version', async () => {
    const { service, snapshot, structuredAnalysis, mockups } = setup();
    snapshot.approvedArtifactVersion.mockImplementation((_p: string, type: string) =>
      type === 'UI_BLUEPRINT'
        ? Promise.resolve({ artifactId: 'bp', code: 'UI-001', versionId: 'bp-v2' })
        : Promise.resolve(null),
    );
    structuredAnalysis.getVersion.mockResolvedValue({ code: 'UI-001' });
    mockups.listApprovedForBlueprint.mockResolvedValue([]);
    await service.buildSnapshot('p');
    expect(mockups.listApprovedForBlueprint).toHaveBeenCalledWith('p', 'bp-v2');
  });
});
