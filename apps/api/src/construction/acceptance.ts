import type { ImplementationPlanContent } from '@caseflow-ai/contracts';
import { collectionPath } from '../code-generation/naming';
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
  // ADR-027: the write the test carries out, when its screens offer one.
  operation?: AcceptanceOperation;
};

// The main write of a criterion: on which screen, by which control, and the
// API request that carries it out. A generic create must complete; a business
// action may also be refused, as long as the screen says why.
export type AcceptanceOperation = {
  screenPath: string;
  label: string;
  method: 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  apiPath: string;
  business: boolean;
  // The record a screen with parameters opens: each parameter is the first
  // record the role may list at that collection.
  params?: { name: string; apiPath: string }[];
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

// The sign-in screen: the built-in one or the screen that signs in.
const isSignIn = (route: Plan['routes'][number]) =>
  route.builtinView === 'ACCOUNT_ACCESS' ||
  route.actions.some((action) => action.endpoint === 'POST /auth/login');

// The record each parameter of a screen opens: the entity named by the
// parameter ([screeningId] is a Screening), or the screen's own entity for its
// only parameter, when the role can list it. Undefined when one cannot be found.
function screenParams(plan: Plan, route: Plan['routes'][number]) {
  const names = [...route.path.matchAll(/\[([A-Za-z0-9]+)\]/g)].map((match) => match[1]!);
  const params = names.map((name) => {
    const entity =
      plan.entities?.find(
        (item) => `${item.name.charAt(0).toLowerCase()}${item.name.slice(1)}Id` === name,
      ) ??
      (names.length === 1
        ? plan.entities?.find((item) => item.localId === route.entityLocalId)
        : undefined);
    return entity?.operations.includes('LIST')
      ? { name, apiPath: collectionPath(entity.name) }
      : undefined;
  });
  return params.every(Boolean) ? (params as { name: string; apiPath: string }[]) : undefined;
}

// The first write the screens offer: a generic create, update or delete of the
// screen's entity, or a business action. Signing in and out are the template's
// own and are checked by opening their screens. A generic create or update
// must complete; a delete or a business action may be refused.
function mainOperation(plan: Plan, screens: Plan['routes']): AcceptanceOperation | undefined {
  for (const route of screens) {
    const params = route.path.includes('[') ? screenParams(plan, route) : [];
    if (!params) continue;
    const located = params.length ? { params } : {};
    const entity = plan.entities?.find((item) => item.localId === route.entityLocalId);
    for (const action of route.actions) {
      const collection = entity ? collectionPath(entity.name) : undefined;
      // A generic update or delete needs the record its screen shows.
      if (collection && action.operation === 'CREATE')
        return {
          screenPath: route.path,
          label: action.label,
          method: 'POST',
          apiPath: collection,
          business: false,
          ...located,
        };
      if (collection && params.length && action.operation === 'UPDATE')
        return {
          screenPath: route.path,
          label: action.label,
          method: 'PATCH',
          apiPath: `${collection}/:id`,
          business: false,
          ...located,
        };
      if (collection && params.length && action.operation === 'DELETE')
        return {
          screenPath: route.path,
          label: action.label,
          method: 'DELETE',
          apiPath: `${collection}/:id`,
          business: true,
          ...located,
        };
      const [method, path] = action.endpoint?.split(' ') ?? [];
      if (
        (method === 'POST' || method === 'PATCH' || method === 'PUT' || method === 'DELETE') &&
        path &&
        (!path.includes(':') || params.length) &&
        !path.startsWith('/auth/')
      )
        return {
          screenPath: route.path,
          label: action.label,
          method,
          apiPath: path,
          business: true,
          ...located,
        };
    }
  }
  return undefined;
}

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
      const signIn = realizing.filter(isSignIn);
      const signedIn = realizing.filter((route) => !isSignIn(route));
      // A use case with the sign-in screen is about access: that screen, signed out.
      const anonymous = !plan.authentication.required || signIn.length > 0;
      const roles = [...new Set(signedIn.flatMap((route) => route.roles ?? []))];
      const role = anonymous
        ? ''
        : (roles.find((r) => fold(r) === fold(useCase.primaryActor)) ??
          roles[0] ??
          plan.authentication.roles[0] ??
          '');
      const signsOut = (route: (typeof routes)[number]) =>
        route.actions.some((action) => action.endpoint === 'POST /auth/logout');
      const opened = (anonymous ? (signIn.length ? signIn : realizing) : signedIn)
        .filter((route) => !role || !route.roles?.length || route.roles.includes(role))
        .sort((a, b) => Number(signsOut(a)) - Number(signsOut(b)));
      // A write of a screen that needs no record first; else one of a record's
      // screen of the same use case, opened on a record of the demonstration data.
      const ofRecords = plan.routes.filter(
        (route) =>
          route.path.includes('[') &&
          (casesOf.get(route.screenLocalId ?? '') ?? []).includes(useCase.code) &&
          (!role || !route.roles?.length || route.roles.includes(role)),
      );
      const operation = anonymous
        ? undefined
        : (mainOperation(plan, opened) ?? mainOperation(plan, ofRecords));
      const screens = opened.map((route) => ({
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
          ...(operation ? { operation } : {}),
        },
      ];
    });
}

