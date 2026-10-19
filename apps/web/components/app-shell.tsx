'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  ChevronRight,
  ClipboardCheck,
  Check,
  FolderKanban,
  Hammer,
  Home,
  Lock,
  RefreshCw,
  PanelLeftClose,
  PanelLeftOpen,
  Settings,
  Sparkles,
} from 'lucide-react';
import { toast } from 'sonner';
import type { MouseEvent, ReactNode } from 'react';
import { useEffect, useState } from 'react';
import { Separator } from '@caseflow-ai/ui';
import { api } from '../lib/api';
import { useActiveProject } from '../lib/active-project';
import {
  computeConstructionStepState,
  computeStepState,
  CONSTRUCTION_STEP_NUMBER,
  CONSTRUCTION_STEPS,
  PIPELINE_STEPS,
  ROUTE_STEP_NUMBER,
  ROUTE_STAGE_KEYS,
  STAGE_LINKS,
} from '../lib/stage-links';
import { useConstructionState } from '../lib/use-construction-state';
import { StageOutdatedBanner } from './stage-outdated-banner';
import { ProjectSwitcher } from './project-switcher';

type NavItem = { href: string; label: string };

// Per-viewer convenience (whether this browser keeps the sidebar folded).
const COLLAPSED_KEY = 'caseflow.sidebarCollapsed';

// The Construction group (forward engineering, AGENTS.md §10) comes after
// the 12-step planning pipeline, not alongside it: collapsing it until
// planning is done keeps the sidebar reading as one stepper instead of two
// unrelated flows, and avoids the user clicking into a page whose every
// action the backend would reject anyway (no approved plan yet).
const CONSTRUCTION_GROUP_LABEL = 'Construcción';

// Order matches the Construction Pipeline (AGENTS.md §10): each group is a
// consecutive slice of the same linear sequence, numbered (via
// ROUTE_STEP_NUMBER) across the whole flow rather than per group, so the
// sidebar reads as one stepper.
const NAV_GROUPS: { label: string; items: NavItem[] }[] = [
  {
    label: '',
    items: [
      { href: '/', label: 'Inicio' },
      { href: '/projects', label: 'Proyectos' },
    ],
  },
  {
    label: 'Conocimiento',
    items: [
      { href: '/sources', label: 'Fuentes' },
      { href: '/context', label: 'Contexto del proyecto' },
    ],
  },
  {
    label: 'Análisis',
    items: [
      { href: '/requirements', label: 'Requisitos' },
      { href: '/use-cases', label: 'Casos de uso' },
      { href: '/data-model', label: 'Modelo de datos' },
      { href: '/class-diagram', label: 'Diagrama de clases' },
    ],
  },
  {
    label: 'Diseño',
    items: [
      { href: '/design/navigation', label: 'Navegación' },
      { href: '/design/software-architecture', label: 'Arquitectura de software' },
      { href: '/design/system-architecture', label: 'Arquitectura de sistema' },
      { href: '/design/ui-blueprint', label: 'Plano de interfaz' },
      { href: '/design/theme', label: 'Tema y colores' },
      { href: '/design/mockups', label: 'Bocetos' },
    ],
  },
  {
    // Step 13, the last of the numbered planning pipeline — stays unlabeled
    // like the "Inicio" group, continuing the stepper visually instead of
    // reading as a sibling of the two project-level tools below it.
    label: '',
    items: [{ href: '/traceability', label: 'Trazabilidad' }],
  },
  {
    // Project-level tools, not pipeline steps: never get a check/number, so
    // they get their own labeled group instead of sitting unlabeled next to
    // Trazabilidad, where they used to read as two more unfinished steps.
    label: 'Entregables',
    items: [
      { href: '/readiness', label: 'Preparación / Exportar' },
      { href: '/coherence', label: 'Matriz de coherencia' },
      { href: '/baselines', label: 'Líneas Base' },
    ],
  },
  {
    // Not numbered readiness steps: construction gates are enforced by the
    // backend (approved plan → approved design baseline → generation). Comes
    // after the numbered 1-12 pipeline (it ends at Trazabilidad), never
    // between two of its steps — Construction is what follows planning, not
    // a step within it.
    label: 'Construcción',
    items: [
      { href: '/construction/generation-plan', label: 'Plan de generación' },
      { href: '/construction/conceptual-model', label: 'Modelo conceptual' },
      { href: '/construction/design-baseline', label: 'Aprobación de diseño' },
      { href: '/construction/implementation-plan', label: 'Plan de implementación' },
      { href: '/construction/generation-runs', label: 'Generación de código' },
    ],
  },
];

