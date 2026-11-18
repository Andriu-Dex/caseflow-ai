import type { ImplementationPlanContent } from '@caseflow-ai/contracts';
import type { PrismaService } from '../database/prisma.service';

type Plan = ImplementationPlanContent;
type RouteAction = Plan['routes'][number]['actions'][number];

// ADR-025: what an approved use case says, in the terms its criterion uses.
export type AcceptanceUseCase = {
  code: string;
  name: string;
  primaryActor: string;
  preconditions: string[];
  mainFlow: { actor: string; action: string }[];
  postconditions: string[];
  alternativeFlows: string[];
  requirementCodes: string[];
};

export type AcceptanceCriterion = {
  key: string;
  useCaseCode: string;
  useCaseName: string;
  given: string;
  when: string;
  then: string;
  alternativeFlows: string[];
  requirementCodes: string[];
  // The session the test opens: the role matching the actor, or the screens'.
  role: string;
  screens: { path: string; screenName: string; actions: string[] }[];
};

const fold = (value: string) =>
  value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .trim()
    .toLowerCase();

// An action that shows without a record: the validation runs on an empty
// database, so row actions, paging and links to one record are not required.
function shownWithoutRecord(action: RouteAction): boolean {
  if (action.interaction === 'PAGINATE_PREVIOUS' || action.interaction === 'PAGINATE_NEXT')
    return false;
  if (action.navigation)
    return !action.navigation.idField && !action.navigation.routePath.includes('[');
  if (action.endpoint) return !action.endpoint.includes(':');
  return action.operation === 'LIST' || action.operation === 'CREATE';
}

const sentence = (items: string[], fallback: string) =>
  items.length ? items.map((item) => item.replace(/[.\s]+$/, '')).join('; ') : fallback;

// One criterion per approved use case the plan's screens realize (a screen
// realizes the use cases its interface blueprint screen cites).
export function deriveCriteria(
  plan: Plan,
  blueprintScreens: { localId: string; relatedUseCaseCodes?: string[] }[],
  useCases: AcceptanceUseCase[],
): AcceptanceCriterion[] {
  const casesOf = new Map(blueprintScreens.map((s) => [s.localId, s.relatedUseCaseCodes ?? []]));
  const routes = plan.routes.filter((route) => !route.path.includes('['));
  return [...useCases]
    .sort((a, b) => a.code.localeCompare(b.code, 'es', { numeric: true }))
    .flatMap((useCase): AcceptanceCriterion[] => {
      const realizing = routes.filter((route) =>
        (casesOf.get(route.screenLocalId ?? '') ?? []).includes(useCase.code),
      );
      if (!realizing.length) return [];
      // Signing in is checked without a session (one would redirect away from
      // it), and signing out ends the session, so it goes last.
      const signIn = realizing.filter((route) => route.builtinView === 'ACCOUNT_ACCESS');
      const signedIn = realizing.filter((route) => route.builtinView !== 'ACCOUNT_ACCESS');
      const anonymous = !plan.authentication.required || !signedIn.length;
      const roles = [...new Set(signedIn.flatMap((route) => route.roles ?? []))];
      const role = anonymous
        ? ''
        : (roles.find((r) => fold(r) === fold(useCase.primaryActor)) ??
          roles[0] ??
          plan.authentication.roles[0] ??
          '');
      const signsOut = (route: (typeof routes)[number]) =>
        route.actions.some((action) => action.endpoint === 'POST /auth/logout');
      const screens = (anonymous ? (signIn.length ? signIn : realizing) : signedIn)
        .filter((route) => !role || !route.roles?.length || route.roles.includes(role))
        .sort((a, b) => Number(signsOut(a)) - Number(signsOut(b)))
        .map((route) => ({
          path: route.path,
          screenName: route.screenName,
          actions: route.actions.filter(shownWithoutRecord).map((action) => action.label),
        }));
      if (!screens.length) return [];
      const steps = useCase.mainFlow.filter(
        (step) => fold(step.actor) === fold(useCase.primaryActor),
      );
      const shown = (steps.length ? steps : useCase.mainFlow).map(
        (step) => step.action.charAt(0).toLowerCase() + step.action.slice(1),
      );
      const preconditions = sentence(useCase.preconditions, 'el sistema está disponible');
      return [
        {
          key: `CA-${useCase.code}`,
          useCaseCode: useCase.code,
          useCaseName: useCase.name,
          given: role ? `${preconditions}; y ${useCase.primaryActor} inició sesión` : preconditions,
          when: `${useCase.primaryActor} ${sentence(shown.slice(0, 3), useCase.name.toLowerCase())}${shown.length > 3 ? '…' : ''}`,
          then: sentence(useCase.postconditions, 'el caso de uso termina sin errores'),
          alternativeFlows: useCase.alternativeFlows,
          requirementCodes: useCase.requirementCodes,
          role,
          screens,
        },
      ];
    });
}

export const ACCEPTANCE_SPEC_PATH = 'apps/web/e2e/acceptance.spec.ts';

