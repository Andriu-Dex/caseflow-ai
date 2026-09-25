'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Boxes,
  ClipboardCheck,
  Compass,
  Database,
  FileText,
  GitBranch,
  Home,
  Image as ImageIcon,
  Layers,
  ListChecks,
  Network,
  PanelsTopLeft,
  Sparkles,
} from 'lucide-react';
import type { ComponentType, ReactNode } from 'react';
import { Separator } from '@caseflow-ai/ui';
import { ProjectSwitcher } from './project-switcher';

type NavItem = { href: string; label: string; icon: ComponentType<{ className?: string }> };

const NAV_GROUPS: { label: string; items: NavItem[] }[] = [
  { label: '', items: [{ href: '/', label: 'Inicio', icon: Home }] },
  {
    label: 'Conocimiento',
    items: [
      { href: '/sources', label: 'Fuentes', icon: FileText },
      { href: '/context', label: 'Contexto del proyecto', icon: Compass },
    ],
  },
  {
    label: 'Análisis',
    items: [
      { href: '/requirements', label: 'Requisitos', icon: ListChecks },
      { href: '/use-cases', label: 'Casos de uso', icon: Sparkles },
      { href: '/data-model', label: 'Modelo de datos', icon: Database },
    ],
  },
  {
    label: 'Diseño',
    items: [
      { href: '/design/navigation', label: 'Navegación', icon: Network },
      { href: '/design/software-architecture', label: 'Arquitectura de software', icon: Layers },
      { href: '/design/system-architecture', label: 'Arquitectura de sistema', icon: Boxes },
      { href: '/design/ui-blueprint', label: 'UI Blueprint', icon: PanelsTopLeft },
      { href: '/design/mockups', label: 'Mockups', icon: ImageIcon },
    ],
  },
  {
    label: '',
    items: [
      { href: '/traceability', label: 'Trazabilidad', icon: GitBranch },
      { href: '/readiness', label: 'Preparación / Exportar', icon: ClipboardCheck },
    ],
  },
];

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
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
        className="w-full shrink-0 border-b bg-card p-4 md:w-64 md:border-b-0 md:border-r"
      >
        <div className="mb-4 flex items-center gap-2 px-1 text-lg font-semibold text-foreground">
          <Sparkles className="size-5 text-primary" aria-hidden="true" />
          CASEFlow AI
        </div>
        <div className="flex flex-col gap-4">
          {NAV_GROUPS.map((group, i) => (
            <div key={i}>
              {group.label ? (
                <div className="mb-1 px-1 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                  {group.label}
                </div>
              ) : null}
              <ul className="flex flex-col gap-0.5">
                {group.items.map((item) => {
                  const active = pathname === item.href;
                  const Icon = item.icon;
                  return (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        aria-current={active ? 'page' : undefined}
                        className={`flex items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors ${
                          active
                            ? 'bg-primary text-primary-foreground'
                            : 'text-foreground/80 hover:bg-accent hover:text-accent-foreground'
                        }`}
                      >
                        <Icon className="size-4 shrink-0" aria-hidden="true" />
                        {item.label}
                      </Link>
                    </li>
                  );
                })}
              </ul>
              {i < NAV_GROUPS.length - 1 ? <Separator className="mt-4" /> : null}
            </div>
          ))}
        </div>
      </nav>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex flex-wrap items-center justify-between gap-2 border-b bg-card px-4 py-3">
          <ProjectSwitcher />
        </header>
        <main id="main-content" className="min-w-0 flex-1 bg-muted/40 p-4 md:p-6">
          {children}
        </main>
      </div>
    </div>
  );
}
