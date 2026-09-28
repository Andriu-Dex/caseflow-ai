// Deterministic ISO/IEC/IEEE 29148:2018-aligned Requirement quality checks
// (spec §4.3). This is a cheap structural analyzer, never proof of standards
// compliance or a substitute for human review, which remains authoritative.

export interface RequirementForQualityCheck {
  id: string;
  code: string;
  name: string;
  description: string;
  origin: string;
  dependencyArtifactIds: string[];
  sourceContextVersionId: string | null;
  aiRunId: string | null;
}

export const REQUIREMENT_QUALITY_RULES = [
  'BLANK_DESCRIPTION',
  'PLACEHOLDER_TEXT',
  'DUPLICATE_DEPENDENCY',
  'SELF_DEPENDENCY',
  'UNRESOLVED_DEPENDENCY',
  'MISSING_PROVENANCE',
  'POSSIBLE_MULTI_OBLIGATION',
  'DUPLICATE_NAME',
] as const;
export type RequirementQualityRule = (typeof REQUIREMENT_QUALITY_RULES)[number];

export interface RequirementQualityIssue {
  requirementId: string;
  code: string;
  rule: RequirementQualityRule;
  message: string;
}

export interface RequirementQualityReport {
  standard: 'ISO/IEC/IEEE 29148:2018-aligned';
  totalRequirements: number;
  issues: RequirementQualityIssue[];
}

const MIN_DESCRIPTION_LENGTH = 10;
const PLACEHOLDER_PATTERN = /\b(TBD|TBC|POR DEFINIR|PENDIENTE DE DEFINIR)\b/i;
const MULTI_OBLIGATION_CONNECTOR = /\sy tamb(?:ié|ie)n\s|\sand also\s/i;

export function analyzeRequirementQuality(
  requirements: RequirementForQualityCheck[],
): RequirementQualityReport {
  const issues: RequirementQualityIssue[] = [];
  const idSet = new Set(requirements.map((requirement) => requirement.id));
  const byNormalizedName = new Map<string, string[]>();

  for (const requirement of requirements) {
    const push = (rule: RequirementQualityRule, message: string) =>
      issues.push({ requirementId: requirement.id, code: requirement.code, rule, message });

    if (requirement.description.trim().length < MIN_DESCRIPTION_LENGTH)
      push('BLANK_DESCRIPTION', 'La descripción es insuficiente o está en blanco.');

    if (
      PLACEHOLDER_PATTERN.test(requirement.name) ||
      PLACEHOLDER_PATTERN.test(requirement.description)
    )
      push('PLACEHOLDER_TEXT', 'Contiene un marcador de posición (TBD/TBC) sin justificar.');

    const dependencySet = new Set(requirement.dependencyArtifactIds);
    if (dependencySet.size !== requirement.dependencyArtifactIds.length)
      push('DUPLICATE_DEPENDENCY', 'Tiene dependencias duplicadas.');
    if (dependencySet.has(requirement.id)) push('SELF_DEPENDENCY', 'Depende de sí mismo.');
    for (const dependencyId of dependencySet)
      if (!idSet.has(dependencyId))
        push('UNRESOLVED_DEPENDENCY', 'Referencia una dependencia que no existe en el proyecto.');

    if (
      requirement.origin === 'AI_GENERATED' &&
      (!requirement.sourceContextVersionId || !requirement.aiRunId)
    )
      push('MISSING_PROVENANCE', 'Un requisito generado por IA no conserva su procedencia exacta.');

    // Heuristic only, not a grammar/NLP analysis — flags for human review,
    // never blocks generation/approval by itself (spec §4.3).
    const sentenceCount = requirement.description
      .split(/[.;]+/)
      .map((sentence) => sentence.trim())
      .filter(Boolean).length;
    if (sentenceCount > 2 || MULTI_OBLIGATION_CONNECTOR.test(requirement.description))
      push(
        'POSSIBLE_MULTI_OBLIGATION',
        'Podría combinar más de una obligación; se recomienda revisión humana.',
      );

    const normalizedName = requirement.name.trim().toLocaleLowerCase('en-US');
    const codes = byNormalizedName.get(normalizedName) ?? [];
    codes.push(requirement.code);
    byNormalizedName.set(normalizedName, codes);
  }

  for (const codes of byNormalizedName.values()) {
    if (codes.length <= 1) continue;
    for (const code of codes) {
      const requirement = requirements.find((item) => item.code === code)!;
      issues.push({
        requirementId: requirement.id,
        code,
        rule: 'DUPLICATE_NAME',
        message: `Nombre duplicado (normalizado) con: ${codes.filter((other) => other !== code).join(', ')}.`,
      });
    }
  }

  return {
    standard: 'ISO/IEC/IEEE 29148:2018-aligned',
    totalRequirements: requirements.length,
    issues,
  };
}
