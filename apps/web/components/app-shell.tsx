'use client';

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ClipboardCheck, Check, Home, Sparkles } from 'lucide-react';
import type { ReactNode } from 'react';
import { Separator } from '@caseflow-ai/ui';
import { api } from '../lib/api';
import { useActiveProject } from '../lib/active-project';
import { ROUTE_STAGE_KEYS, ROUTE_STEP_NUMBER } from '../lib/stage-links';
import { ProjectSwitcher } from './project-switcher';

type NavItem = { href: string; label: string };

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
      { href: '/design/ui-blueprint', label: 'UI Blueprint' },
      { href: '/design/mockups', label: 'Mockups' },
    ],
  },
  {
    label: '',
    items: [
      { href: '/traceability', label: 'Trazabilidad' },
      { href: '/readiness', label: 'Preparación / Exportar' },
    ],
  },
];

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { projectId } = useActiveProject();
  const readiness = useQuery({
    queryKey: ['readiness', projectId],
    queryFn: () => api.readiness.get(projectId!),
    enabled: Boolean(projectId),
  });

  // A route is satisfied only when every readiness stage it maps to is
  // satisfied (some routes, like /use-cases, cover two stages).
  function stepState(href: string): 'satisfied' | 'next' | 'pending' | 'unknown' {
    const stages = readiness.data?.stages;
    if (!stages) return 'unknown';
    const keys = ROUTE_STAGE_KEYS[href];
    if (!keys) return 'unknown';
    const relevant = stages.filter((s) => keys.includes(s.key));
    if (relevant.length && relevant.every((s) => s.satisfied)) return 'satisfied';
    const nextStage = stages.find((s) => !s.satisfied);
    if (nextStage && keys.includes(nextStage.key)) return 'next';
    return 'pending';
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
        className="w-full shrink-0 bg-sidebar p-4 text-sidebar-foreground shadow-lg md:w-64"
      >
        <div className="mb-6 flex items-center gap-2 px-1">
          <span className="flex size-8 items-center justify-center rounded-lg bg-sidebar-active shadow-sm shadow-sidebar-active/50">
            <Sparkles className="size-4.5 text-white" aria-hidden="true" />
          </span>
          <span className="text-lg font-semibold tracking-tight text-white">CASEFlow AI</span>
        </div>
        <div className="flex flex-col gap-5">
          {NAV_GROUPS.map((group, i) => (
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
                  const state = step ? stepState(item.href) : 'unknown';
                  return (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        aria-current={active ? 'page' : undefined}
                        title={
                          state === 'next'
                            ? 'Siguiente paso recomendado'
                            : state === 'pending'
                              ? 'Etapa posterior en el flujo — puede requerir pasos previos'
                              : undefined
                        }
                        className={`flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-sm font-medium transition-colors ${
                          active
                            ? 'bg-sidebar-active text-white shadow-sm'
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
                            ) : (
                              step
                            )}
                          </span>
                        ) : item.href === '/readiness' ? (
                          <ClipboardCheck className="size-4 shrink-0" aria-hidden="true" />
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
              {i < NAV_GROUPS.length - 1 ? <Separator className="mt-5 bg-sidebar-border" /> : null}
            </div>
          ))}
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
