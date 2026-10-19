import { Injectable } from '@nestjs/common';
import {
  findCatalogDependency,
  type DependencyLayer,
  type TargetTemplateVersion,
} from '@caseflow-ai/domain';
import { PrismaService } from '../database/prisma.service';

export interface AllowedDependency {
  name: string;
  version: string;
  layer: DependencyLayer;
  dev: boolean;
  source: 'CATALOG' | 'PROPOSAL';
}

// What a generated project may depend on (DEC-100): the template's approved
// catalog plus this project's human-approved exceptions — nothing else.
@Injectable()
export class DependencyCatalogService {
  constructor(private readonly prisma: PrismaService) {}

  async resolve(
    projectId: string,
    template: TargetTemplateVersion,
    packageName: string,
  ): Promise<AllowedDependency | null> {
    const cataloged = findCatalogDependency(template, packageName);
    if (cataloged)
      return {
        name: cataloged.name,
        version: cataloged.version,
        layer: cataloged.layer,
        dev: cataloged.dev,
        source: 'CATALOG',
      };
    const approved = await this.prisma.dependencyProposal.findFirst({
      where: {
        projectId,
        targetTemplateIdentifier: template.identifier,
        targetTemplateVersion: template.version,
        packageName,
        status: 'APPROVED',
      },
    });
    return approved
      ? {
          name: approved.packageName,
          version: approved.version,
          layer: approved.layer,
          dev: approved.dev,
          source: 'PROPOSAL',
        }
      : null;
  }

  async listAllowed(
    projectId: string,
    template: TargetTemplateVersion,
  ): Promise<AllowedDependency[]> {
    const approved = await this.prisma.dependencyProposal.findMany({
      where: {
        projectId,
        targetTemplateIdentifier: template.identifier,
        targetTemplateVersion: template.version,
        status: 'APPROVED',
      },
      orderBy: { packageName: 'asc' },
    });
    return [
      ...template.dependencies.map(({ name, version, layer, dev }) => ({
        name,
        version,
        layer,
        dev,
        source: 'CATALOG' as const,
      })),
      ...approved.map((p) => ({
        name: p.packageName,
        version: p.version,
        layer: p.layer,
        dev: p.dev,
        source: 'PROPOSAL' as const,
      })),
    ];
  }
}
