'use client';

import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@caseflow-ai/ui';

export function getPageNumbers(currentPage: number, totalPages: number): (number | 'ellipsis')[] {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, i) => i + 1);
  }
  const current = currentPage + 1;
  if (current <= 4) {
    return [1, 2, 3, 4, 5, 'ellipsis', totalPages];
  }
  if (current >= totalPages - 3) {
    return [
      1,
      'ellipsis',
      totalPages - 4,
      totalPages - 3,
      totalPages - 2,
      totalPages - 1,
      totalPages,
    ];
  }
  return [1, 'ellipsis', current - 1, current, current + 1, 'ellipsis', totalPages];
}

export interface PaginationNavProps {
  page: number;
  pageCount: number;
  total: number;
  pageSize: number;
  setPage: (updater: number | ((prev: number) => number)) => void;
  itemLabel: string;
  ariaLabel: string;
  hideWhenSinglePage?: boolean;
  pageSizeOptions?: number[];
  onPageSizeChange?: (size: number) => void;
}

export function PaginationNav({
  page,
  pageCount,
  total,
  pageSize,
  setPage,
  itemLabel,
  ariaLabel,
  hideWhenSinglePage = false,
  pageSizeOptions,
  onPageSizeChange,
}: PaginationNavProps) {
  if (hideWhenSinglePage && pageCount <= 1) {
    return null;
  }

  const start = total === 0 ? 0 : page * pageSize + 1;
  const end = Math.min((page + 1) * pageSize, total);
  const pages = getPageNumbers(page, pageCount);

  return (
    <nav
      aria-label={ariaLabel}
      className="mt-6 flex flex-col items-center justify-between gap-3.5 rounded-xl border border-border/50 bg-card/60 p-3 sm:px-4 sm:py-3 text-xs sm:text-sm text-muted-foreground shadow-2xs backdrop-blur-xs md:grid md:grid-cols-3 md:items-center"
    >
      {/* Column 1: Item counts and optional page size selector */}
      <div className="flex flex-wrap items-center justify-center md:justify-start gap-2 text-xs sm:text-sm">
        <span className="font-medium text-foreground/80">
          Mostrando {start}–{end} de {total} {itemLabel}
        </span>
        {pageSizeOptions && onPageSizeChange && total > (pageSizeOptions[0] ?? 10) ? (
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <span aria-hidden="true" className="opacity-40">
              ·
            </span>
            <select
              aria-label="Elementos por página"
              className="h-7 rounded-md border border-border/60 bg-background/80 px-2 text-xs font-medium text-foreground shadow-2xs hover:bg-muted/40 focus:outline-hidden focus:ring-1 focus:ring-primary cursor-pointer"
              value={pageSize}
              onChange={(e) => {
                const newSize = Number(e.target.value);
                onPageSizeChange(newSize);
                setPage(0);
              }}
            >
              {pageSizeOptions.map((opt) => (
                <option key={opt} value={opt}>
                  {opt} por pág.
                </option>
              ))}
            </select>
          </div>
        ) : null}
      </div>

      {/* Column 2: Centered pagination controls */}
      {pageCount > 1 ? (
        <div className="flex items-center justify-center gap-1">
          <Button
            type="button"
            variant="outline"
            size="icon-sm"
            className="rounded-lg border-border/60 hover:bg-muted text-foreground/80 hover:text-foreground disabled:opacity-30 transition-all duration-150 shadow-2xs"
            disabled={page === 0}
            onClick={() => setPage((p) => p - 1)}
            aria-label="Anterior"
          >
            <ChevronLeft className="size-4" aria-hidden="true" />
            <span className="sr-only">Anterior</span>
          </Button>

          {pages.map((p, idx) =>
            p === 'ellipsis' ? (
              <span
                key={`ellipsis-${idx}`}
                className="flex size-8 items-center justify-center text-xs text-muted-foreground/50 select-none font-medium"
                aria-hidden="true"
              >
                …
              </span>
            ) : (
              <Button
                key={p}
                type="button"
                variant={p - 1 === page ? 'default' : 'outline'}
                size="icon-sm"
                className={
                  p - 1 === page
                    ? 'rounded-lg bg-primary text-primary-foreground font-semibold text-xs shadow-2xs hover:bg-primary/90 focus-visible:ring-2 focus-visible:ring-ring transition-all'
                    : 'rounded-lg border-border/60 hover:bg-muted text-foreground/80 hover:text-foreground font-medium text-xs transition-colors duration-150 shadow-2xs'
                }
                onClick={() => setPage(p - 1)}
                aria-label={`Página ${p}`}
                aria-current={p - 1 === page ? 'page' : undefined}
              >
                {p}
              </Button>
            ),
          )}

          <Button
            type="button"
            variant="outline"
            size="icon-sm"
            className="rounded-lg border-border/60 hover:bg-muted text-foreground/80 hover:text-foreground disabled:opacity-30 transition-all duration-150 shadow-2xs"
            disabled={page + 1 >= pageCount}
            onClick={() => setPage((p) => p + 1)}
            aria-label="Siguiente"
          >
            <ChevronRight className="size-4" aria-hidden="true" />
            <span className="sr-only">Siguiente</span>
          </Button>
        </div>
      ) : (
        <div className="hidden md:block" />
      )}

      {/* Column 3: Page indicator badge with spacing to avoid floating theme toggle */}
      {pageCount > 1 ? (
        <div className="flex items-center justify-center md:justify-end pr-0 md:pr-16 lg:pr-20">
          <span
            aria-live="polite"
            className="inline-flex items-center rounded-md border border-border/40 bg-muted/70 px-2.5 py-1 text-xs font-semibold text-foreground/80"
          >
            Página {page + 1} de {pageCount}
          </span>
        </div>
      ) : (
        <div className="hidden md:block" />
      )}
    </nav>
  );
}