// The generated Playwright test: each criterion opens its screens with its
// role, without browser or API errors, and finds the actions it offers.
export function acceptanceSpec(criteria: AcceptanceCriterion[]): string {
  const cases = criteria.map((c) => ({
    key: c.key,
    title: `[${c.key}] ${c.useCaseName}`,
    role: c.role,
    screens: c.screens,
  }));
  return `import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';

// Acceptance criteria (ADR-025), derived from the approved use cases.
type Session = { token: string | null; scopeId: string | null };
const CRITERIA: { key: string; title: string; role: string; screens: { path: string; screenName: string; actions: string[] }[] }[] = ${JSON.stringify(cases, null, 2)};
const API_URL = process.env.E2E_API_URL ?? 'http://localhost:3001';
const sessions: Record<string, Session> = process.env.E2E_SESSIONS
  ? JSON.parse(readFileSync(process.env.E2E_SESSIONS, 'utf8'))
  : {};

for (const criterion of CRITERIA) {
  test(criterion.title, async ({ page }) => {
    const session = criterion.role ? sessions[criterion.role] : undefined;
    if (criterion.role) expect(session?.token, \`Missing test session for role \${criterion.role}\`).toBeTruthy();
    if (session)
      await page.addInitScript((value: Session) => {
        window.sessionStorage.setItem('access-token', value.token ?? '');
        if (value.scopeId) window.sessionStorage.setItem('operation-scope', value.scopeId);
      }, session);
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(\`Browser error: \${error.message}\`));
    page.on('response', (response) => {
      if (response.url().startsWith(API_URL) && response.status() >= 400)
        errors.push(\`API \${response.status()}: \${response.request().method()} \${response.url()}\`);
    });
    for (const screen of criterion.screens) {
      const response = await page.goto(screen.path, { waitUntil: 'networkidle' });
      expect(response?.ok(), \`\${screen.screenName} must open\`).toBe(true);
      expect(new URL(page.url()).pathname, \`\${screen.screenName} must not redirect\`).toBe(screen.path);
      for (const action of screen.actions)
        await expect(
          page.locator(\`[data-action=\${JSON.stringify(action)}]\`).first(),
          \`\${screen.screenName}: the action «\${action}» must be offered\`,
        ).toBeVisible();
    }
    expect(errors).toEqual([]);
  });
}
`;
}

// Each criterion's result. A run whose tests all passed passed every
// criterion. Otherwise the runner's list report says which: a passed test is
// marked "✓" and a failed one "✘" on its title line, and a criterion that does
// not appear did not run, which does not count as passed.
export function acceptanceResults(
  output: string,
  keys: string[],
  allPassed: boolean,
): Map<string, { passed: boolean; message: string | null }> {
  const results = new Map<string, { passed: boolean; message: string | null }>();
  if (allPassed) {
    for (const key of keys) results.set(key, { passed: true, message: null });
    return results;
  }
  for (const line of output.split('\n'))
    for (const key of keys) {
      if (!line.includes(`[${key}]`) || results.get(key)?.passed === false) continue;
      if (/[✓✔]/.test(line)) results.set(key, { passed: true, message: null });
      else if (/[✘✗×]/.test(line))
        results.set(key, { passed: false, message: 'La prueba de aceptación falló.' });
    }
  for (const key of keys)
    if (!results.has(key))
      results.set(key, {
        passed: false,
        message: 'La prueba de aceptación no llegó a ejecutarse.',
      });
  return results;
}

// The criteria of a run: its plan, the screens frozen in its design baseline
// and the approved use cases they cite.
export async function loadCriteria(
  prisma: PrismaService,
  projectId: string,
  plan: Plan,
  designBaselineId: string,
): Promise<AcceptanceCriterion[]> {
  const entry = await prisma.designBaselineEntry.findFirst({
    where: { baselineId: designBaselineId, role: 'UI_BLUEPRINT', baseline: { projectId } },
    select: {
      artifactVersion: { select: { structuredAnalysisDetail: { select: { content: true } } } },
    },
  });
  const screens =
    (
      entry?.artifactVersion.structuredAnalysisDetail?.content as {
        screens?: { localId: string; relatedUseCaseCodes?: string[] }[];
      } | null
    )?.screens ?? [];
  const codes = [...new Set(screens.flatMap((screen) => screen.relatedUseCaseCodes ?? []))];
  if (!codes.length) return [];
  const versions = await prisma.artifactVersion.findMany({
    where: {
      projectId,
      status: 'APPROVED',
      artifact: { code: { in: codes }, artifactTypeCode: 'USE_CASE', archivedAt: null },
    },
    orderBy: { versionNumber: 'desc' },
    include: {
      artifact: { select: { code: true } },
      useCaseDetail: {
        include: {
          preconditions: { orderBy: { position: 'asc' } },
          postconditions: { orderBy: { position: 'asc' } },
          mainFlowSteps: { orderBy: { position: 'asc' } },
          alternativeFlows: { orderBy: { position: 'asc' } },
          requirementLinks: {
            include: { requirementVersion: { select: { artifact: { select: { code: true } } } } },
          },
        },
      },
    },
  });
  const latest = new Map<string, (typeof versions)[number]>();
  for (const version of versions)
    if (!latest.has(version.artifact.code)) latest.set(version.artifact.code, version);
  const useCases = [...latest.values()].flatMap((version): AcceptanceUseCase[] => {
    const detail = version.useCaseDetail;
    if (!detail) return [];
    return [
      {
        code: version.artifact.code,
        name: detail.name,
        primaryActor: detail.primaryActor,
        preconditions: detail.preconditions.map((item) => item.description),
        mainFlow: detail.mainFlowSteps.map((step) => ({ actor: step.actor, action: step.action })),
        postconditions: detail.postconditions.map((item) => item.description),
        alternativeFlows: detail.alternativeFlows.map((flow) => flow.name),
        requirementCodes: [
          ...new Set(detail.requirementLinks.map((link) => link.requirementVersion.artifact.code)),
        ].sort((a, b) => a.localeCompare(b, 'es', { numeric: true })),
      },
    ];
  });
  return deriveCriteria(plan, screens, useCases);
}
