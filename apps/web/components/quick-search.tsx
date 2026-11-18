'use client';

import { useQuery } from '@tanstack/react-query';
import { usePathname, useRouter } from 'next/navigation';
import { FileText, Search } from 'lucide-react';
import { useEffect, useId, useState, type KeyboardEvent } from 'react';
import type { ArtifactSearchResult } from '@caseflow-ai/contracts';
import { Dialog, DialogContent, DialogDescription, DialogTitle, Input } from '@caseflow-ai/ui';
import { api } from '../lib/api';
import { OPEN_ARTIFACT_EVENT } from '../lib/linked-artifact';
import { StatusBadge } from './status-badge';

// Where each artifact type is worked on, and how it is called there.
const ARTIFACT_PAGES: Record<string, { href: string; label: string }> = {
  PROJECT_SOURCE: { href: '/sources', label: 'Fuente' },
  PROJECT_CONTEXT: { href: '/context', label: 'Contexto' },
  REQUIREMENT: { href: '/requirements', label: 'Requisito' },
  USE_CASE: { href: '/use-cases', label: 'Caso de uso' },
  USE_CASE_DIAGRAM: { href: '/use-cases', label: 'Diagrama de casos de uso' },
  DATA_MODEL: { href: '/data-model', label: 'Modelo de datos' },
  CLASS_DIAGRAM: { href: '/class-diagram', label: 'Diagrama de clases' },
  NAVIGATION_TREE: { href: '/design/navigation', label: 'Navegación' },
  SOFTWARE_ARCHITECTURE: {
    href: '/design/software-architecture',
    label: 'Arquitectura de software',
  },
  SYSTEM_ARCHITECTURE: { href: '/design/system-architecture', label: 'Arquitectura de sistema' },
  UI_BLUEPRINT: { href: '/design/ui-blueprint', label: 'Plano de interfaz' },
  DESIGN_THEME: { href: '/design/theme', label: 'Tema y colores' },
  MOCKUP: { href: '/design/mockups', label: 'Boceto' },
  GENERATION_PLAN: { href: '/construction/generation-plan', label: 'Plan de generación' },
  CONCEPTUAL_DOMAIN_MODEL: { href: '/construction/conceptual-model', label: 'Modelo conceptual' },
  IMPLEMENTATION_PLAN: {
    href: '/construction/implementation-plan',
    label: 'Plan de implementación',
  },
  USER_MANUAL: { href: '/construction/user-manual', label: 'Manual de usuario' },
};

// The other way to open it, from a button instead of Ctrl/Cmd+K.
export const OPEN_QUICK_SEARCH_EVENT = 'caseflow:quick-search';

const fold = (value: string) =>
  value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase();

type Result =
  | { kind: 'page'; href: string; label: string }
  | { kind: 'artifact'; href: string; artifact: ArtifactSearchResult };

