import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { TraceabilityService } from '../traceability/traceability.service';
import { ImpactAnalysisResponse } from '@caseflow-ai/contracts';

@Injectable()
export class ImpactAnalysisService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly traceabilityService: TraceabilityService,
  ) {}

  async analyzeImpact(artifactVersionId: string): Promise<ImpactAnalysisResponse> {
    const version = await this.prisma.artifactVersion.findUnique({
      where: { id: artifactVersionId },
      include: { artifact: true },
    });
    if (!version) {
      throw new NotFoundException(`Artifact version ${artifactVersionId} not found`);
    }

    const projectId = version.projectId;
    const { nodes, edges } = await this.traceabilityService.buildGraph(projectId);

    const adj = new Map<string, string[]>();
    const inDegree = new Map<string, number>();
    for (const node of nodes) {
      adj.set(node.id, []);
      inDegree.set(node.id, 0);
    }
    for (const edge of edges) {
      if (adj.has(edge.fromId) && adj.has(edge.toId)) {
        adj.get(edge.fromId)!.push(edge.toId);
        inDegree.set(edge.toId, inDegree.get(edge.toId)! + 1);
      }
    }

    const directlyAffected = new Set<string>();
    const transitivelyAffected = new Set<string>();

    const queue: { id: string; depth: number }[] = [];
    queue.push({ id: artifactVersionId, depth: 0 });

    const visited = new Set<string>();
    visited.add(artifactVersionId);

    while (queue.length > 0) {
      const current = queue.shift()!;
      const neighbors = adj.get(current.id) || [];

      for (const neighbor of neighbors) {
        if (neighbor === artifactVersionId) continue;
        if (!visited.has(neighbor)) {
          visited.add(neighbor);
          queue.push({ id: neighbor, depth: current.depth + 1 });
          if (current.depth === 0) {
            directlyAffected.add(neighbor);
          } else {
            transitivelyAffected.add(neighbor);
          }
        } else {
          if (current.depth === 0) {
            directlyAffected.add(neighbor);
            transitivelyAffected.delete(neighbor);
          } else {
            if (!directlyAffected.has(neighbor)) {
              transitivelyAffected.add(neighbor);
            }
          }
        }
      }
    }

    const affectedNodes = new Set([...directlyAffected, ...transitivelyAffected]);
    
    const affectedAdj = new Map<string, string[]>();
    const affectedInDegree = new Map<string, number>();
    for (const node of affectedNodes) {
      affectedAdj.set(node, []);
      affectedInDegree.set(node, 0);
    }

    for (const node of affectedNodes) {
      const neighbors = adj.get(node) || [];
      for (const neighbor of neighbors) {
        if (affectedNodes.has(neighbor)) {
          affectedAdj.get(node)!.push(neighbor);
          affectedInDegree.set(neighbor, affectedInDegree.get(neighbor)! + 1);
        }
      }
    }

    const topoQueue: string[] = [];
    for (const node of affectedNodes) {
      if (affectedInDegree.get(node) === 0) {
        topoQueue.push(node);
      }
    }

    const recommendedReviewOrder: string[] = [];
    while (topoQueue.length > 0) {
      const current = topoQueue.shift()!;
      recommendedReviewOrder.push(current);

      const neighbors = affectedAdj.get(current) || [];
      for (const neighbor of neighbors) {
        affectedInDegree.set(neighbor, affectedInDegree.get(neighbor)! - 1);
        if (affectedInDegree.get(neighbor) === 0) {
          topoQueue.push(neighbor);
        }
      }
    }

    return {
      directlyAffected: Array.from(directlyAffected),
      transitivelyAffected: Array.from(transitivelyAffected),
      recommendedReviewOrder,
    };
  }
}
