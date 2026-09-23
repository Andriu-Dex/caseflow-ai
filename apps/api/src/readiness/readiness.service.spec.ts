import { describe, expect, it, vi } from 'vitest';
import type { PrismaService } from '../database/prisma.service';
import type { RequirementsService } from '../requirements/requirements.service';
import type { StalenessService } from '../staleness/staleness.service';
import type { TraceabilityService } from '../traceability/traceability.service';
import { ReadinessService } from './readiness.service';

function setup() {
  const prisma = {
    artifact: {
      findMany: vi.fn().mockResolvedValue([]),
      findFirst: vi.fn().mockResolvedValue(null),
    },
    artifactVersion: { findMany: vi.fn().mockResolvedValue([]) },
    diagramDetail: { findUnique: vi.fn().mockResolvedValue(null) },
  };
  const requirements = { qualityReport: vi.fn().mockResolvedValue({ issues: [] }) };
  const staleness = { analyzeProject: vi.fn().mockResolvedValue({ entries: [] }) };
  const traceability = { buildGraph: vi.fn().mockResolvedValue({ nodes: [], edges: [] }) };
  return {
    prisma,
    requirements,
    staleness,
    traceability,
    service: new ReadinessService(
      prisma as unknown as PrismaService,
      requirements as unknown as RequirementsService,
      staleness as unknown as StalenessService,
      traceability as unknown as TraceabilityService,
    ),
  };
}

