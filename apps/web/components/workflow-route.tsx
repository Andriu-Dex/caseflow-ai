'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ArrowUpCircle } from 'lucide-react';
import { toast } from 'sonner';
import { WORKFLOW_ROUTES, type ApprovalOrigin, type WorkflowRoute } from '@caseflow-ai/contracts';
import {
  Badge,
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@caseflow-ai/ui';
import { api, ApiError } from '../lib/api';
import { useActiveProject } from '../lib/active-project';

// Workflow routes (DEC-116): every project shows its route, so a prototype is
// never mistaken for a reviewed deliverable.

export const WORKFLOW_ROUTE_LABELS: Record<WorkflowRoute, string> = {
  FULL: 'Completa',
  EXPRESS: 'Exprés',
  BUILD_ONLY: 'Solo construcción',
};

export const WORKFLOW_ROUTE_DESCRIPTIONS: Record<WorkflowRoute, string> = {
  FULL: 'Los 12 pasos de planificación, revisando y aprobando cada artefacto. Recomendada para entregables formales.',
  EXPRESS:
    'Un prompt genera toda la planificación; usted la revisa y aprueba en bloque antes de construir.',
  BUILD_ONLY:
    'Un prompt hasta la aplicación validada, sin revisiones intermedias. Para prototipos rápidos.',
};

const BADGE_STYLES: Record<WorkflowRoute, string> = {
  FULL: 'border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300',
  EXPRESS:
    'border-sky-300 bg-sky-50 text-sky-800 dark:border-sky-800 dark:bg-sky-950/40 dark:text-sky-300',
  BUILD_ONLY:
    'border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-300',
};

export function WorkflowRouteBadge({ route }: { route: WorkflowRoute }) {
  return (
    <Badge
      variant="outline"
      className={BADGE_STYLES[route]}
      title={WORKFLOW_ROUTE_DESCRIPTIONS[route]}
    >
      Ruta {WORKFLOW_ROUTE_LABELS[route]}
    </Badge>
  );
}

// Routes with more human review than the current one (a route never moves down).
export function upgradeTargets(route: WorkflowRoute): WorkflowRoute[] {
  return WORKFLOW_ROUTES.slice(WORKFLOW_ROUTES.indexOf(route) + 1);
}

export function UpgradeRouteButton({
  projectId,
  route,
  onUpgraded,
}: {
  projectId: string;
  route: WorkflowRoute;
  onUpgraded: () => Promise<unknown>;
}) {
  const targets = upgradeTargets(route);
  const [open, setOpen] = useState(false);
  const [target, setTarget] = useState<WorkflowRoute | null>(null);
  const [saving, setSaving] = useState(false);
  if (!targets.length) return null;
  const chosen = target ?? targets[0]!;

  async function upgrade() {
    setSaving(true);
    try {
      await api.projects.upgradeWorkflowRoute(projectId, chosen);
      await onUpgraded();
      toast.success(`El proyecto pasó a la ruta ${WORKFLOW_ROUTE_LABELS[chosen]}.`);
      setOpen(false);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'No se pudo cambiar la ruta.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <Button type="button" size="sm" variant="ghost" onClick={() => setOpen(true)}>
        <ArrowUpCircle className="size-4" aria-hidden="true" />
        Subir de ruta…
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Subir de ruta</DialogTitle>
            <DialogDescription>
              Pasar a una ruta con más revisión humana no se puede deshacer. Lo aprobado
              automáticamente se conserva y queda marcado como pendiente de revisión humana.
            </DialogDescription>
          </DialogHeader>
          <fieldset className="flex flex-col gap-2">
            <legend className="sr-only">Nueva ruta</legend>
            {targets.map((option) => (
              <label
                key={option}
                className="flex cursor-pointer items-start gap-2 rounded-md border border-border p-2 text-sm"
              >
                <input
                  type="radio"
                  name="workflow-route"
                  className="mt-1 accent-primary"
                  checked={chosen === option}
                  onChange={() => setTarget(option)}
                />
                <span>
                  <span className="font-medium">{WORKFLOW_ROUTE_LABELS[option]}</span>
                  <span className="block text-xs text-muted-foreground">
                    {WORKFLOW_ROUTE_DESCRIPTIONS[option]}
                  </span>
                </span>
              </label>
            ))}
          </fieldset>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button type="button" disabled={saving} onClick={upgrade}>
              {saving ? 'Cambiando…' : `Subir a ${WORKFLOW_ROUTE_LABELS[chosen]}`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

// Who approved a version (DEC-116). An automatic approval in a project that
// has since moved up from BUILD_ONLY still awaits a person's review.
export function ApprovalOriginBadge({ origin }: { origin: ApprovalOrigin | null }) {
  const { projectId } = useActiveProject();
  const project = useQuery({
    queryKey: ['project', projectId],
    queryFn: () => api.projects.get(projectId!),
    enabled: Boolean(projectId) && origin === 'AUTOMATIC',
  });
  if (origin !== 'AUTOMATIC' && origin !== 'HUMAN_BULK') return null;
  const pendingReview = origin === 'AUTOMATIC' && project.data?.workflowRoute !== 'BUILD_ONLY';
  return (
    <span
      className="rounded-full border border-sky-300 bg-sky-50 px-2 py-0.5 text-xs font-medium text-sky-800 dark:border-sky-800 dark:bg-sky-950/40 dark:text-sky-300"
      title={
        origin === 'HUMAN_BULK'
          ? 'Aprobado por una persona dentro de una revisión en bloque (ruta Exprés).'
          : 'Aprobado por el sistema, sin revisión humana (ruta Solo construcción).'
      }
    >
      {origin === 'HUMAN_BULK'
        ? 'Aprobado en bloque'
        : pendingReview
          ? 'Aprobado automáticamente — pendiente de revisión humana'
          : 'Aprobado automáticamente'}
    </span>
  );
}
