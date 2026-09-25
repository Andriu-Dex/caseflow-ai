'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';
import { ProjectSwitcher } from './project-switcher';

const NAV_GROUPS: { label: string; items: { href: string; label: string }[] }[] = [
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
  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:left-2 focus:top-2 focus:z-50 focus:rounded focus:bg-white focus:px-3 focus:py-2 focus:shadow"
      >
        Saltar al contenido
      </a>
      <nav
        aria-label="Navegación principal"
        className="w-full shrink-0 border-b border-gray-200 bg-white p-4 md:w-64 md:border-b-0 md:border-r"
      >
        <div className="mb-4 text-lg font-semibold text-gray-900">CASEFlow AI</div>
        <div className="flex flex-col gap-4">
          {NAV_GROUPS.map((group, i) => (
            <div key={i}>
              {group.label ? (
                <div className="mb-1 px-1 text-xs font-semibold uppercase tracking-wide text-gray-400">
                  {group.label}
                </div>
              ) : null}
              <ul className="flex flex-col gap-0.5">
                {group.items.map((item) => {
                  const active = pathname === item.href;
                  return (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        aria-current={active ? 'page' : undefined}
                        className={`block rounded-md px-2 py-1.5 text-sm ${
                          active ? 'bg-gray-900 text-white' : 'text-gray-700 hover:bg-gray-100'
                        }`}
                      >
                        {item.label}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
      </nav>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-200 bg-white px-4 py-3">
          <ProjectSwitcher />
        </header>
        <main id="main-content" className="min-w-0 flex-1 bg-gray-50 p-4 md:p-6">
          {children}
        </main>
      </div>
    </div>
  );
}
