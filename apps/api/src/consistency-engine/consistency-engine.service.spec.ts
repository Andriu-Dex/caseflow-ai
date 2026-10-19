import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ConsistencyEngineService } from './consistency-engine.service';
import type { PrismaService } from '../database/prisma.service';

type Version = Record<string, unknown>;

// An artifact with its latest approved version, as the service loads it.
function artifact(
  id: string,
  artifactTypeCode: string,
  version: Version = {},
  approvedAt = new Date('2026-01-01'),
) {
  return {
    id,
    code: id.toUpperCase(),
    artifactTypeCode,
    versions: [
      {
        status: 'APPROVED',
        approvedAt,
        createdAt: approvedAt,
        structuredAnalysisDetail: null,
        dataModelDetail: null,
        mockupsSourcedFromHere: [],
        useCaseDetail: null,
        requirementDetail: null,
        ...version,
      },
    ],
  };
}

describe('ConsistencyEngineService', () => {
  const prisma = {
    artifact: { findMany: vi.fn() },
    project: { findUnique: vi.fn() },
    artifactVersion: { findFirst: vi.fn().mockResolvedValue(null) },
  };
  let service: ConsistencyEngineService;

  beforeEach(() => {
    vi.clearAllMocks();
    prisma.project.findUnique.mockResolvedValue({ coherenceRequired: true });
    service = new ConsistencyEngineService(prisma as unknown as PrismaService);
  });

  it('reports nothing for an empty project', async () => {
    prisma.artifact.findMany.mockResolvedValue([]);
    const result = await service.generateReport('p');
    expect(result).toMatchObject({ totalArtifacts: 0, coherenceRequired: true, issues: [] });
  });

  it('reports functional requirements no approved use case realises', async () => {
    prisma.artifact.findMany.mockResolvedValue([
      artifact('rf-1', 'REQUIREMENT', { requirementDetail: { requirementType: 'FUNCTIONAL' } }),
      artifact('rnf-1', 'REQUIREMENT', {
        requirementDetail: { requirementType: 'NON_FUNCTIONAL' },
      }),
    ]);
    const { issues } = await service.generateReport('p');
    expect(issues).toEqual([
      expect.objectContaining({
        severity: 'ERROR',
        chain: 'REQUIREMENT_USE_CASE_SCREEN',
        artifactType: 'REQUIREMENT',
        message: 'El requisito RF-1 no está cubierto por ningún caso de uso aprobado.',
        affectedArtifactIds: ['rf-1'],
      }),
    ]);
  });

  it('only warns in projects without mandatory coherence', async () => {
    prisma.project.findUnique.mockResolvedValue({ coherenceRequired: false });
    prisma.artifact.findMany.mockResolvedValue([
      artifact('rf-1', 'REQUIREMENT', { requirementDetail: { requirementType: 'FUNCTIONAL' } }),
    ]);
    const result = await service.generateReport('p');
    expect(result.coherenceRequired).toBe(false);
    expect(result.issues.map((issue) => issue.severity)).toEqual(['WARNING']);
  });

  it('reports RNF with no declared design coverage without forcing them into use cases', async () => {
    prisma.artifact.findMany.mockResolvedValue([
      artifact('rnf-1', 'REQUIREMENT', {
        requirementDetail: { requirementType: 'NON_FUNCTIONAL' },
      }),
      artifact('sw-1', 'SOFTWARE_ARCHITECTURE', {
        structuredAnalysisDetail: {
          content: {
            components: [{ localId: 'audit', name: 'Auditoría', relatedSourceCodes: [] }],
          },
        },
      }),
    ]);
    expect((await service.generateReport('p')).issues).toContainEqual(
      expect.objectContaining({
        chain: 'QUALITY_REQUIREMENT_DESIGN',
        severity: 'WARNING',
        message: expect.stringContaining('RNF-1'),
      }),
    );
    prisma.artifact.findMany.mockResolvedValue([
      artifact('rnf-1', 'REQUIREMENT', {
        requirementDetail: { requirementType: 'NON_FUNCTIONAL' },
      }),
      artifact('sw-1', 'SOFTWARE_ARCHITECTURE', {
        structuredAnalysisDetail: {
          content: {
            components: [{ localId: 'audit', name: 'Auditoría', relatedSourceCodes: ['RNF-1'] }],
          },
        },
      }),
    ]);
    expect((await service.generateReport('p')).issues).toEqual([]);
  });

  it('checks the UI blueprint against the navigation tree and use cases', async () => {
    prisma.artifact.findMany.mockResolvedValue([
      artifact('cu-1', 'USE_CASE', { useCaseDetail: { name: 'Pedir', requirementLinks: [] } }),
      artifact('nav-1', 'NAVIGATION_TREE', {
        structuredAnalysisDetail: {
          content: {
            nodes: [
              { localId: 'orders', label: 'Pedidos', viewName: 'Pedidos', kind: 'LIST' },
              { localId: 'group', label: 'Ventas', viewName: 'Ventas', kind: 'SECTION' },
            ],
          },
        },
      }),
      artifact('ui-1', 'UI_BLUEPRINT', {
        structuredAnalysisDetail: {
          content: { screens: [{ localId: 'home', name: 'Inicio', purpose: 'Ver' }] },
        },
        mockupsSourcedFromHere: [{ screens: [{ screenLocalId: 'home' }] }],
      }),
    ]);
    const { issues } = await service.generateReport('p');
    expect(issues.map((issue) => issue.message)).toEqual([
      'El nodo de navegación «Pedidos» no tiene una pantalla en el plano de interfaz.',
      'La pantalla «Inicio» no indica a qué nodo de navegación corresponde.',
      'El caso de uso CU-1 no aparece en ninguna pantalla del plano de interfaz.',
    ]);
  });

  it('uses only the most recently approved instance of single artifacts', async () => {
    const blueprint = (id: string, approvedAt: string) =>
      artifact(
        id,
        'UI_BLUEPRINT',
        {
          structuredAnalysisDetail: {
            content: { screens: [{ localId: id, name: id, purpose: 'Ver' }] },
          },
        },
        new Date(approvedAt),
      );
    prisma.artifact.findMany.mockResolvedValue([
      blueprint('old', '2026-01-01'),
      blueprint('new', '2026-02-01'),
    ]);
    const { issues } = await service.generateReport('p');
    expect(issues.map((issue) => issue.message)).toEqual([
      "La pantalla 'new' del plano de interfaz NEW no tiene un boceto asociado.",
    ]);
  });

  it('detects duplicated use case names', async () => {
    prisma.artifact.findMany.mockResolvedValue([
      artifact('cu-1', 'USE_CASE', { useCaseDetail: { name: 'Pedir', requirementLinks: [] } }),
      artifact('cu-2', 'USE_CASE', { useCaseDetail: { name: ' pedir ', requirementLinks: [] } }),
    ]);
    const { issues } = await service.generateReport('p');
    expect(issues).toEqual([
      expect.objectContaining({
        rule: 'Unique Use Case Name',
        affectedArtifactIds: ['cu-1', 'cu-2'],
      }),
    ]);
  });

  it('blocks approving an artifact with gaps only where coherence is mandatory', async () => {
    prisma.artifact.findMany.mockResolvedValue([
      artifact('dc-1', 'CLASS_DIAGRAM', {
        structuredAnalysisDetail: { content: { classes: [{ localId: 'order', name: 'Pedido' }] } },
      }),
    ]);
    const model = {
      entities: [
        { localId: 'e', name: 'Venta', description: 'Venta', attributes: [{ name: 'x' }] },
      ],
    };
    await expect(service.assertCoherent('p', 'CONCEPTUAL_DOMAIN_MODEL', model)).rejects.toThrow(
      'La clase «Pedido» no tiene una entidad en el modelo conceptual.',
    );
    prisma.project.findUnique.mockResolvedValue({ coherenceRequired: false });
    await expect(
      service.assertCoherent('p', 'CONCEPTUAL_DOMAIN_MODEL', model),
    ).resolves.toBeUndefined();
  });
});
