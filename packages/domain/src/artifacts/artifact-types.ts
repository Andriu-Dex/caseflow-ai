// Artifact types required by the First Deliverable MVP.
// The authoritative, extensible list is the `artifact_types` reference table;
// this constant only names the types the first deliverable depends on.

export const FIRST_DELIVERABLE_ARTIFACT_TYPE_CODES = [
  'PROJECT_CONTEXT',
  'PROJECT_SOURCE',
  'REQUIREMENT',
  'USE_CASE',
  'DATA_MODEL',
  'USE_CASE_DIAGRAM',
  'NAVIGATION_TREE',
  'SOFTWARE_ARCHITECTURE',
  'SYSTEM_ARCHITECTURE',
  'UI_BLUEPRINT',
  'MOCKUP',
] as const;

export type FirstDeliverableArtifactTypeCode =
  (typeof FIRST_DELIVERABLE_ARTIFACT_TYPE_CODES)[number];

// Artifact types added by the Construction pipeline.
export const CONSTRUCTION_ARTIFACT_TYPE_CODES = [
  'GENERATION_PLAN',
  'CONCEPTUAL_DOMAIN_MODEL',
  'IMPLEMENTATION_PLAN',
  'USER_MANUAL',
] as const;

// Artifact codes are "<PREFIX>-<number>", e.g. RF-001.
export function formatArtifactCode(prefix: string, sequenceNumber: number): string {
  return `${prefix}-${String(sequenceNumber).padStart(3, '0')}`;
}
