import { z } from 'zod';
import { mockupPreviewResponseSchema } from '../mockups/mockup.contract';
import { projectContextResponseSchema } from '../project-context/project-context.contract';
import { readinessResponseSchema } from '../readiness/readiness.contract';
import {
  requirementQualityReportResponseSchema,
  requirementResponseSchema,
} from '../requirements/requirement.contract';
import { sourceResponseSchema } from '../sources/source.contract';
import { stalenessAnalysisResponseSchema } from '../staleness/staleness.contract';
import { structuredAnalysisResponseSchema } from '../structured-analysis/structured-analysis.contract';
import { useCaseResponseSchema } from '../use-cases/use-case.contract';

// Diagram kinds span DiagramKind (ER/USE_CASE) and the broader set produced by
// StructuredAnalysisService.getDiagram (NAVIGATION_TREE/SOFTWARE_ARCHITECTURE/
// SYSTEM_ARCHITECTURE): a permissive local shape avoids over-narrowing to
// diagramResponseSchema's stricter 'ER'|'USE_CASE' kind union.
const exportDiagramSchema = z.object({
  code: z.string(),
  versionId: z.uuid(),
  kind: z.string(),
  sourceFormat: z.string(),
  source: z.string(),
  svg: z.string(),
  sourceArtifactVersionIds: z.array(z.uuid()),
});

// Project-level First Deliverable export (requirements.md Phase H). Reuses
// the SAME authoritative-selection policy as Readiness
// (FirstDeliverableSnapshotService) — never a second selection logic.
// Never includes binary bodies, secrets, or raw provider diagnostics.
export const firstDeliverableExportSchema = z.object({
  projectId: z.uuid(),
  projectName: z.string(),
  generatedAt: z.iso.datetime(),
  sources: z.array(sourceResponseSchema),
  context: projectContextResponseSchema.nullable(),
  requirements: z.array(requirementResponseSchema),
  requirementQuality: requirementQualityReportResponseSchema.nullable(),
  useCases: z.array(useCaseResponseSchema),
  useCaseDiagram: exportDiagramSchema.nullable(),
  dataModel: z
    .object({
      code: z.string(),
      versionId: z.uuid(),
      entities: z.array(z.unknown()),
      relationships: z.array(z.unknown()),
    })
    .nullable(),
  erDiagram: exportDiagramSchema.nullable(),
  navigation: structuredAnalysisResponseSchema.nullable(),
  navigationDiagram: exportDiagramSchema.nullable(),
  softwareArchitecture: structuredAnalysisResponseSchema.nullable(),
  softwareArchitectureDiagram: exportDiagramSchema.nullable(),
  systemArchitecture: structuredAnalysisResponseSchema.nullable(),
  systemArchitectureDiagram: exportDiagramSchema.nullable(),
  uiBlueprint: structuredAnalysisResponseSchema.nullable(),
  mockups: z.array(mockupPreviewResponseSchema),
  traceabilitySummary: z.object({
    nodeCount: z.number().int(),
    edgeCount: z.number().int(),
    truncated: z.boolean(),
  }),
  stalenessSummary: stalenessAnalysisResponseSchema,
  readiness: readinessResponseSchema,
});
export type FirstDeliverableExport = z.infer<typeof firstDeliverableExportSchema>;
