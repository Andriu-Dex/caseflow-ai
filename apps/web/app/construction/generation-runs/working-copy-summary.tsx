'use client';

import { useQuery } from '@tanstack/react-query';
import {
  workingCopyManifestSummarySchema,
  type WorkingCopyManifestSummary,
} from '@caseflow-ai/contracts';
import type { GenerationRunResponse, ImplementationPlanContent } from '@caseflow-ai/contracts';
import { api } from '../../../lib/api';

export function WorkingCopySummary({
  projectId,
  run,
  plan,
}: {
  projectId: string;
  run: GenerationRunResponse;
  plan?: ImplementationPlanContent;
}) {
  const files = useQuery({
    queryKey: ['generated-files', projectId, run.id],
    queryFn: () => api.generationRuns.files(projectId, run.id),
  });
  const manifest = files.data?.items.find((file) => file.path === 'docs/working-copy.json');
  const detail = useQuery({
    queryKey: ['generated-file', projectId, run.id, manifest?.id],
    queryFn: () => api.generationRuns.file(projectId, run.id, manifest!.id),
    enabled: Boolean(manifest),
  });
  let summary: WorkingCopyManifestSummary | undefined;
  if (detail.data) {
    try {
      const parsed = workingCopyManifestSummarySchema.safeParse(JSON.parse(detail.data.content));
      if (
        parsed.success &&
        parsed.data.implementationPlanVersionId === run.implementationPlanVersionId &&
        parsed.data.designBaselineId === run.designBaselineId
      )
        summary = parsed.data;
    } catch {
      /* A missing or invalid manifest must never produce invented counts. */
    }
  }
  if (!summary)
    return (
      <p className="mt-3 text-xs text-muted-foreground" role="status">
        {files.isLoading || detail.isLoading
          ? 'Cargando resumen de acciones…'
          : 'Resumen de acciones no disponible. Consulte el manifiesto en los archivos.'}
      </p>
    );

  const actions = plan?.routes?.flatMap((route) => route.actions) ?? [];
  const groups = new Map<string, { label: string; actions: { key: string; label: string }[] }>();
  for (const key of summary.pendingEndpoints) {
    const endpoint = plan?.customEndpoints?.find(
      (endpoint) => `${endpoint.method} ${endpoint.path}` === key,
    );
    const module = plan?.modules?.find((module) => module.localId === endpoint?.moduleLocalId);
    const groupKey = module?.localId ?? 'other';
    const group = groups.get(groupKey) ?? {
      label: module?.description || module?.name || 'Otras acciones',
      actions: [],
    };
    group.actions.push({
      key,
      label:
        actions.find((action) => action.endpoint === key)?.label ||
        endpoint?.summary ||
        'Acción pendiente sin descripción en el plan disponible',
    });
    groups.set(groupKey, group);
  }
  return (
    <section
      className="mt-3 rounded-lg border border-border/70 bg-muted/20 p-3"
      aria-label="Resumen de la versión de trabajo"
    >
      <p className="text-sm font-semibold">
        {summary.implementedEndpoints.length}{' '}
        {summary.implementedEndpoints.length === 1
          ? 'acción con implementación'
          : 'acciones con implementación'}{' '}
        · {summary.pendingEndpoints.length}{' '}
        {summary.pendingEndpoints.length === 1 ? 'pendiente' : 'pendientes'}
      </p>
      <p className="mt-1 text-xs text-muted-foreground">
        Acciones personalizadas del plan. Tener código no acredita que el software esté validado.
      </p>
      {groups.size ? (
        <details className="mt-2 text-xs">
          <summary className="cursor-pointer font-medium">
            Pendientes por funcionalidad ({summary.pendingEndpoints.length})
          </summary>
          <ul className="mt-2 space-y-2">
            {[...groups].map(([key, group]) => (
              <li key={key}>
                <p className="font-semibold">
                  {group.label} ({group.actions.length})
                </p>
                <ul className="ml-4 mt-1 list-disc space-y-1 text-muted-foreground">
                  {group.actions.map((action) => (
                    <li key={action.key}>{action.label}</li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </section>
  );
}
