'use client';

import { useState } from 'react';
import { AlertTriangle, CheckCircle2, ChevronDown } from 'lucide-react';
import type { ContextItemKind } from '@caseflow-ai/contracts';

// How the approved Project Context is covered by requirements (DEC-126):
// context item codes as chips, and a summary of what is still missing.

const KIND_STYLES: Record<ContextItemKind, string> = {
  NEED: 'border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300',
  BUSINESS_RULE:
    'border-violet-300 bg-violet-50 text-violet-800 dark:border-violet-800 dark:bg-violet-950/50 dark:text-violet-300',
  CONSTRAINT:
    'border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-950/50 dark:text-amber-300',
};

export const KIND_NAMES: Record<ContextItemKind, { one: string; many: string }> = {
  NEED: { one: 'Necesidad', many: 'necesidades' },
  BUSINESS_RULE: { one: 'Regla de negocio', many: 'reglas de negocio' },
  CONSTRAINT: { one: 'Restricción', many: 'restricciones' },
};

// A context item's code; its full text shows on hover.
export function ContextCode({
  code,
  kind,
  description,
}: {
  code: string;
  kind: ContextItemKind;
  description?: string;
}) {
  return (
    <span
      title={description ? `${KIND_NAMES[kind].one}: ${description}` : undefined}
      className={`inline-flex shrink-0 items-center rounded border px-1.5 py-px font-mono text-[11px] leading-4 font-semibold ${KIND_STYLES[kind]}`}
    >
      {code}
    </span>
  );
}

export interface CoverageEntry {
  code: string;
  kind: ContextItemKind;
  description: string;
  mandatory: boolean;
  covered: boolean;
}

function count(items: CoverageEntry[], kind: ContextItemKind) {
  const ofKind = items.filter((i) => i.kind === kind);
  return { covered: ofKind.filter((i) => i.covered).length, total: ofKind.length };
}

// "Cubre 4 de 5 necesidades y 2 de 2 reglas de negocio", with what is
// missing one click away.
export function ContextCoverageSummary({
  items,
  subject,
}: {
  items: CoverageEntry[];
  subject: string;
}) {
  const [open, setOpen] = useState(false);
  if (!items.length) return null;
  const mandatory = items.filter((i) => i.mandatory);
  const missing = items.filter((i) => !i.covered);
  const missingMandatory = missing.filter((i) => i.mandatory);
  const complete = missingMandatory.length === 0;
  const needs = count(items, 'NEED');
  const rules = count(items, 'BUSINESS_RULE');
  const constraints = count(items, 'CONSTRAINT');
  const parts = [
    needs.total ? `${needs.covered} de ${needs.total} ${KIND_NAMES.NEED.many}` : null,
    rules.total ? `${rules.covered} de ${rules.total} ${KIND_NAMES.BUSINESS_RULE.many}` : null,
  ].filter(Boolean);
  const percent = mandatory.length
    ? Math.round(((mandatory.length - missingMandatory.length) / mandatory.length) * 100)
    : 100;

  return (
    <div
      className={`rounded-lg border p-3 ${
        complete
          ? 'border-emerald-200 bg-emerald-50/50 dark:border-emerald-900/60 dark:bg-emerald-950/20'
          : 'border-amber-200 bg-amber-50/50 dark:border-amber-900/60 dark:bg-amber-950/20'
      }`}
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
        {complete ? (
          <CheckCircle2 className="size-4 shrink-0 text-emerald-600" aria-hidden="true" />
        ) : (
          <AlertTriangle className="size-4 shrink-0 text-amber-600" aria-hidden="true" />
        )}
        <p className="min-w-0 flex-1 text-sm text-foreground">
          {parts.length ? (
            <>
              {subject} cubren {parts.join(' y ')}
              {complete ? '.' : '; falta cubrir el resto.'}
            </>
          ) : (
            `${subject} no tienen necesidades ni reglas que cubrir.`
          )}
          {constraints.total ? (
            <span className="text-muted-foreground">
              {' '}
              Restricciones atendidas: {constraints.covered} de {constraints.total}.
            </span>
          ) : null}
        </p>
        {missing.length ? (
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
          >
            {open ? 'Ocultar' : 'Ver qué falta'}
            <ChevronDown
              className={`size-3.5 transition-transform ${open ? 'rotate-180' : ''}`}
              aria-hidden="true"
            />
          </button>
        ) : null}
      </div>
      {mandatory.length ? (
        <div
          role="progressbar"
          aria-label="Cobertura de necesidades y reglas"
          aria-valuenow={percent}
          aria-valuemin={0}
          aria-valuemax={100}
          className="mt-2 h-1.5 overflow-hidden rounded-full bg-background/80"
        >
          <div
            className={`h-full rounded-full transition-all ${complete ? 'bg-emerald-500' : 'bg-amber-500'}`}
            style={{ width: `${percent}%` }}
          />
        </div>
      ) : null}
      {open && missing.length ? (
        <ul className="mt-3 flex flex-col gap-1.5" aria-label="Elementos del contexto sin cubrir">
          {missing.map((item) => (
            <li key={item.code} className="flex items-start gap-2 text-sm">
              <ContextCode code={item.code} kind={item.kind} />
              <span className="text-foreground/85">{item.description}</span>
              {item.mandatory ? null : (
                <span className="ml-auto shrink-0 text-xs text-muted-foreground">opcional</span>
              )}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
