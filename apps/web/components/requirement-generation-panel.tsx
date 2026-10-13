'use client';

import { useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@caseflow-ai/ui';
import { Sparkles, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { api, ApiError, type GenerationResult } from '../lib/api';
import { formatDuration, useElapsed } from './generation-overlay';

export function RequirementGenerationPanel({
  projectId,
  contextVersionId,
  onCompleted,
}: {
  projectId: string;
  contextVersionId: string | null;
  onCompleted: (generation: GenerationResult) => void;
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
  const resumable = jobStatus === 'FAILED' && sourceContextVersionId === contextVersionId;
  const running = !!job && ['QUEUED', 'RUNNING'].includes(job.status);
  const elapsed = useElapsed(running ? job.createdAt : null);
  const percent = job?.totalBatches
    ? Math.min(99, Math.floor((job.completedBatches / job.totalBatches) * 100))
    : 0;
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
    <div className="flex flex-col gap-3">
      <Button type="button" disabled={starting || running} onClick={start}>
        {resumable ? (
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
      {running ? (
        <section
          role="status"
          aria-live="polite"
          className="rounded-lg border border-border bg-card p-4 text-sm"
        >
          <p className="font-medium">Generando requisitos por lotes</p>
          <p>
            {job.completedBatches} de {job.totalBatches || '…'} lotes validados · {percent} %
          </p>
          <div
            role="progressbar"
            aria-label="Lotes de requisitos validados"
            aria-valuenow={percent}
            aria-valuemin={0}
            aria-valuemax={100}
            className="my-2 h-2 overflow-hidden rounded bg-muted"
          >
            <div className="h-full bg-primary transition-all" style={{ width: `${percent}%` }} />
          </div>
          <p>
            {job.outputChars
              ? `Recibiendo la respuesta del lote: ${job.outputChars.toLocaleString('es')} caracteres.`
              : 'Preparando o validando el siguiente lote.'}
          </p>
          <p>
            Tiempo transcurrido: {formatDuration(elapsed)}. Puede salir de esta página; el trabajo
            continúa mientras CASEFlow esté abierto.
          </p>
          <p>Las propuestas completas aparecerán para revisión al finalizar.</p>
        </section>
      ) : null}
      {resumable ? (
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
