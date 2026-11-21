'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, ArrowDown, ArrowUp, CheckCircle2, Layers, Play } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import type {
  DeliveryPlanResponse,
  DeliveryResponse,
  DeliveryStatus,
  GenerationRunResponse,
} from '@caseflow-ai/contracts';
import { Button } from '@caseflow-ai/ui';
import { api, ApiError } from '../../../lib/api';
import { GenerationEstimate } from './generation-estimate';

// ADR-024: the plan of deliveries of a plan version; null while it has none.
export function useDeliveryPlan(projectId: string, versionId: string | undefined) {
  return useQuery({
    queryKey: ['delivery-plan', projectId, versionId],
    queryFn: async (): Promise<DeliveryPlanResponse | null> => {
      try {
        return await api.deliveries.get(projectId, versionId!);
      } catch (error) {
        if (error instanceof ApiError && error.status === 404) return null;
        throw error;
      }
    },
    enabled: Boolean(versionId),
    retry: false,
  });
}

const STATUS: Record<DeliveryStatus, { label: string; className: string }> = {
  PENDING: { label: 'Pendiente', className: 'border-border bg-muted/40 text-muted-foreground' },
  GENERATED: {
    label: 'Construida',
    className: 'border-blue-500/30 bg-blue-500/10 text-blue-700 dark:text-blue-300',
  },
  APPROVED: {
    label: 'Aprobada',
    className: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
  },
  AFFECTED: {
    label: 'Cambió: revisar',
    className: 'border-amber-500/30 bg-amber-500/10 text-amber-800 dark:text-amber-300',
  },
};

const newest = (runs: GenerationRunResponse[]) =>
  [...runs].sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];

