import { describe, beforeEach, it, expect, vi } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { BaselinesService } from './baselines.service';
import { PrismaService } from '../database/prisma.service';

describe('BaselinesService', () => {
  let service: BaselinesService;
  let db: PrismaService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BaselinesService,
        {
          provide: PrismaService,
          useValue: {
            project: {
              findUnique: vi.fn(),
            },
            artifact: {
              findMany: vi.fn(),
            },
            projectBaseline: {
              create: vi.fn(),
            },
          },
        },
      ],
    }).compile();

    service = module.get<BaselinesService>(BaselinesService);
    db = module.get<PrismaService>(PrismaService);
  });

  it('should create a baseline with only approved latest versions', async () => {
    vi.spyOn(db.project, 'findUnique').mockResolvedValue({ id: 'proj1' } as never);
    vi.spyOn(db.artifact, 'findMany').mockResolvedValue([
      { id: 'art1', versions: [{ id: 'v1' }] },
      { id: 'art2', versions: [] }, // No approved versions
    ] as never);
    vi.spyOn(db.projectBaseline, 'create').mockResolvedValue({ id: 'base1' } as never);

    await service.create('proj1', 'v1.0', 'Initial release', 'user1');

    expect(db.projectBaseline.create).toHaveBeenCalledWith({
      data: {
        projectId: 'proj1',
        label: 'v1.0',
        description: 'Initial release',
        createdByUserId: 'user1',
        entries: {
          create: [{ artifactId: 'art1', artifactVersionId: 'v1' }],
        },
      },
      include: {
        user: true,
        entries: true,
      },
    });
  });
});
