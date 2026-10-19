'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@caseflow-ai/ui';
import { Loader2, RefreshCw, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import { ApiError, type GenerationResult } from '../lib/api';
import { GenerationCancelButton } from './generation-cancel-button';
import { GenerationProgressCard } from './generation-progress-card';

interface BatchedJob {
  id: string;
  status: string;
  generationId: string | null;
  errorMessage: string | null;
  completedBatches: number;
  totalBatches: number;
  outputChars: number;
  createdAt: string;
}

const sameSelection = (a: string[], b: string[]) =>
  a.length === b.length && a.every((id) => b.includes(id));

// A generation done in batches in the background (DEC-132, DEC-139, DEC-142):
// it shows the progress, offers to resume a failed run of the same selection,
// and hands the proposals over for review when the job finishes, also after
// the page was closed and opened again. What it generates, and the calls that
// start and read the job, come from the caller.
export function BatchedGenerationPanel<Job extends BatchedJob>({
  queryKey,
  latest,
  start,
  cancel,
  fetchGeneration,
  jobSelection,
  selection,
  onCompleted,
  title,
  progressLabel,
  startLabel,
  children,
}: {
  queryKey: readonly unknown[];
  latest: () => Promise<{ job: Job | null }>;
  start: () => Promise<Job>;
  // Stops the running job; without it the generation cannot be cancelled.
  cancel?: (jobId: string) => Promise<Job>;
  fetchGeneration: (generationId: string) => Promise<GenerationResult>;
  jobSelection: (job: Job) => string[];
  selection: string[];
  onCompleted: (generation: GenerationResult) => void;
  title: string;
  progressLabel: string;
  startLabel: (count: number) => string;
  children?: ReactNode;
}) {
  const client = useQueryClient();
  const [starting, setStarting] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [retryLoad, setRetryLoad] = useState(0);
  const delivered = useRef<string | null>(null);
  const watch = useQuery({
    queryKey,
    queryFn: latest,
    refetchInterval: (query) =>
      ['QUEUED', 'RUNNING'].includes(query.state.data?.job?.status ?? '') ? 2000 : false,
  });
  const job = watch.data?.job;
  const generationId = job?.generationId;
  const jobStatus = job?.status;
  const running = !!job && ['QUEUED', 'RUNNING'].includes(job.status);
  const stopped = jobStatus === 'FAILED' || jobStatus === 'CANCELLED';
  const resumable = stopped && !!job && sameSelection(jobSelection(job), selection);

  // The generation getter and the callback are the caller's: held in refs so a
  // new function on each render does not reload the proposals.
  const fetchRef = useRef(fetchGeneration);
  fetchRef.current = fetchGeneration;
  useEffect(() => {
    if (!generationId || jobStatus !== 'COMPLETED' || delivered.current === generationId) return;
    let cancelled = false;
    delivered.current = generationId;
    fetchRef
      .current(generationId)
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
  }, [generationId, jobStatus, onCompleted, retryLoad]);

  async function startJob() {
    if (!selection.length) {
      toast.info('Seleccione al menos un elemento aprobado como base para la generación.');
      return;
    }
    setStarting(true);
    try {
      const next = await start();
      setLoadError(false);
      client.setQueryData(queryKey, { job: next });
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : 'No se pudo iniciar la generación.');
    } finally {
      setStarting(false);
    }
  }

  return (
    <div className="flex w-full flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          className="gap-2"
          disabled={starting || running || selection.length === 0}
          onClick={startJob}
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
                : startLabel(selection.length)}
        </Button>
        {children}
      </div>

      {job && running ? (
        <GenerationProgressCard job={job} title={title} progressLabel={progressLabel} />
      ) : null}

      {job && running && cancel ? (
        <GenerationCancelButton
          onCancel={async () => client.setQueryData(queryKey, { job: await cancel(job.id) })}
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