// The construction in deliveries: what each one adds, its status, and the
// next step (estimate, build, approve) on the first one not approved.
export function DeliveryPlanPanel({
  projectId,
  planVersionId,
  runs,
  hasActiveRun,
}: {
  projectId: string;
  planVersionId: string;
  runs: GenerationRunResponse[];
  hasActiveRun: boolean;
}) {
  const queryClient = useQueryClient();
  const plan = useDeliveryPlan(projectId, planVersionId);
  const [busy, setBusy] = useState<string | null>(null);
  const deliveries = plan.data?.deliveries ?? [];
  const current = deliveries.find((delivery) => delivery.status !== 'APPROVED');
  const estimate = useQuery({
    queryKey: ['generation-estimate', projectId, planVersionId, current?.id, runs.length],
    queryFn: () => api.generationRuns.estimate(projectId, planVersionId, current!.id),
    enabled: Boolean(current) && current?.status !== 'AFFECTED',
    retry: false,
  });

  async function act(id: string, action: () => Promise<unknown>, done: string) {
    setBusy(id);
    try {
      await action();
      toast.success(done);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['delivery-plan', projectId, planVersionId] }),
        queryClient.invalidateQueries({ queryKey: ['generation-runs', projectId] }),
      ]);
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : 'No se pudo completar la acción.');
    } finally {
      setBusy(null);
    }
  }

  if (plan.isLoading) return <p className="text-xs text-muted-foreground">Cargando entregas…</p>;
  if (plan.error)
    return (
      <p className="text-xs text-destructive" role="alert">
        No se pudo cargar el plan de entregas.
      </p>
    );
  if (!plan.data)
    return (
      <div className="flex flex-col items-start gap-2 rounded-lg border border-dashed p-4 text-xs">
        <p className="text-sm font-medium">Construir por entregas</p>
        <p className="text-muted-foreground">
          Primero la base (acceso, usuarios y roles) y después un módulo por entrega. Cada entrega
          se construye, se valida y se aprueba antes de seguir con la siguiente, y reutiliza lo ya
          aprobado sin volver a pedirlo a la IA.
        </p>
        <Button
          type="button"
          size="sm"
          className="gap-1.5"
          disabled={busy !== null}
          onClick={() =>
            act(
              'create',
              () => api.deliveries.create(projectId, planVersionId),
              'Plan de entregas propuesto.',
            )
          }
        >
          <Layers className="size-3.5" aria-hidden="true" />
          Proponer plan de entregas
        </Button>
      </div>
    );

  const labels = new Map(
    deliveries.flatMap((delivery) =>
      delivery.modules.map((module) => [module.localId, module.name]),
    ),
  );
  const order = deliveries.map((delivery) => delivery.modules.map((module) => module.localId));
  const move = (index: number, by: -1 | 1) => {
    const next = [...order];
    [next[index], next[index + by]] = [next[index + by]!, next[index]!];
    return act(
      `move-${index}`,
      () =>
        api.deliveries.save(
          projectId,
          planVersionId,
          next.map((modules) => ({ modules })),
        ),
      'Orden de entregas actualizado.',
    );
  };
  // The run an approval freezes: the delivery's newest built run, or, for an
  // affected one, the newest run that includes it.
  const runToApprove = (delivery: DeliveryResponse) =>
    newest(
      runs.filter((run) => {
        if (run.status !== 'GENERATED' || !run.deliveryId) return false;
        const of = deliveries.find((item) => item.id === run.deliveryId);
        return delivery.status === 'AFFECTED'
          ? Boolean(of && of.position >= delivery.position)
          : run.deliveryId === delivery.id;
      }),
    );

  return (
    <div className="flex flex-col gap-3">
      <ol className="flex flex-col gap-2" aria-label="Entregas">
        {deliveries.map((delivery, index) => {
          const isCurrent = delivery.id === current?.id;
          const approvable = isCurrent ? runToApprove(delivery) : undefined;
          const canMove = (to: number) => Boolean(deliveries[to] && !deliveries[to]!.locked);
          return (
            <li
              key={delivery.id}
              className={`rounded-lg border p-3 text-xs ${isCurrent ? 'border-primary/40 bg-primary/5' : ''}`}
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-semibold">
                  Entrega {delivery.position}: {delivery.name}
                </p>
                <div className="flex items-center gap-1.5">
                  <span
                    className={`rounded-full border px-2 py-0.5 font-medium ${STATUS[delivery.status].className}`}
                  >
                    {STATUS[delivery.status].label}
                  </span>
                  {!delivery.locked ? (
                    <>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="size-7"
                        aria-label={`Adelantar la entrega ${delivery.position}`}
                        disabled={busy !== null || !canMove(index - 1)}
                        onClick={() => move(index, -1)}
                      >
                        <ArrowUp className="size-3.5" aria-hidden="true" />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="size-7"
                        aria-label={`Atrasar la entrega ${delivery.position}`}
                        disabled={busy !== null || !canMove(index + 1)}
                        onClick={() => move(index, 1)}
                      >
                        <ArrowDown className="size-3.5" aria-hidden="true" />
                      </Button>
                    </>
                  ) : null}
                </div>
              </div>
              <ul className="mt-1.5 flex flex-col gap-0.5 text-muted-foreground">
                {delivery.modules.map((module) => (
                  <li key={module.localId} title={module.description}>
                    {module.name}
                  </li>
                ))}
              </ul>
              {delivery.approval && delivery.status === 'APPROVED' ? (
                <p className="mt-1.5 flex items-center gap-1 text-emerald-700 dark:text-emerald-300">
                  <CheckCircle2 className="size-3.5" aria-hidden="true" />
                  Aprobada el {new Date(delivery.approval.approvedAt).toLocaleString('es-EC')}
                </p>
              ) : null}
              {delivery.status === 'AFFECTED' ? (
                <p className="mt-1.5 flex items-start gap-1 text-amber-800 dark:text-amber-300">
                  <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
                  Una construcción posterior cambió esta entrega. Valide la construcción más
                  reciente y apruébela de nuevo antes de seguir.
                </p>
              ) : null}
              {isCurrent ? (
                <div className="mt-2.5 flex flex-col gap-2 border-t pt-2.5">
                  {estimate.data ? <GenerationEstimate estimate={estimate.data} /> : null}
                  <div className="flex flex-wrap gap-2">
                    {delivery.status !== 'AFFECTED' ? (
                      <Button
                        type="button"
                        size="sm"
                        className="gap-1.5"
                        disabled={busy !== null || hasActiveRun}
                        onClick={() =>
                          act(
                            `build-${delivery.id}`,
                            () => api.generationRuns.start(projectId, planVersionId, delivery.id),
                            `Construcción de la entrega ${delivery.position} encolada.`,
                          )
                        }
                      >
                        <Play className="size-3.5" aria-hidden="true" />
                        Construir la entrega {delivery.position}
                      </Button>
                    ) : null}
                    {approvable ? (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="gap-1.5"
                        disabled={busy !== null || hasActiveRun}
                        onClick={() =>
                          act(
                            `approve-${delivery.id}`,
                            () =>
                              api.deliveries.approve(
                                projectId,
                                planVersionId,
                                delivery.id,
                                approvable.id,
                              ),
                            `Entrega ${delivery.position} aprobada.`,
                          )
                        }
                      >
                        <CheckCircle2 className="size-3.5" aria-hidden="true" />
                        {delivery.status === 'AFFECTED'
                          ? 'Aprobar de nuevo'
                          : `Aprobar la entrega ${delivery.position}`}
                      </Button>
                    ) : null}
                  </div>
                  <p className="text-muted-foreground">
                    Valide la construcción en la lista de abajo; solo se aprueba una construcción
                    validada, que también se puede desplegar para mostrarla.
                  </p>
                </div>
              ) : null}
            </li>
          );
        })}
      </ol>
      {current ? null : (
        <p className="flex items-center gap-1.5 text-xs font-medium text-emerald-700 dark:text-emerald-300">
          <CheckCircle2 className="size-3.5" aria-hidden="true" />
          Todas las entregas están aprobadas: el sistema está completo.
        </p>
      )}
      {plan.data.dependencies.length ? (
        <details className="text-xs text-muted-foreground">
          <summary className="cursor-pointer">¿Por qué este orden?</summary>
          <ul className="mt-1.5 flex list-disc flex-col gap-1 pl-4">
            {plan.data.dependencies.map((dependency) => (
              <li key={`${dependency.module}-${dependency.needs}`}>
                «{labels.get(dependency.module) ?? dependency.module}» necesita «
                {labels.get(dependency.needs) ?? dependency.needs}»: {dependency.reason}.
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </div>
  );
}
