'use client';

import { useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@caseflow-ai/ui';
import { Loader2, RefreshCw, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import { api, ApiError, type GenerationResult } from '../lib/api';
import { GenerationProgressCard } from './generation-progress-card';

const sameSelection = (a: string[], b: string[]) =>
  a.length === b.length && a.every((id) => b.includes(id));

// Generates use cases in the background, a few requirements per batch
// (DEC-139), and hands the proposals over for review when the job finishes,
// also after the page was closed and opened again.
export function UseCaseGenerationPanel({
  projectId,
  requirementVersionIds,
  onCompleted,
}: {
  projectId: string;
  requirementVersionIds: string[];
  onCompleted: (generation: GenerationResult) => void;
}) {
  const client = useQueryClient();
  const [starting, setStarting] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [retryLoad, setRetryLoad] = useState(0);
  const delivered = useRef<string | null>(null);
  const watch = useQuery({
    queryKey: ['use-case-generation-job', projectId],
    queryFn: () => api.useCases.latestGeneration(projectId),
    refetchInterval: (query) =>
      ['QUEUED', 'RUNNING'].includes(query.state.data?.job?.status ?? '') ? 2000 : false,
  });
  const job = watch.data?.job;
  const generationId = job?.generationId;
  const jobStatus = job?.status;
  const running = !!job && ['QUEUED', 'RUNNING'].includes(job.status);
  const resumable =
    jobStatus === 'FAILED' &&
    !!job &&
    sameSelection(job.requirementVersionIds, requirementVersionIds);

  useEffect(() => {
    if (!generationId || jobStatus !== 'COMPLETED' || delivered.current === generationId) return;
    let cancelled = false;
    delivered.current = generationId;
    api.useCases
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
  }, [generationId, jobStatus, projectId, onCompleted, retryLoad]);

  async function start() {
    if (!requirementVersionIds.length) {
      toast.info('Seleccione al menos un requisito aprobado para generar casos de uso.');
      return;
    }
    setStarting(true);
    try {
      const next = await api.useCases.startGeneration(projectId, requirementVersionIds);
      setLoadError(false);
      client.setQueryData(['use-case-generation-job', projectId], { job: next });
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : 'No se pudo iniciar la generación.');
    } finally {
      setStarting(false);
    }
  }

  const count = requirementVersionIds.length;
  return (
    <div className="flex flex-col gap-4 w-full">
      <Button
        type="button"
        className="self-start"
        disabled={starting || running || count === 0}
        onClick={start}
      >
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
              : `Generar con ${count} ${count === 1 ? 'requisito' : 'requisitos'}`}
      </Button>

      {job && running ? (
        <GenerationProgressCard
          job={job}
          title="Generando casos de uso por lotes"
          progressLabel="Lotes de casos de uso validados"
        />
      ) : null}

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