// Ctrl/Cmd+K: jump to a page or to an artifact of the active project by its
// code (RF-001, CU-003…) or title.
export function QuickSearch({
  projectId,
  pages,
}: {
  projectId: string | null;
  pages: { href: string; label: string }[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const listId = useId();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [debounced, setDebounced] = useState('');
  const [active, setActive] = useState(0);

  useEffect(() => {
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setOpen((value) => !value);
      }
    };
    const openSearch = () => setOpen(true);
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener(OPEN_QUICK_SEARCH_EVENT, openSearch);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener(OPEN_QUICK_SEARCH_EVENT, openSearch);
    };
  }, []);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(text.trim()), 200);
    return () => clearTimeout(timer);
  }, [text]);

  const artifacts = useQuery({
    queryKey: ['artifact-search', projectId, debounced],
    queryFn: () => api.artifacts.search(projectId!, debounced),
    enabled: open && Boolean(projectId) && debounced.length > 0,
  });
  const query = fold(text.trim());
  const results: Result[] = [
    ...(query
      ? pages
          .filter((page) => fold(page.label).includes(query))
          .slice(0, 5)
          .map((page): Result => ({ kind: 'page', ...page }))
      : []),
    ...(debounced ? (artifacts.data?.items ?? []) : []).flatMap((artifact): Result[] => {
      const page = ARTIFACT_PAGES[artifact.type];
      return page ? [{ kind: 'artifact', href: page.href, artifact }] : [];
    }),
  ];
  const current = Math.min(active, Math.max(results.length - 1, 0));

  function close(value: boolean) {
    setOpen(value);
    if (!value) {
      setText('');
      setDebounced('');
      setActive(0);
    }
  }

  function go(result: Result) {
    close(false);
    if (result.kind === 'page') {
      router.push(result.href);
      return;
    }
    const { code } = result.artifact;
    router.push(`${result.href}?q=${encodeURIComponent(code)}`);
    // Already on that page: the list is mounted and hears the code instead.
    if (pathname === result.href)
      window.dispatchEvent(new CustomEvent(OPEN_ARTIFACT_EVENT, { detail: code }));
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      if (!results.length) return;
      const step = event.key === 'ArrowDown' ? 1 : -1;
      setActive((current + step + results.length) % results.length);
    } else if (event.key === 'Enter' && results[current]) {
      event.preventDefault();
      go(results[current]);
    }
  }

  const searching = artifacts.isFetching || text.trim() !== debounced;
  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent
        className="top-[20%] translate-y-0 gap-3 p-4 sm:max-w-xl"
        showCloseButton={false}
      >
        <DialogTitle className="sr-only">Búsqueda rápida</DialogTitle>
        <DialogDescription className="sr-only">
          Escriba un código como RF-001 o parte de un título y pulse Intro para abrir el resultado.
        </DialogDescription>
        <div className="relative">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <Input
            autoFocus
            role="combobox"
            aria-expanded={results.length > 0}
            aria-controls={listId}
            aria-activedescendant={results.length ? `${listId}-${current}` : undefined}
            aria-label="Buscar páginas y artefactos"
            placeholder="Buscar por código (RF-001, CU-003…) o título"
            value={text}
            onChange={(event) => {
              setText(event.target.value);
              setActive(0);
            }}
            onKeyDown={onKeyDown}
            className="pl-9"
          />
        </div>
        <ul id={listId} role="listbox" aria-label="Resultados" className="max-h-80 overflow-y-auto">
          {results.map((result, index) => (
            <li
              key={result.kind === 'page' ? `page-${result.href}` : result.artifact.id}
              id={`${listId}-${index}`}
              role="option"
              aria-selected={index === current}
              onMouseEnter={() => setActive(index)}
              onClick={() => go(result)}
              className={`flex cursor-pointer items-center gap-3 rounded-md px-3 py-2 text-sm ${
                index === current ? 'bg-muted' : ''
              }`}
            >
              {result.kind === 'page' ? (
                <>
                  <FileText className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                  <span className="flex-1 truncate">{result.label}</span>
                  <span className="text-xs text-muted-foreground">Página</span>
                </>
              ) : (
                <>
                  <span className="shrink-0 font-mono text-xs font-semibold text-primary">
                    {result.artifact.code}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate">{result.artifact.title}</span>
                    <span className="block text-xs text-muted-foreground">
                      {ARTIFACT_PAGES[result.artifact.type]?.label}
                    </span>
                  </span>
                  <StatusBadge status={result.artifact.status} />
                </>
              )}
            </li>
          ))}
        </ul>
        {text.trim() && !results.length ? (
          <p className="px-3 pb-1 text-sm text-muted-foreground" role="status">
            {!projectId
              ? 'Seleccione un proyecto para buscar sus artefactos.'
              : searching
                ? 'Buscando…'
                : 'Sin resultados.'}
          </p>
        ) : null}
        <p className="border-t pt-2 text-xs text-muted-foreground">
          Flechas para moverse, Intro para abrir, Esc para cerrar.
        </p>
      </DialogContent>
    </Dialog>
  );
}
