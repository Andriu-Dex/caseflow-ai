'use client';

import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import type { GenerationRunResponse, ScreenFindingsResponse } from '@caseflow-ai/contracts';
import { api } from '../../../lib/api';

type Finding = ScreenFindingsResponse['items'][number];

// Screens the evaluator did not accept for this design, each acceptable with
// a written justification that covers exactly those findings (AGENTS.md §16).
export function ScreenFindings({
  projectId,
  run,
}: {
  projectId: string;
  run: GenerationRunResponse;
}) {
  const findings = useQuery({
    queryKey: ['screen-findings', projectId, run.designBaselineId],
    queryFn: () => api.designBaselines.screenFindings(projectId, run.designBaselineId),
  });
  if (findings.isLoading)
    return <p className="mt-2.5 text-xs text-muted-foreground">Cargando hallazgos de pantallas…</p>;
  if (findings.isError)
    return (
      <p role="alert" className="mt-2.5 text-xs text-destructive">
        No se pudieron cargar los hallazgos de pantallas.
      </p>
    );
  const items = findings.data?.items ?? [];
  if (!items.length) return null;
  const pending = items.filter((item) => !item.exception);
  return (
    <details className="mt-2.5 rounded-lg border p-2.5 text-xs" open={pending.length > 0}>
      <summary className="cursor-pointer font-semibold select-none">
        Hallazgos de pantallas: {pending.length} pendientes de {items.length}
      </summary>
      <p className="mt-2 text-muted-foreground">
        Puede aceptar las diferencias de una pantalla con una justificación. La aceptación cubre
        solo estos hallazgos: si la evaluación cambia, deberá justificarse de nuevo.
      </p>
      <ul className="mt-2 flex flex-col gap-2">
        {items.map((item) => (
          <ScreenFinding
            key={item.routePath}
            projectId={projectId}
            baselineId={run.designBaselineId}
            item={item}
          />
        ))}
      </ul>
    </details>
  );
}

function ScreenFinding({
  projectId,
  baselineId,
  item,
}: {
  projectId: string;
  baselineId: string;
  item: Finding;
}) {
  const queryClient = useQueryClient();
  const [justification, setJustification] = useState('');
  const [busy, setBusy] = useState(false);
  const fieldId = `justification-${item.findingsSha256}`;
  async function accept() {
    setBusy(true);
    try {
      await api.designBaselines.acceptScreenFindings(projectId, baselineId, {
        routePath: item.routePath,
        findingsSha256: item.findingsSha256,
        justification: justification.trim(),
      });
      toast.success(`Hallazgos de ${item.routePath} aceptados con justificación.`);
      await queryClient.invalidateQueries({ queryKey: ['screen-findings', projectId, baselineId] });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'No se pudo registrar la aceptación.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <li className="rounded border p-2">
      <p className="font-mono font-semibold">{item.routePath}</p>
      <p className="mt-1 whitespace-pre-wrap text-muted-foreground">{item.findings}</p>
      {item.exception ? (
        <p className="mt-1 text-emerald-700 dark:text-emerald-400">
          Aceptado: {item.exception.justification}
        </p>
      ) : (
        <div className="mt-2 flex flex-col gap-1.5">
          <label htmlFor={fieldId} className="font-medium">
            Justificación
          </label>
          <textarea
            id={fieldId}
            className="min-h-16 rounded border bg-background p-1.5"
            maxLength={2000}
            value={justification}
            onChange={(event) => setJustification(event.target.value)}
          />
          <button
            type="button"
            className="self-start rounded bg-primary px-3 py-1.5 font-semibold text-primary-foreground disabled:opacity-50"
            disabled={busy || justification.trim().length < 10}
            onClick={accept}
          >
            {busy ? 'Registrando…' : 'Aceptar con justificación'}
          </button>
        </div>
      )}
    </li>
  );
}
