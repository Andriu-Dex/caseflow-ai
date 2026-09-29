/// <reference types="jest" />
import { Test, TestingModule } from '@nestjs/common';
import { ConsistencyEngineService } from './consistency-engine.service';
import { PrismaService } from '../database/prisma.service';
import { ConsistencyReportResponse } from '@caseflow-ai/contracts';

describe('ConsistencyEngineService', () => {
  let service: ConsistencyEngineService;
  let prismaService: PrismaService;

  const mockPrismaService = {
    artifact: {
      findMany: jest.fn(),
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ConsistencyEngineService,
        { provide: PrismaService, useValue: mockPrismaService },
      ],
    }).compile();

    service = module.get<ConsistencyEngineService>(ConsistencyEngineService);
    prismaService = module.get<PrismaService>(PrismaService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('generateReport', () => {
    it('should generate an empty report when there are no issues', async () => {
      mockPrismaService.artifact.findMany.mockResolvedValue([]);

      const result = await service.generateReport('project-1');

      expect(result.totalArtifacts).toBe(0);
      expect(result.issues).toEqual([]);
    });

    it('should detect unreferenced requirements (Rule 1)', async () => {
      mockPrismaService.artifact.findMany.mockResolvedValue([
        {
          id: 'req-1',
          projectId: 'project-1',
          artifactTypeCode: 'REQUIREMENT',
          code: 'REQ-1',
          versions: [
            {
              status: 'APPROVED',
              useCaseRequirementLinks: [], // No references
            },
          ],
        },
      ]);

      const result = await service.generateReport('project-1');

      expect(result.totalArtifacts).toBe(1);
      expect(result.issues.length).toBe(1);
      expect(result.issues[0]?.rule).toBe('Requirement Reference');
      expect(result.issues[0]?.affectedArtifactIds).toContain('req-1');
    });

    it('should detect UI Blueprint screens without Mockups (Rule 2)', async () => {
      mockPrismaService.artifact.findMany.mockResolvedValue([
        {
          id: 'ui-1',
          projectId: 'project-1',
          artifactTypeCode: 'UI_BLUEPRINT',
          code: 'UI-1',
          versions: [
            {
              status: 'APPROVED',
              structuredAnalysisDetail: {
                content: {
                  screens: [
                    { localId: 'screen-1', name: 'Home Screen' }
                  ]
                }
              },
              mockupsSourcedFromHere: [
                {
                  screens: [
                    // Different screen associated
                    { screenLocalId: 'screen-2' }
                  ]
                }
              ]
            },
          ],
        },
      ]);

      const result = await service.generateReport('project-1');

      expect(result.totalArtifacts).toBe(1);
      expect(result.issues.length).toBe(1);
      expect(result.issues[0]?.rule).toBe('Mockup Association');
      expect(result.issues[0]?.affectedArtifactIds).toContain('ui-1');
    });

    it('should detect Navigation nodes without matching UI Blueprint screens (Rule 3)', async () => {
      mockPrismaService.artifact.findMany.mockResolvedValue([
        {
          id: 'nav-1',
          projectId: 'project-1',
          artifactTypeCode: 'NAVIGATION_TREE',
          code: 'NAV-1',
          versions: [
            {
              status: 'APPROVED',
              structuredAnalysisDetail: {
                content: {
                  nodes: [
                    { localId: 'node-1', label: 'Home Node' }
                  ]
                }
              }
            },
          ],
        },
        // No UI Blueprint mapping to this node
      ]);

      const result = await service.generateReport('project-1');

      expect(result.totalArtifacts).toBe(1);
      expect(result.issues.length).toBe(1);
      expect(result.issues[0]?.rule).toBe('Navigation Node Link');
      expect(result.issues[0]?.affectedArtifactIds).toContain('nav-1');
    });

    it('should detect duplicated Use Case names (Rule 4)', async () => {
      mockPrismaService.artifact.findMany.mockResolvedValue([
        {
          id: 'uc-1',
          projectId: 'project-1',
          artifactTypeCode: 'USE_CASE',
          code: 'UC-1',
          versions: [
            {
              status: 'APPROVED',
              useCaseDetail: {
                name: 'Login',
              }
            },
          ],
        },
        {
          id: 'uc-2',
          projectId: 'project-1',
          artifactTypeCode: 'USE_CASE',
          code: 'UC-2',
          versions: [
            {
              status: 'APPROVED',
              useCaseDetail: {
                name: ' Login ', // should be case-insensitive / trimmed duplicate
              }
            },
          ],
        },
      ]);

      const result = await service.generateReport('project-1');

      expect(result.totalArtifacts).toBe(2);
      expect(result.issues.length).toBe(1);
      expect(result.issues[0]?.rule).toBe('Unique Use Case Name');
      expect(result.issues[0]?.affectedArtifactIds).toContain('uc-1');
      expect(result.issues[0]?.affectedArtifactIds).toContain('uc-2');
    });
  });
});
