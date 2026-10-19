'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@caseflow-ai/ui';
import { Sparkles, RefreshCw, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { api, ApiError, type GenerationResult } from '../lib/api';
import { GenerationCancelButton } from './generation-cancel-button';
import { GenerationProgressCard } from './generation-progress-card';

export function RequirementGenerationPanel({
  projectId,
  contextVersionId,
  onCompleted,
  children,
}: {
  projectId: string;
  contextVersionId: string | null;
  onCompleted: (generation: GenerationResult) => void;
  children?: ReactNode;
}) {
  const client = useQueryClient();
  const [starting, setStarting] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [retryLoad, setRetryLoad] = useState(0);
  const delivered = useRef<string | null>(null);
  const watch = useQuery({
    queryKey: ['requirement-generation-job', projectId],
    queryFn: () => api.requirements.latestGeneration(projectId),
    refetchInterval: (query) =>
      ['QUEUED', 'RUNNING'].includes(query.state.data?.job?.status ?? '') ? 2000 : false,
  });
  const job = watch.data?.job;
  const generationId = job?.generationId;
  const jobStatus = job?.status;
  const sourceContextVersionId = job?.sourceContextVersionId;
  const resumable =
    (jobStatus === 'FAILED' || jobStatus === 'CANCELLED') &&
    sourceContextVersionId === contextVersionId;
  const running = !!job && ['QUEUED', 'RUNNING'].includes(job.status);

  useEffect(() => {
    if (
      !generationId ||
      jobStatus !== 'COMPLETED' ||
      sourceContextVersionId !== contextVersionId ||
      delivered.current === generationId
    )
      return;
    let cancelled = false;
    delivered.current = generationId;
    api.requirements
      .generation(projectId, generationId)
      .then((result) => {
        if (!cancelled && result.candidates.some((candidate) => !candidate.acceptedArtifactId))
          onCompleted(result);
      })
      .catch((error) => {
        if (!cancelled) {
          delivered.current = null;
          setLoadError(true);
          toast.error(
            error instanceof ApiError ? error.message : 'No se pudieron cargar las propuestas.',
          );
        }
      });
    return () => {
      cancelled = true;
      if (delivered.current === generationId) delivered.current = null;
    };
  }, [
    generationId,
    jobStatus,
    sourceContextVersionId,
    contextVersionId,
    projectId,
    onCompleted,
    retryLoad,
  ]);

  async function start() {
    if (!contextVersionId) {
      toast.info('Primero apruebe el Contexto del proyecto.');
      return;
    }
    setStarting(true);
    try {
      const next = await api.requirements.startGeneration(projectId, contextVersionId);
      setLoadError(false);
      client.setQueryData(['requirement-generation-job', projectId], { job: next });
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : 'No se pudo iniciar la generación.');
    } finally {
      setStarting(false);
    }
  }

  return (
    <div className="flex flex-col gap-4 w-full">
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" disabled={starting || running} onClick={start}>
          {starting || running ? (
            <Loader2 className="size-4 animate-spin" aria-hidden="true" />
          ) : resumable ? (
            <RefreshCw className="size-4" aria-hidden="true" />
          ) : (
            <Sparkles className="size-4" aria-hidden="true" />
          )}
          {starting
            ? 'Iniciando…'
            : running
              ? 'Generando…'
              : resumable
                ? 'Reanudar generación'
                : 'Generar con IA'}
        </Button>
        {children}
      </div>

      {loadError ? (
        <p role="alert" className="text-sm text-destructive">
          No se pudieron cargar las propuestas completas.{' '}
          <Button
            variant="ghost"
            onClick={() => {
              setLoadError(false);
              setRetryLoad((value) => value + 1);
            }}
          >
            Cargar propuestas
          </Button>
        </p>
      ) : null}

      {job && running ? (
        <GenerationProgressCard
          job={job}
          title="Generando requisitos por lotes"
          progressLabel="Lotes de requisitos validados"
        />
      ) : null}

      {job && running ? (
        <GenerationCancelButton
          onCancel={async () =>
            client.setQueryData(['requirement-generation-job', projectId], {
              job: await api.requirements.cancelGeneration(projectId, job.id),
            })
          }
        />
      ) : null}

      {resumable && jobStatus === 'CANCELLED' ? (
        <p role="status" className="text-sm text-muted-foreground">
          {job?.errorMessage}
        </p>
      ) : null}

      {resumable && jobStatus === 'FAILED' ? (
        <p role="alert" className="text-sm text-destructive">
          {job?.errorMessage} Los lotes completos se conservan para reanudar.
        </p>
      ) : null}

      {watch.error ? (
        <p role="alert" className="text-sm text-destructive">
          No se pudo consultar el avance.{' '}
          <Button variant="ghost" onClick={() => void watch.refetch()}>
            Reintentar consulta
          </Button>
        </p>
      ) : null}
    </div>
  );
}
