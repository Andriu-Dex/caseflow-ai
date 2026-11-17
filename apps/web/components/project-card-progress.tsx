'use client';

import { useQuery } from '@tanstack/react-query';
import { Globe } from 'lucide-react';
import { api } from '../lib/api';

// How far a project has gone, on its card, so a person can tell projects apart
// without opening each one: its planning stages and whether its demonstration
// is online.
export function ProjectCardProgress({ projectId }: { projectId: string }) {
  const readiness = useQuery({
    queryKey: ['readiness', projectId],
    queryFn: () => api.readiness.get(projectId),
    retry: false,
  });
  const deployments = useQuery({
    queryKey: ['deployments', projectId],
    queryFn: () => api.deployments.list(projectId),
    retry: false,
  });
  const stages = readiness.data?.stages;
  if (!stages?.length) return null;
  const done = stages.filter((stage) => stage.satisfied).length;
  const percentage = Math.round((done / stages.length) * 100);
  const online = deployments.data?.items.some((item) => item.status === 'RUNNING');
  return (
    <div className="flex flex-col gap-1.5" aria-label="Avance del proyecto">
      <div className="flex items-center justify-between text-[11px] text-muted-foreground">
        <span>Planificación</span>
        <span>
          {done} / {stages.length} etapas
        </span>
      </div>
      <div
        role="progressbar"
        aria-label="Avance de la planificación"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percentage}
        className="h-1.5 overflow-hidden rounded-full bg-muted"
      >
        <div
          className={`h-full rounded-full ${percentage === 100 ? 'bg-emerald-500' : 'bg-primary'}`}
          style={{ width: `${percentage}%` }}
        />
      </div>
      {online ? (
        <span className="inline-flex items-center gap-1 self-start rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[11px] font-medium text-emerald-800 dark:text-emerald-300">
          <Globe className="size-3" aria-hidden="true" />
          Demostración en línea
        </span>
      ) : null}
    </div>
  );
}