// BUILD_ONLY route (DEC-116): planning is generated and approved by the
// system, so the sidebar shows the prompt/progress page and the construction
// results instead of the twelve planning steps.
const BUILD_ONLY_GROUPS: { label: string; items: NavItem[] }[] = [
  NAV_GROUPS[0]!,
  { label: 'Solo construcción', items: [{ href: '/build', label: 'Construcción automática' }] },
  NAV_GROUPS.find((group) => group.label === CONSTRUCTION_GROUP_LABEL)!,
];

// EXPRESS route (DEC-116): the assistant drives planning and its bulk
// reviews; the planning pages stay reachable from it for editing.
const EXPRESS_GROUPS: { label: string; items: NavItem[] }[] = [
  NAV_GROUPS[0]!,
  { label: 'Exprés', items: [{ href: '/express', label: 'Asistente Exprés' }] },
  NAV_GROUPS.find((group) => group.label === CONSTRUCTION_GROUP_LABEL)!,
];

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { projectId } = useActiveProject();
  const queryClient = useQueryClient();
  useEffect(() => {
    const changed = () => {
      if (projectId) void queryClient.invalidateQueries({ queryKey: ['readiness', projectId] });
    };
    window.addEventListener('caseflow:readiness-changed', changed);
    return () => window.removeEventListener('caseflow:readiness-changed', changed);
  }, [projectId, queryClient]);
  const readiness = useQuery({
    queryKey: ['readiness', projectId],
    queryFn: () => api.readiness.get(projectId!),
    enabled: Boolean(projectId) && pathname !== '/login' && pathname !== '/register',
  });
  const project = useQuery({
    queryKey: ['project', projectId],
    queryFn: () => api.projects.get(projectId!),
    enabled: Boolean(projectId) && pathname !== '/login' && pathname !== '/register',
  });
  const construction = useConstructionState(
    Boolean(projectId) && pathname !== '/login' && pathname !== '/register'
      ? (projectId ?? undefined)
      : undefined,
  );
  const route = project.data?.workflowRoute;
  // The prompt routes run their own gates server-side: construction is
  // reachable without walking the twelve planning steps by hand.
  const buildOnly = route === 'BUILD_ONLY' || route === 'EXPRESS';
  const groups =
    route === 'BUILD_ONLY' ? BUILD_ONLY_GROUPS : route === 'EXPRESS' ? EXPRESS_GROUPS : NAV_GROUPS;
  // Folded into an icon rail on wider screens; Ctrl/Cmd+B toggles it.
  const [collapsed, setCollapsed] = useState(false);
  useEffect(() => {
    try {
      setCollapsed(window.localStorage.getItem(COLLAPSED_KEY) === 'true');
    } catch {
      // Blocked storage: the sidebar simply starts expanded.
    }
  }, []);
  function toggleCollapsed() {
    setCollapsed((previous) => {
      try {
        window.localStorage.setItem(COLLAPSED_KEY, String(!previous));
      } catch {
        // Not remembered, still toggled for this visit.
      }
      return !previous;
    });
  }
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'b') {
        event.preventDefault();
        toggleCollapsed();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);
  // Labels stay readable to screen readers when only icons are shown.
  const label = collapsed ? 'md:sr-only' : '';

  if (pathname === '/login' || pathname === '/register') {
    return (
      <main
        id="main-content"
        className="flex min-h-screen items-center justify-center bg-background p-4"
      >
        {children}
      </main>
    );
  }

  const stages = readiness.data?.stages;
  const firstOutdated = stages?.find((stage) => stage.currency === 'OUTDATED');
  const upstreamLabel = stages?.find(
    (stage) => stage.key === firstOutdated?.outdatedSince?.stage,
  )?.label;

  // A step is reachable only once every earlier step in the pipeline is
  // satisfied — this is a navigation affordance, not a validation rule: the
  // backend independently enforces every real precondition regardless of
  // whether the UI lets a user click through in sequence.
  function firstBlockingStep(href: string): { label: string } | null {
    const constructionTarget = CONSTRUCTION_STEP_NUMBER[href];
    if (constructionTarget) {
      // The prompt routes approve these steps automatically, and while the
      // state is loading nothing is locked.
      if (buildOnly || !construction.data) return null;
      const done = (step: { href: string }) =>
        computeConstructionStepState(step.href, construction.data) === 'satisfied';
      // Same as planning: a step already reached is not locked again when an
      // earlier one changes.
      if (CONSTRUCTION_STEPS.some((step) => step.step >= constructionTarget && done(step)))
        return null;
      return (
        CONSTRUCTION_STEPS.find((step) => step.step < constructionTarget && !done(step)) ?? null
      );
    }
    const target = ROUTE_STEP_NUMBER[href];
    if (!target || !stages) return null;
    const state = computeStepState(href, stages);
    if (state === 'outdated') return null;
    if (state === 'blocked' && firstOutdated) return { label: firstOutdated.label };
    // Once the project has already progressed to this step (or past it), an
    // upstream edit must never re-lock it: the user fixes the earlier step
    // and keeps working where they were, seeing what may need review.
    const alreadyReached = PIPELINE_STEPS.some(
      (s) =>
        s.step >= target &&
        s.href !== '/traceability' &&
        computeStepState(s.href, stages) === 'satisfied',
    );
    if (alreadyReached) return null;
    for (const s of PIPELINE_STEPS) {
      if (s.step >= target) break;
      if (computeStepState(s.href, stages) !== 'satisfied') return { label: s.label };
    }
    return null;
  }

  function handleNavClick(e: MouseEvent<HTMLAnchorElement>, href: string) {
    const blocker = firstBlockingStep(href);
    if (blocker) {
      e.preventDefault();
      toast.warning(`Complete primero "${blocker.label}" antes de continuar con este paso.`);
    }
  }

  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:left-2 focus:top-2 focus:z-50 focus:rounded focus:bg-background focus:px-3 focus:py-2 focus:shadow-md"
      >
        Saltar al contenido
      </a>
      <nav
        aria-label="Navegación principal"
        className={`w-full shrink-0 border-b border-sidebar-border bg-sidebar p-4 text-sidebar-foreground shadow-lg transition-[width] duration-200 md:border-b-0 md:border-r ${
          collapsed ? 'md:w-16 md:px-2' : 'md:w-64'
        }`}
      >
        <div
          className={`mb-6 flex items-center gap-2 px-1 ${collapsed ? 'md:flex-col md:px-0' : ''}`}
        >
          <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-sidebar-active shadow-sm shadow-sidebar-active/50">
            <Sparkles className="size-4.5 text-white" aria-hidden="true" />
          </span>
          <span className={`text-lg font-semibold tracking-tight text-white ${label}`}>
            CASEFlow AI
          </span>
          <button
            type="button"
            onClick={toggleCollapsed}
            aria-label={collapsed ? 'Expandir menú' : 'Plegar menú'}
            aria-expanded={!collapsed}
            title={`${collapsed ? 'Expandir' : 'Plegar'} menú (Ctrl+B)`}
            className={`hidden size-8 items-center justify-center rounded-md text-sidebar-foreground/60 transition-colors hover:bg-white/5 hover:text-white md:inline-flex ${
              collapsed ? '' : 'ml-auto'
            }`}
          >
            {collapsed ? (
              <PanelLeftOpen className="size-4" aria-hidden="true" />
            ) : (
              <PanelLeftClose className="size-4" aria-hidden="true" />
            )}
          </button>
        </div>
        <div className="flex flex-col gap-5">
          {firstOutdated ? (
            <Link
              href={STAGE_LINKS[firstOutdated.key] ?? '/readiness'}
              title={`Cambió ${upstreamLabel ?? 'un paso anterior'}. Rehaga desde ${firstOutdated.label}.`}
              className="flex items-start gap-2 rounded-md border border-amber-700/50 bg-amber-950/30 p-2 text-xs text-amber-200"
            >
              <RefreshCw className="size-4 shrink-0" aria-hidden="true" />
              <span className={label}>
                Cambió {upstreamLabel ?? 'un paso anterior'}. Rehaga desde {firstOutdated.label}.
              </span>
            </Link>
          ) : null}
          {groups.map((group, i) => {
            const isConstruction = group.label === CONSTRUCTION_GROUP_LABEL;
            const planningComplete = readiness.data?.ready === true;
            if (isConstruction && !planningComplete && !buildOnly)
              return (
                <div key={i}>
                  <div
                    className={`mb-1.5 px-2 text-[11px] font-semibold tracking-widest text-sidebar-foreground/50 uppercase ${label}`}
                  >
                    {group.label}
                  </div>
                  <button
                    type="button"
                    title="Complete los 13 pasos de planificación para habilitar la construcción"
                    onClick={() =>
                      toast.warning(
                        'Complete los 13 pasos de planificación (Fuentes a Trazabilidad) antes de iniciar la construcción del proyecto.',
                      )
                    }
                    className={`flex w-full items-center gap-2.5 rounded-md px-2.5 py-1.5 text-left text-sm font-medium text-sidebar-foreground/40 transition-colors hover:bg-white/5 ${
                      collapsed ? 'md:justify-center md:px-0' : ''
                    }`}
                  >
                    <Lock className="size-4 shrink-0" aria-hidden="true" />
                    <span className={label}>Construcción</span>
                    <span
                      className={`ml-auto text-[11px] text-sidebar-foreground/30 ${collapsed ? 'md:hidden' : ''}`}
                    >
                      bloqueada
                    </span>
                    <ChevronRight
                      className={`size-3.5 shrink-0 ${collapsed ? 'md:hidden' : ''}`}
                      aria-hidden="true"
                    />
                  </button>
                  {i < groups.length - 1 ? <Separator className="mt-5 bg-sidebar-border" /> : null}
                </div>
              );
            return (
              <div key={i}>
                {group.label ? (
                  <div
                    className={`mb-1.5 flex items-center justify-between px-2 text-[11px] font-semibold tracking-widest text-sidebar-foreground/50 uppercase ${label}`}
                  >
                    <span>{group.label}</span>
                    {isConstruction ? (
                      <span className="inline-flex items-center gap-1 rounded bg-emerald-500/15 px-1.5 py-0.5 text-[9px] font-medium tracking-normal text-emerald-400 normal-case">
                        <Sparkles className="size-2.5 text-emerald-400" />
                        Desbloqueada
                      </span>
                    ) : null}
                  </div>
                ) : null}
                <ul className="flex flex-col gap-0.5">
                  {group.items.map((item) => {
                    const active =
                      item.href === '/'
                        ? pathname === '/'
                        : pathname === item.href || pathname.startsWith(item.href + '/');
                    const planningStep = ROUTE_STEP_NUMBER[item.href];
                    const constructionStep = CONSTRUCTION_STEP_NUMBER[item.href];
                    const step = planningStep ?? constructionStep;
                    const state = planningStep
                      ? computeStepState(item.href, stages)
                      : constructionStep
                        ? computeConstructionStepState(item.href, construction.data)
                        : 'unknown';
                    const locked = Boolean(firstBlockingStep(item.href));
                    return (
                      <li key={item.href}>
                        <Link
                          href={item.href}
                          aria-current={active ? 'page' : undefined}
                          onClick={(e) => handleNavClick(e, item.href)}
                          title={
                            locked
                              ? `${collapsed ? `${item.label}: b` : 'B'}loqueado — complete los pasos anteriores primero`
                              : state === 'outdated'
                                ? 'Por rehacer'
                                : state === 'next'
                                  ? `${collapsed ? `${item.label}: s` : 'S'}iguiente paso recomendado`
                                  : collapsed
                                    ? item.label
                                    : undefined
                          }
                          className={`relative flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-sm font-medium transition-colors ${
                            collapsed ? 'md:justify-center md:px-0' : ''
                          } ${
                            active
                              ? 'bg-sidebar-active text-white shadow-sm'
                              : locked
                                ? 'text-sidebar-foreground/40'
                                : 'text-sidebar-foreground/75 hover:bg-white/5 hover:text-white'
                          }`}
                        >
                          {step ? (
                            <span
                              className={`flex size-5 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold ${
                                state === 'outdated'
                                  ? 'bg-amber-500/20 text-amber-300'
                                  : state === 'satisfied'
                                    ? 'bg-emerald-500 text-white'
                                    : active || state === 'next'
                                      ? 'bg-white/20 text-white'
                                      : 'bg-white/10 text-sidebar-foreground/60'
                              }`}
                            >
                              {state === 'outdated' ? (
                                <RefreshCw className="size-3" aria-hidden="true" />
                              ) : state === 'satisfied' ? (
                                <Check className="size-3" aria-hidden="true" />
                              ) : locked ? (
                                <Lock className="size-2.5" aria-hidden="true" />
                              ) : (
                                step
                              )}
                            </span>
                          ) : item.href === '/projects' ? (
                            <FolderKanban className="size-4 shrink-0" aria-hidden="true" />
                          ) : item.href === '/readiness' ? (
                            <ClipboardCheck className="size-4 shrink-0" aria-hidden="true" />
                          ) : item.href.startsWith('/construction/') ||
                            item.href === '/build' ||
                            item.href === '/express' ? (
                            <Hammer className="size-4 shrink-0" aria-hidden="true" />
                          ) : (
                            <Home className="size-4 shrink-0" aria-hidden="true" />
                          )}
                          <span className={label}>{item.label}</span>
                          {state === 'outdated' && !collapsed ? (
                            <span className="ml-auto text-[10px] text-amber-300">Por rehacer</span>
                          ) : null}
                          {state === 'next' ? (
                            <span
                              className={`ml-auto size-1.5 shrink-0 rounded-full bg-emerald-400 ${
                                collapsed ? 'md:absolute md:top-1 md:right-1 md:ml-0' : ''
                              }`}
                              aria-label="Siguiente paso recomendado"
                            />
                          ) : null}
                        </Link>
                      </li>
                    );
                  })}
                </ul>
                {i < groups.length - 1 ? <Separator className="mt-5 bg-sidebar-border" /> : null}
              </div>
            );
          })}
        </div>
        <Separator className="mt-5 bg-sidebar-border" />
        <Link
          href="/settings/ai"
          aria-current={pathname === '/settings/ai' ? 'page' : undefined}
          title={collapsed ? 'Ajustes de IA' : undefined}
          className={`mt-5 flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-sm font-medium transition-colors ${
            collapsed ? 'md:justify-center md:px-0' : ''
          } ${
            pathname === '/settings/ai'
              ? 'bg-sidebar-active text-white shadow-sm'
              : 'text-sidebar-foreground/75 hover:bg-white/5 hover:text-white'
          }`}
        >
          <Settings className="size-4 shrink-0" aria-hidden="true" />
          <span className={label}>Ajustes de IA</span>
        </Link>
      </nav>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex flex-wrap items-center justify-between gap-2 border-b bg-card px-4 py-3 shadow-sm">
          <ProjectSwitcher />
        </header>
        <main id="main-content" className="min-w-0 flex-1 bg-background p-4 md:p-6">
          {projectId
            ? (ROUTE_STAGE_KEYS[pathname] ?? []).map((stage) => (
                <StageOutdatedBanner key={stage} stage={stage} projectId={projectId} />
              ))
            : null}
          {computeStepState(pathname, stages) === 'blocked' && firstOutdated ? (
            <p className="mb-4 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-200">
              Primero rehaga{' '}
              <Link className="underline" href={STAGE_LINKS[firstOutdated.key] ?? '/readiness'}>
                {firstOutdated.label}
              </Link>
              .
            </p>
          ) : null}
          <div inert={computeStepState(pathname, stages) === 'blocked' || undefined}>
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