export const ACCEPTANCE_SPEC_PATH = 'apps/web/e2e/acceptance.spec.ts';

// The generated Playwright test: each criterion opens its screens with its
// role, without browser or API errors, and finds the actions it offers. Then
// it carries out its main write (ADR-027): the form of that action is filled
// from its own controls and sent, and the API answer is what decides.
export function acceptanceSpec(criteria: AcceptanceCriterion[]): string {
  const cases = criteria.map((c) => ({
    key: c.key,
    title: `[${c.key}] ${c.useCaseName}`,
    role: c.role,
    screens: c.screens,
    ...(c.operation ? { operation: c.operation } : {}),
  }));
  return `import { readFileSync } from 'node:fs';
import { expect, test, type Locator, type Page } from '@playwright/test';

// Acceptance criteria (ADR-025, ADR-027), derived from the approved use cases.
type Session = { token: string | null; scopeId: string | null };
type Operation = { screenPath: string; label: string; method: string; apiPath: string; business: boolean; params?: { name: string; apiPath: string }[] };
const CRITERIA: { key: string; title: string; role: string; screens: { path: string; screenName: string; actions: string[] }[]; operation?: Operation }[] = ${JSON.stringify(cases, null, 2)};
const API_URL = process.env.E2E_API_URL ?? 'http://localhost:3001';
const sessions: Record<string, Session> = process.env.E2E_SESSIONS
  ? JSON.parse(readFileSync(process.env.E2E_SESSIONS, 'utf8'))
  : {};

// The request of an operation: its method and path, a parameter being any segment.
const matches = (operation: Operation, method: string, url: string) =>
  method === operation.method &&
  url.startsWith(API_URL) &&
  new RegExp('^' + operation.apiPath.replace(/:[A-Za-z0-9]+/g, '[^/]+') + '$').test(new URL(url).pathname);

// A value each control accepts, read from the control itself. Texts carry a
// mark of this run so they never repeat a unique value of the demo data.
async function fill(form: Locator, mark: string): Promise<void> {
  // A list gets one item, a list inside it too: each add button is pressed once.
  for (let round = 0; round < 10; round++) {
    const add = form
      .locator('button:not([data-acceptance-added])', { hasText: 'Agregar elemento' })
      .first();
    if (!(await add.count()) || !(await add.isEnabled())) break;
    // Pressed through its handle: once marked, the locator no longer finds it.
    const button = await add.elementHandle();
    await button!.evaluate((element) => element.setAttribute('data-acceptance-added', ''));
    await button!.click();
  }
  const radios = new Set<string>();
  for (const control of await form.locator('input, select, textarea').all()) {
    if (!(await control.isVisible()) || !(await control.isEnabled())) continue;
    if ((await control.getAttribute('readonly')) !== null) continue;
    const tag = await control.evaluate((element) => element.tagName);
    const type = ((await control.getAttribute('type')) ?? 'text').toLowerCase();
    if (tag === 'SELECT') {
      const option = await control.evaluate(
        (element) =>
          [...(element as HTMLSelectElement).options].find((item) => item.value && !item.disabled)?.value ?? '',
      );
      if (option && !(await control.inputValue())) await control.selectOption(option);
      continue;
    }
    if (type === 'radio') {
      const name = (await control.getAttribute('name')) ?? '';
      if (!radios.has(name) && !(await form.locator(\`input[type=radio][name="\${name}"]:checked\`).count()))
        await control.check();
      radios.add(name);
      continue;
    }
    if (['hidden', 'file', 'checkbox', 'submit', 'button', 'reset'].includes(type)) continue;
    if (await control.inputValue()) continue;
    const min = await control.getAttribute('min');
    const max = Number(await control.getAttribute('maxlength')) || 120;
    const mode = await control.getAttribute('inputmode');
    const text = \`Prueba \${mark}\`;
    const value =
      type === 'number' ? (min && Number(min) > 0 ? min : '1')
      : type === 'date' ? (min && min > '2026-12-15' ? min : '2026-12-15')
      : type === 'datetime-local' ? (min && min > '2026-12-15T18:00' ? min : '2026-12-15T18:00')
      : type === 'time' ? '18:00'
      : type === 'email' ? \`prueba.\${mark}@ejemplo.com\`
      : type === 'password' ? 'Clave-segura-2026'
      : type === 'tel' ? '0991234567'
      : type === 'url' ? 'https://ejemplo.com'
      : mode === 'decimal' ? '12.50'
      : mode === 'numeric' ? '5'
      : text.slice(0, max);
    await control.fill(value);
  }
}

// The screen of the operation, each parameter being the first record the
// role lists at its collection; null when there is none to open.
async function locate(operation: Operation, session?: Session): Promise<string | null> {
  let path = operation.screenPath;
  for (const param of operation.params ?? []) {
    const headers: Record<string, string> = {};
    if (session?.token) headers.authorization = \`Bearer \${session.token}\`;
    if (session?.scopeId) headers['x-operation-scope'] = session.scopeId;
    const response = await fetch(\`\${API_URL}\${param.apiPath}?limit=1\`, { headers });
    if (!response.ok) return null;
    const body = (await response.json()) as { id?: string }[] | { items?: { id?: string }[] };
    const id = (Array.isArray(body) ? body : (body.items ?? []))[0]?.id;
    if (!id) return null;
    path = path.replace(\`[\${param.name}]\`, id);
  }
  return path;
}

// Sends the operation and waits for its answer; a confirmation it asks for is accepted.
async function carryOut(page: Page, operation: Operation, path: string, mark: string) {
  await page.goto(path, { waitUntil: 'networkidle' });
  const action = page.locator(\`[data-action=\${JSON.stringify(operation.label)}]\`).first();
  await expect(action, \`The action «\${operation.label}» must be offered\`).toBeVisible();
  // Its fields: the form around it, a form inside it, or (an action form
  // without a form element) the closest container of the button with controls.
  const enclosing = action.locator('xpath=ancestor-or-self::form[1]');
  const inner = action.locator('form');
  // An empty list has no control yet, only its fieldset with the add button.
  const around = action.locator(
    'xpath=ancestor::*[.//input or .//select or .//textarea or .//fieldset][1]',
  );
  const form = (await enclosing.count())
    ? enclosing.first()
    : (await inner.count())
      ? inner.first()
      : around.first();
  const hasForm = (await form.count()) > 0;
  if (hasForm) await fill(form, mark);
  const submit = (await action.evaluate((element) => element.tagName === 'BUTTON'))
    ? action
    : (await form.locator('button[type=submit]').count())
      ? form.locator('button[type=submit]').first()
      : action.locator('button').first();
  // When it does not, what the form shows says why (a missing value, a query that failed).
  const shown = (await form.innerText().catch(() => '')).replace(/\\s+/g, ' ').slice(0, 400);
  await expect(
    submit,
    \`«\${operation.label}» must accept the data it was given. The form shows: \${shown}\`,
  ).toBeEnabled();
  page.once('dialog', (dialog) => void dialog.accept());
  const answer = page
    .waitForResponse((response) => matches(operation, response.request().method(), response.url()), {
      timeout: 20_000,
    })
    .catch(() => null);
  await submit.click();
  const confirm = page.getByRole('alertdialog').getByRole('button').last();
  if (await confirm.isVisible({ timeout: 1_500 }).catch(() => false)) await confirm.click();
  return answer;
}

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
    const operation = criterion.operation;
    page.on('pageerror', (error) => errors.push(\`Browser error: \${error.message}\`));
    page.on('response', (response) => {
      const method = response.request().method();
      // The operation's own refusal is judged below, by its kind.
      if (operation && matches(operation, method, response.url()) && response.status() < 500) return;
      if (response.url().startsWith(API_URL) && response.status() >= 400)
        errors.push(\`API \${response.status()}: \${method} \${response.url()}\`);
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
    const path = operation ? await locate(operation, session) : null;
    if (operation && !path)
      console.log('ACCEPTANCE ' + JSON.stringify({ key: criterion.key, label: operation.label, skipped: true }));
    if (operation && path) {
      const answer = await carryOut(page, operation, path, Date.now().toString(36));
      expect(answer, \`«\${operation.label}» must send its request\`).not.toBeNull();
      const status = answer!.status();
      expect(status, \`«\${operation.label}» must not fail on the server\`).toBeLessThan(500);
      if (status >= 400) {
        expect(operation.business, \`«\${operation.label}» must complete with valid data (HTTP \${status})\`).toBe(true);
        await expect(
          page.locator('[role=alert], [data-sonner-toast]').first(),
          \`«\${operation.label}» must say why it was refused\`,
        ).toBeVisible();
      }
      console.log('ACCEPTANCE ' + JSON.stringify({ key: criterion.key, label: operation.label, status }));
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
  // ADR-027: what the operation of each criterion did, as its test printed it.
  const done = new Map<string, string>();
  for (const match of output.matchAll(/ACCEPTANCE (\{.*\})/g)) {
    try {
      const line = JSON.parse(match[1]!) as {
        key: string;
        label: string;
        status?: number;
        skipped?: boolean;
      };
      done.set(
        line.key,
        line.skipped
          ? `No había registros con los que ejecutar «${line.label}».`
          : line.status! < 400
            ? `Se completó «${line.label}».`
            : `«${line.label}» se rechazó con un aviso a la persona (HTTP ${line.status}).`,
      );
    } catch {
      // A line cut by the report is not a result.
    }
  }
  if (allPassed) {
    for (const key of keys) results.set(key, { passed: true, message: done.get(key) ?? null });
    return results;
  }
  for (const line of output.split('\n'))
    for (const key of keys) {
      if (!line.includes(`[${key}]`) || results.get(key)?.passed === false) continue;
      if (/[✓✔]/.test(line)) results.set(key, { passed: true, message: done.get(key) ?? null });
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

// The interface blueprint screens a design baseline froze, with the use
// cases each one realizes.
export async function blueprintScreens(
  prisma: PrismaService,
  projectId: string,
  designBaselineId: string,
): Promise<{ localId: string; relatedUseCaseCodes?: string[] }[]> {
  const entry = await prisma.designBaselineEntry.findFirst({
    where: { baselineId: designBaselineId, role: 'UI_BLUEPRINT', baseline: { projectId } },
    select: {
      artifactVersion: { select: { structuredAnalysisDetail: { select: { content: true } } } },
    },
  });
  return (
    (
      entry?.artifactVersion.structuredAnalysisDetail?.content as {
        screens?: { localId: string; relatedUseCaseCodes?: string[] }[];
      } | null
    )?.screens ?? []
  );
}

// The criteria of a run: its plan, the screens frozen in its design baseline
// and the approved use cases they cite.
export async function loadCriteria(
  prisma: PrismaService,
  projectId: string,
  plan: Plan,
  designBaselineId: string,
): Promise<AcceptanceCriterion[]> {
  const screens = await blueprintScreens(prisma, projectId, designBaselineId);
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