describe('ReadinessService', () => {
  it('reports every stage unsatisfied and overall not ready for an empty project', async () => {
    const { service } = setup();
    const result = await service.evaluate('p');
    expect(result.ready).toBe(false);
    expect(result.stages).toHaveLength(13);
    // IMPACT is vacuously satisfied (no staleness detected) even when every
    // other stage is unsatisfied for lack of any artifact at all.
    expect(result.stages.filter((s) => s.key !== 'IMPACT').every((s) => !s.satisfied)).toBe(true);
    expect(result.stages.find((s) => s.key === 'IMPACT')?.satisfied).toBe(true);
    expect(result.blockers.length).toBeGreaterThan(0);
  });

  it('never creates or mutates anything while evaluating', async () => {
    const { prisma, service } = setup();
    await service.evaluate('p');
    expect(prisma.artifact).not.toHaveProperty('create');
    expect(prisma.artifactVersion).not.toHaveProperty('update');
  });

  it('treats Requirement quality findings as warnings, never blockers', async () => {
    const { prisma, requirements, service } = setup();
    prisma.artifactVersion.findMany.mockResolvedValue([
      { id: 'v1', requirementDetail: { requirementType: 'FUNCTIONAL' } },
    ]);
    requirements.qualityReport.mockResolvedValue({
      issues: [{ requirementId: 'v1', code: 'RF-001', rule: 'BLANK_DESCRIPTION', message: 'x' }],
    });
    const result = await service.evaluate('p');
    const reqStage = result.stages.find((s) => s.key === 'REQUIREMENTS')!;
    expect(reqStage.satisfied).toBe(true);
    expect(reqStage.blockers).toEqual([]);
    expect(reqStage.warnings.length).toBe(1);
  });

  it('reports every satisfied branch when authoritative APPROVED evidence exists for every stage', async () => {
    const { prisma, traceability, staleness, service } = setup();
    const approvedVersion = (versionNumber: number) => ({
      id: `v-${versionNumber}`,
      status: 'APPROVED',
      versionNumber,
    });
    prisma.artifact.findMany.mockImplementation(
      ({ where }: { where: { artifactTypeCode: string } }) => {
        if (where.artifactTypeCode === 'PROJECT_SOURCE')
          return Promise.resolve([{ id: 'src', code: 'SRC-001', versions: [approvedVersion(1)] }]);
        if (where.artifactTypeCode === 'USE_CASE_DIAGRAM')
          return Promise.resolve([
            {
              id: 'dia',
              code: 'DIA-001',
              versions: [
                {
                  ...approvedVersion(1),
                  diagramDetail: { sources: [{ sourceArtifactVersionId: 'uc-v1' }] },
                },
              ],
            },
          ]);
        if (
          [
            'DATA_MODEL',
            'NAVIGATION_TREE',
            'SOFTWARE_ARCHITECTURE',
            'SYSTEM_ARCHITECTURE',
            'UI_BLUEPRINT',
          ].includes(where.artifactTypeCode)
        )
          return Promise.resolve([
            {
              id: where.artifactTypeCode,
              code: `${where.artifactTypeCode}-001`,
              versions: [approvedVersion(1)],
            },
          ]);
        if (where.artifactTypeCode === 'MOCKUP')
          return Promise.resolve([
            {
              id: 'mck',
              code: 'MCK-001',
              versions: [{ ...approvedVersion(1), mockupDetail: { uiBlueprintVersionId: 'v-1' } }],
            },
          ]);
        return Promise.resolve([]);
      },
    );
    prisma.artifact.findFirst.mockResolvedValue({
      id: 'ctx',
      code: 'CTX-001',
      versions: [
        {
          ...approvedVersion(1),
          projectContextDetail: { sources: [{ sourceVersionId: 'src-v1' }] },
        },
      ],
    });
    prisma.artifactVersion.findMany.mockResolvedValue(
      Array.from({ length: 4 }, (_, i) => ({
        id: `uc-v${i}`,
        requirementDetail: { requirementType: i % 2 === 0 ? 'FUNCTIONAL' : 'NON_FUNCTIONAL' },
      })),
    );
    prisma.diagramDetail.findUnique.mockResolvedValue({ artifactVersionId: 'v-1' });
    traceability.buildGraph.mockResolvedValue({
      nodes: [{ id: 'downstream-1', code: 'NAV-002' }],
      edges: [{ fromId: 'affected-1', toId: 'downstream-1' }],
    });
    staleness.analyzeProject.mockResolvedValue({
      entries: [
        {
          artifactId: 'rf',
          artifactVersionId: 'affected-1',
          artifactType: 'REQUIREMENT',
          code: 'RF-001',
          versionNumber: 1,
          impactState: 'POTENTIALLY_AFFECTED',
          reasons: [],
        },
      ],
    });

    const result = await service.evaluate('p');
    expect(result.stages.find((s) => s.key === 'SOURCES')?.satisfied).toBe(true);
    expect(result.stages.find((s) => s.key === 'USE_CASES')?.counts).toMatchObject({ approved: 4 });
    expect(result.stages.find((s) => s.key === 'USE_CASE_DIAGRAM')?.satisfied).toBe(true);
    expect(result.stages.find((s) => s.key === 'DATA_MODEL')?.satisfied).toBe(true);
    expect(result.stages.find((s) => s.key === 'ER_DIAGRAM')?.satisfied).toBe(true);
    expect(result.stages.find((s) => s.key === 'NAVIGATION')?.satisfied).toBe(true);
    expect(result.stages.find((s) => s.key === 'MOCKUPS')?.satisfied).toBe(true);
    const impact = result.stages.find((s) => s.key === 'IMPACT')!;
    expect(impact.satisfied).toBe(true);
    expect(impact.warnings.some((w) => w.includes('POTENTIALLY_AFFECTED'))).toBe(true);
    expect(impact.warnings.some((w) => w.includes('DOWNSTREAM_REVIEW_RECOMMENDED'))).toBe(true);
  });

  it('blocks IMPACT when the current Context is flagged as newer-knowledge-available', async () => {
    const { staleness, service } = setup();
    staleness.analyzeProject.mockResolvedValue({
      entries: [
        {
          artifactId: 'ctx',
          artifactVersionId: 'ctx-v1',
          artifactType: 'PROJECT_CONTEXT',
          code: 'CTX-001',
          versionNumber: 1,
          impactState: 'NEWER_APPROVED_KNOWLEDGE_AVAILABLE',
          reasons: [],
        },
      ],
    });
    const result = await service.evaluate('p');
    const impactStage = result.stages.find((s) => s.key === 'IMPACT')!;
    expect(impactStage.satisfied).toBe(false);
    expect(result.ready).toBe(false);
  });
});
