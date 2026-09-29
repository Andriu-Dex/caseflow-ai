import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { ImpactAnalysisService } from './impact-analysis.service';
import { PrismaService } from '../database/prisma.service';
import { TraceabilityService } from '../traceability/traceability.service';
import { NotFoundException } from '@nestjs/common';

describe('ImpactAnalysisService', () => {
  let service: ImpactAnalysisService;
  let prismaMock: any;
  let traceabilityMock: any;

  beforeEach(async () => {
    prismaMock = {
      artifactVersion: {
        findUnique: vi.fn(),
      },
    };

    traceabilityMock = {
      buildGraph: vi.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ImpactAnalysisService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: TraceabilityService, useValue: traceabilityMock },
      ],
    }).compile();

    service = module.get<ImpactAnalysisService>(ImpactAnalysisService);
  });

  it('should throw NotFoundException if artifact version is not found', async () => {
    prismaMock.artifactVersion.findUnique.mockResolvedValue(null);

    await expect(service.analyzeImpact('v1')).rejects.toThrow(NotFoundException);
  });

  it('should correctly analyze impact using BFS and topological sort', async () => {
    prismaMock.artifactVersion.findUnique.mockResolvedValue({
      id: 'v1',
      projectId: 'p1',
      artifact: {},
    });

    traceabilityMock.buildGraph.mockResolvedValue({
      nodes: [
        { id: 'v1' },
        { id: 'v2' },
        { id: 'v3' },
        { id: 'v4' },
        { id: 'v5' },
      ],
      edges: [
        { fromId: 'v1', toId: 'v2' },
        { fromId: 'v1', toId: 'v3' },
        { fromId: 'v2', toId: 'v4' },
        { fromId: 'v3', toId: 'v4' },
        { fromId: 'v4', toId: 'v5' },
      ],
    });

    const result = await service.analyzeImpact('v1');

    // directly affected: v2, v3
    expect(result.directlyAffected).toContain('v2');
    expect(result.directlyAffected).toContain('v3');
    expect(result.directlyAffected.length).toBe(2);

    // transitively affected: v4, v5
    expect(result.transitivelyAffected).toContain('v4');
    expect(result.transitivelyAffected).toContain('v5');
    expect(result.transitivelyAffected.length).toBe(2);

    // review order: v2/v3 -> v4 -> v5
    // so v4 should be after v2 and v3
    // v5 should be after v4
    const v2Index = result.recommendedReviewOrder.indexOf('v2');
    const v3Index = result.recommendedReviewOrder.indexOf('v3');
    const v4Index = result.recommendedReviewOrder.indexOf('v4');
    const v5Index = result.recommendedReviewOrder.indexOf('v5');

    expect(v4Index).toBeGreaterThan(v2Index);
    expect(v4Index).toBeGreaterThan(v3Index);
    expect(v5Index).toBeGreaterThan(v4Index);
  });
  
  it('should not include root node in affected or incorrectly transitively if reached by cycle', async () => {
    prismaMock.artifactVersion.findUnique.mockResolvedValue({
      id: 'v1',
      projectId: 'p1',
      artifact: {},
    });

    traceabilityMock.buildGraph.mockResolvedValue({
      nodes: [
        { id: 'v1' },
        { id: 'v2' },
      ],
      edges: [
        { fromId: 'v1', toId: 'v2' },
        { fromId: 'v2', toId: 'v1' }, // cycle
      ],
    });

    const result = await service.analyzeImpact('v1');
    expect(result.directlyAffected).toEqual(['v2']);
    expect(result.transitivelyAffected).toEqual([]);
    expect(result.recommendedReviewOrder).toEqual(['v2']);
  });
});
