'use client';

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ChevronRight, ClipboardCheck, Check, Hammer, Home, Lock, Sparkles } from 'lucide-react';
import type { MouseEvent, ReactNode } from 'react';
import { useEffect, useState } from 'react';
import { Alert, AlertDescription, Separator } from '@caseflow-ai/ui';
import { api } from '../lib/api';
import { useActiveProject } from '../lib/active-project';
import { computeStepState, PIPELINE_STEPS, ROUTE_STEP_NUMBER } from '../lib/stage-links';
import { ProjectSwitcher } from './project-switcher';

type NavItem = { href: string; label: string };

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
  { label: '', items: [{ href: '/', label: 'Inicio' }] },
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
    // Step 12, the last of the numbered planning pipeline — stays unlabeled
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

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { projectId } = useActiveProject();
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
  const buildOnly = project.data?.workflowRoute === 'BUILD_ONLY';
  const groups = buildOnly ? BUILD_ONLY_GROUPS : NAV_GROUPS;
  const [lockedMessage, setLockedMessage] = useState<string | null>(null);

  useEffect(() => setLockedMessage(null), [pathname]);

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

  // A step is reachable only once every earlier step in the pipeline is
  // satisfied — this is a navigation affordance, not a validation rule: the
  // backend independently enforces every real precondition regardless of
  // whether the UI lets a user click through in sequence.
  function firstBlockingStep(href: string): { label: string } | null {
    const target = ROUTE_STEP_NUMBER[href];
    if (!target || !stages) return null;
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
      setLockedMessage(`Complete primero "${blocker.label}" antes de continuar con este paso.`);
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
        className="w-full shrink-0 border-b border-sidebar-border bg-sidebar p-4 text-sidebar-foreground shadow-lg md:w-64 md:border-b-0 md:border-r"
      >
        <div className="mb-6 flex items-center gap-2 px-1">
          <span className="flex size-8 items-center justify-center rounded-lg bg-sidebar-active shadow-sm shadow-sidebar-active/50">
            <Sparkles className="size-4.5 text-white" aria-hidden="true" />
          </span>
          <span className="text-lg font-semibold tracking-tight text-white">CASEFlow AI</span>
        </div>
        {lockedMessage ? (
          <Alert className="mb-4 border-amber-400/40 bg-amber-500/10 text-amber-200 [&_svg]:text-amber-300">
            <Lock className="size-4" aria-hidden="true" />
            <AlertDescription className="text-amber-100">{lockedMessage}</AlertDescription>
          </Alert>
        ) : null}
        <div className="flex flex-col gap-5">
          {groups.map((group, i) => {
            const isConstruction = group.label === CONSTRUCTION_GROUP_LABEL;
            const planningComplete = readiness.data?.ready === true;
            if (isConstruction && !planningComplete && !buildOnly)
              return (
                <div key={i}>
                  <div className="mb-1.5 px-2 text-[11px] font-semibold tracking-widest text-sidebar-foreground/50 uppercase">
                    {group.label}
                  </div>
                  <button
                    type="button"
                    title="Complete los 12 pasos de planificación para habilitar la construcción"
                    onClick={() =>
                      setLockedMessage(
                        'Complete los 12 pasos de planificación (Fuentes a Trazabilidad) antes de iniciar la construcción del proyecto.',
                      )
                    }
                    className="flex w-full items-center gap-2.5 rounded-md px-2.5 py-1.5 text-left text-sm font-medium text-sidebar-foreground/40 transition-colors hover:bg-white/5"
                  >
                    <Lock className="size-4 shrink-0" aria-hidden="true" />
                    Construcción
                    <span className="ml-auto text-[11px] text-sidebar-foreground/30">
                      bloqueada
                    </span>
                    <ChevronRight className="size-3.5 shrink-0" aria-hidden="true" />
                  </button>
                  {i < groups.length - 1 ? <Separator className="mt-5 bg-sidebar-border" /> : null}
                </div>
              );
            return (
              <div key={i}>
                {group.label ? (
                  <div className="mb-1.5 px-2 text-[11px] font-semibold tracking-widest text-sidebar-foreground/50 uppercase">
                    {group.label}
                  </div>
                ) : null}
                <ul className="flex flex-col gap-0.5">
                  {group.items.map((item) => {
                    const active = pathname === item.href;
                    const step = ROUTE_STEP_NUMBER[item.href];
                    const state = step ? computeStepState(item.href, stages) : 'unknown';
                    const locked = Boolean(firstBlockingStep(item.href));
                    return (
                      <li key={item.href}>
                        <Link
                          href={item.href}
                          aria-current={active ? 'page' : undefined}
                          onClick={(e) => handleNavClick(e, item.href)}
                          title={
                            locked
                              ? 'Bloqueado — complete los pasos anteriores primero'
                              : state === 'next'
                                ? 'Siguiente paso recomendado'
                                : undefined
                          }
                          className={`flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-sm font-medium transition-colors ${
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
                                state === 'satisfied'
                                  ? 'bg-emerald-500 text-white'
                                  : active || state === 'next'
                                    ? 'bg-white/20 text-white'
                                    : 'bg-white/10 text-sidebar-foreground/60'
                              }`}
                            >
                              {state === 'satisfied' ? (
                                <Check className="size-3" aria-hidden="true" />
                              ) : locked ? (
                                <Lock className="size-2.5" aria-hidden="true" />
                              ) : (
                                step
                              )}
                            </span>
                          ) : item.href === '/readiness' ? (
                            <ClipboardCheck className="size-4 shrink-0" aria-hidden="true" />
                          ) : item.href.startsWith('/construction/') || item.href === '/build' ? (
                            <Hammer className="size-4 shrink-0" aria-hidden="true" />
                          ) : (
                            <Home className="size-4 shrink-0" aria-hidden="true" />
                          )}
                          {item.label}
                          {state === 'next' ? (
                            <span
                              className="ml-auto size-1.5 shrink-0 rounded-full bg-emerald-400"
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
      </nav>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex flex-wrap items-center justify-between gap-2 border-b bg-card px-4 py-3 shadow-sm">
          <ProjectSwitcher />
        </header>
        <main id="main-content" className="min-w-0 flex-1 bg-background p-4 md:p-6">
          {children}
        </main>
      </div>
    </div>
  );
}
