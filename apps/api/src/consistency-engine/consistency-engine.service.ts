import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import {
  ConsistencyReportResponse,
  ConsistencyIssue,
  NavigationTreeContent,
  UiBlueprintContent,
} from '@caseflow-ai/contracts';

interface MockupScreen {
  screenLocalId: string;
}

interface MockupWithScreens {
  screens: MockupScreen[];
}

interface ScreenWithArtifact {
  localId: string;
  navigationNodeLocalId?: string;
  artifactId: string;
}

@Injectable()
export class ConsistencyEngineService {
  private readonly logger = new Logger(ConsistencyEngineService.name);

  constructor(private readonly prisma: PrismaService) {}

  async generateReport(projectId: string): Promise<ConsistencyReportResponse> {
    const issues: ConsistencyIssue[] = [];

    const artifacts = await this.prisma.artifact.findMany({
      where: { projectId, archivedAt: null },
      include: {
        versions: {
          orderBy: { versionNumber: 'desc' },
          take: 1,
          include: {
            useCaseRequirementLinks: true,
            mockupsSourcedFromHere: {
              include: {
                screens: true,
              },
            },
            structuredAnalysisDetail: true,
            useCaseDetail: true,
          },
        },
      },
    });

    type ArtifactWithVersion = (typeof artifacts)[number];

    const approvedArtifacts = artifacts.filter(
      (a: ArtifactWithVersion) => a.versions.length > 0 && a.versions[0]!.status === 'APPROVED',
    );
    const totalArtifacts = approvedArtifacts.length;

    // Rule 1: Every APPROVED Requirement must be referenced by at least one Use Case.
    const requirements = approvedArtifacts.filter(
      (a: ArtifactWithVersion) => a.artifactTypeCode === 'REQUIREMENT',
    );
    for (const req of requirements) {
      if (req.versions[0]!.useCaseRequirementLinks.length === 0) {
        issues.push({
          rule: 'Requirement Reference',
          severity: 'WARNING',
          message: `El Requirement ${req.code} no está referenciado por ningún Use Case.`,
          affectedArtifactIds: [req.id],
        });
      }
    }

    // Prepare data for UI Blueprint and Navigation Tree
    const uiBlueprints = approvedArtifacts.filter(
      (a: ArtifactWithVersion) => a.artifactTypeCode === 'UI_BLUEPRINT',
    );
    const navTrees = approvedArtifacts.filter(
      (a: ArtifactWithVersion) => a.artifactTypeCode === 'NAVIGATION_TREE',
    );

    const allScreens: ScreenWithArtifact[] = uiBlueprints.flatMap((bp: ArtifactWithVersion) => {
      const detail = bp.versions[0]!.structuredAnalysisDetail;
      if (detail && detail.content) {
        return (detail.content as unknown as UiBlueprintContent).screens.map((s) => ({
          ...s,
          artifactId: bp.id,
        }));
      }
      return [];
    });

    // Rule 2: Every APPROVED UI Blueprint screen must have at least one Mockup associated.
    for (const bp of uiBlueprints) {
      const detail = bp.versions[0]!.structuredAnalysisDetail;
      if (!detail || !detail.content) continue;

      const content = detail.content as unknown as UiBlueprintContent;
      const mockups = bp.versions[0]!.mockupsSourcedFromHere as MockupWithScreens[];
      const mockupScreenLocalIds = new Set(
        mockups.flatMap((m) => m.screens.map((s) => s.screenLocalId)),
      );

      for (const screen of content.screens) {
        if (!mockupScreenLocalIds.has(screen.localId)) {
          issues.push({
            rule: 'Mockup Association',
            severity: 'ERROR',
            message: `La pantalla '${screen.name}' del UI Blueprint ${bp.code} no tiene un Mockup asociado.`,
            affectedArtifactIds: [bp.id],
          });
        }
      }
    }

    // Rule 3: Every Navigation Tree node must correspond to a UI Blueprint screen.
    for (const nav of navTrees) {
      const detail = nav.versions[0]!.structuredAnalysisDetail;
      if (!detail || !detail.content) continue;

      const content = detail.content as unknown as NavigationTreeContent;
      for (const node of content.nodes) {
        const screen = allScreens.find((s) => s.navigationNodeLocalId === node.localId);
        if (!screen) {
          issues.push({
            rule: 'Navigation Node Link',
            severity: 'ERROR',
            message: `El nodo de navegación '${node.label}' en ${nav.code} no tiene una pantalla de UI Blueprint correspondiente.`,
            affectedArtifactIds: [nav.id],
          });
        }
      }
    }

    // Rule 4: No APPROVED Use Case should have a duplicated name within the project.
    const useCases = approvedArtifacts.filter(
      (a: ArtifactWithVersion) => a.artifactTypeCode === 'USE_CASE',
    );
    const useCaseNames = new Map<string, string[]>();

    for (const uc of useCases) {
      const detail = uc.versions[0]!.useCaseDetail;
      if (detail && detail.name) {
        const normalizedName = detail.name.trim().toLowerCase();
        if (!useCaseNames.has(normalizedName)) {
          useCaseNames.set(normalizedName, []);
        }
        useCaseNames.get(normalizedName)!.push(uc.id);
      }
    }

    for (const [, ids] of useCaseNames.entries()) {
      if (ids.length > 1) {
        issues.push({
          rule: 'Unique Use Case Name',
          severity: 'ERROR',
          message: `El nombre del Use Case está duplicado (${ids.length} ocurrencias).`,
          affectedArtifactIds: ids,
        });
      }
    }

    return {
      standard: 'ConsistencyEngine-V1',
      totalArtifacts,
      issues,
    };
  }
}
