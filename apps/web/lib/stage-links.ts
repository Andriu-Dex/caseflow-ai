// Maps backend Readiness stage keys to their frontend route, and back. Single
// source of truth shared by Home (readiness overview) and AppShell (sidebar
// stepper), so both agree on where each stage of the Construction Pipeline
// (AGENTS.md §10) actually lives.
export const STAGE_LINKS: Record<string, string> = {
  SOURCES: '/sources',
  CONTEXT: '/context',
  REQUIREMENTS: '/requirements',
  USE_CASES: '/use-cases',
  USE_CASE_DIAGRAM: '/use-cases',
  DATA_MODEL: '/data-model',
  ER_DIAGRAM: '/data-model',
  NAVIGATION: '/design/navigation',
  SOFTWARE_ARCHITECTURE: '/design/software-architecture',
  SYSTEM_ARCHITECTURE: '/design/system-architecture',
  UI_BLUEPRINT: '/design/ui-blueprint',
  MOCKUPS: '/design/mockups',
  IMPACT: '/traceability',
};

// The reverse: which readiness stage key(s) a given route corresponds to.
// A route with no entry (e.g. /readiness itself) has no single stage.
export const ROUTE_STAGE_KEYS: Record<string, string[]> = {
  '/sources': ['SOURCES'],
  '/context': ['CONTEXT'],
  '/requirements': ['REQUIREMENTS'],
  '/use-cases': ['USE_CASES', 'USE_CASE_DIAGRAM'],
  '/data-model': ['DATA_MODEL', 'ER_DIAGRAM'],
  '/design/navigation': ['NAVIGATION'],
  '/design/software-architecture': ['SOFTWARE_ARCHITECTURE'],
  '/design/system-architecture': ['SYSTEM_ARCHITECTURE'],
  '/design/ui-blueprint': ['UI_BLUEPRINT'],
  '/design/mockups': ['MOCKUPS'],
  '/traceability': ['IMPACT'],
};

// Sequential position of each route within the 11-step Construction
// Pipeline shown by the sidebar stepper (Home and Readiness/Export are the
// map/gate bookends, not numbered steps themselves).
export const ROUTE_STEP_NUMBER: Record<string, number> = {
  '/sources': 1,
  '/context': 2,
  '/requirements': 3,
  '/use-cases': 4,
  '/data-model': 5,
  '/design/navigation': 6,
  '/design/software-architecture': 7,
  '/design/system-architecture': 8,
  '/design/ui-blueprint': 9,
  '/design/mockups': 10,
  '/traceability': 11,
};

export const TOTAL_PIPELINE_STEPS = 11;

// Ordered pipeline steps (route + label), used to find "the next step" and
// to determine whether a step is reachable (every earlier step satisfied).
export const PIPELINE_STEPS: { step: number; href: string; label: string }[] = [
  { step: 1, href: '/sources', label: 'Fuentes' },
  { step: 2, href: '/context', label: 'Contexto del proyecto' },
  { step: 3, href: '/requirements', label: 'Requisitos' },
  { step: 4, href: '/use-cases', label: 'Casos de uso' },
  { step: 5, href: '/data-model', label: 'Modelo de datos' },
  { step: 6, href: '/design/navigation', label: 'Navegación' },
  { step: 7, href: '/design/software-architecture', label: 'Arquitectura de software' },
  { step: 8, href: '/design/system-architecture', label: 'Arquitectura de sistema' },
  { step: 9, href: '/design/ui-blueprint', label: 'UI Blueprint' },
  { step: 10, href: '/design/mockups', label: 'Mockups' },
  { step: 11, href: '/traceability', label: 'Trazabilidad' },
];

export type StepReadiness = 'satisfied' | 'next' | 'pending' | 'unknown';

// Shared readiness->per-route state computation, so the sidebar stepper and
// any in-page "next step" CTA never disagree about what's satisfied, next,
// or still pending.
export function computeStepState(
  href: string,
  stages: { key: string; satisfied: boolean }[] | undefined,
): StepReadiness {
  if (!stages) return 'unknown';
  const keys = ROUTE_STAGE_KEYS[href];
  if (!keys) return 'unknown';
  const relevant = stages.filter((s) => keys.includes(s.key));
  if (relevant.length && relevant.every((s) => s.satisfied)) return 'satisfied';
  const nextStage = stages.find((s) => !s.satisfied);
  if (nextStage && keys.includes(nextStage.key)) return 'next';
  return 'pending';
}
