'use client';

import { useQuery } from '@tanstack/react-query';
import { ListChecks } from 'lucide-react';
import type { AcceptanceReportResponse, RequirementAcceptanceStatus } from '@caseflow-ai/contracts';
import { api } from '../../../lib/api';

type Criterion = AcceptanceReportResponse['criteria'][number];

const REQUIREMENT: Record<RequirementAcceptanceStatus, { label: string; className: string }> = {
  PASSED: {
    label: 'Cumplido',
    className: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
  },
  FAILED: {
    label: 'Fallido',
    className: 'border-destructive/30 bg-destructive/10 text-destructive',
  },
  NOT_RUN: { label: 'Sin ejecutar', className: 'border-border bg-muted/40 text-muted-foreground' },
  NO_CRITERIA: {
    label: 'Sin criterio',
    className: 'border-amber-500/30 bg-amber-500/10 text-amber-800 dark:text-amber-300',
  },
};

const resultOf = (criterion: Criterion) =>
  !criterion.result ? 'NOT_RUN' : criterion.result.passed ? 'PASSED' : 'FAILED';

function Chip({ status }: { status: RequirementAcceptanceStatus }) {
  return (
    <span
      className={`shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-medium ${REQUIREMENT[status].className}`}
    >
      {status === 'PASSED' && 'Pasó'}
      {status === 'FAILED' && 'Falló'}
      {status === 'NOT_RUN' && 'Sin ejecutar'}
      {status === 'NO_CRITERIA' && 'Sin criterio'}
    </span>
  );
}

// ADR-025: the run's acceptance criteria and what they mean per requirement.
// `refreshKey` changes when a validation of the run changes.
export function AcceptanceReport({
  projectId,
  runId,
  refreshKey,
}: {
  projectId: string;
  runId: string;
  refreshKey: string;
}) {
  const report = useQuery({
    queryKey: ['acceptance', projectId, runId, refreshKey],
    queryFn: () => api.generationRuns.acceptance(projectId, runId),
  });
  const data = report.data;
  if (!data || (!data.criteria.length && !data.requirements.length)) return null;
  const counts = Object.fromEntries(
    (Object.keys(REQUIREMENT) as RequirementAcceptanceStatus[]).map((status) => [
      status,
      data.requirements.filter((requirement) => requirement.status === status).length,
    ]),
  ) as Record<RequirementAcceptanceStatus, number>;

  return (
    <section aria-label="Pruebas de aceptación" className="flex flex-col gap-2 text-xs">
      <h4 className="flex items-center gap-1.5 font-semibold">
        <ListChecks className="size-3.5 text-primary" aria-hidden="true" />
        Pruebas de aceptación
      </h4>
      {data.criteria.length ? (
        <p className="text-muted-foreground">
          Requisitos funcionales: {counts.PASSED} cumplidos · {counts.FAILED} fallidos ·{' '}
          {counts.NOT_RUN} sin ejecutar · {counts.NO_CRITERIA} sin criterio.
        </p>
      ) : (
        <p className="text-muted-foreground">
          Ninguna pantalla de esta construcción realiza todavía un caso de uso aprobado, así que no
          hay criterios de aceptación.
        </p>
      )}
      <p className="text-muted-foreground">
        Cada criterio comprueba que el actor llega a las pantallas de su caso de uso sin errores y
        encuentra sus acciones. No completa formularios ni ejecuta la operación de principio a fin.
      </p>
      {data.criteria.length ? (
        <details className="rounded-lg border p-2.5">
          <summary className="cursor-pointer font-medium">
            Criterios de aceptación ({data.criteria.length})
          </summary>
          <ul className="mt-2 flex flex-col gap-2.5">
            {data.criteria.map((criterion) => (
              <li
                key={criterion.key}
                className="flex flex-col gap-0.5 border-t pt-2 first:border-t-0 first:pt-0"
              >
                <p className="flex items-start justify-between gap-2 font-medium">
                  <span>
                    {criterion.key} · {criterion.useCaseName}
                  </span>
                  <Chip status={resultOf(criterion)} />
                </p>
                <p>
                  <strong>Dado</strong> {criterion.given}.
                </p>
                <p>
                  <strong>Cuando</strong> {criterion.when}.
                </p>
                <p>
                  <strong>Entonces</strong> {criterion.then}.
                </p>
                {criterion.alternativeFlows.length ? (
                  <p className="text-muted-foreground">
                    También cubre: {criterion.alternativeFlows.join('; ')}.
                  </p>
                ) : null}
                <p className="text-muted-foreground">
                  Pantallas: {criterion.screens.map((screen) => screen.screenName).join(', ')}
                  {criterion.role ? ` · Rol: ${criterion.role}` : ''}
                  {criterion.requirementCodes.length
                    ? ` · Requisitos: ${criterion.requirementCodes.join(', ')}`
                    : ''}
                </p>
                {criterion.result?.message ? (
                  <p className="text-destructive" role="alert">
                    {criterion.result.message}
                  </p>
                ) : null}
              </li>
            ))}
          </ul>
        </details>
      ) : null}
      {data.requirements.length ? (
        <details className="rounded-lg border p-2.5">
          <summary className="cursor-pointer font-medium">
            Resultado por requisito ({data.requirements.length})
          </summary>
          <ul className="mt-2 flex flex-col gap-1">
            {data.requirements.map((requirement) => (
              <li key={requirement.code} className="flex items-start justify-between gap-2">
                <span>
                  <span className="font-mono">{requirement.code}</span> {requirement.title}
                </span>
                <span
                  className={`shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-medium ${REQUIREMENT[requirement.status].className}`}
                >
                  {REQUIREMENT[requirement.status].label}
                </span>
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </section>
  );
}
