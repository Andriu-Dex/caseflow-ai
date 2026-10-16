'use client';

import { Activity, CheckCircle2, Clock, FileText, Info, Layers, Sparkles } from 'lucide-react';
import { formatDuration, useElapsed } from './generation-overlay';

// The progress of a batched generation (DEC-132, DEC-139): batches validated,
// elapsed time and what is happening now. Shared by every batched generation.
export function GenerationProgressCard({
  job,
  title,
  progressLabel,
}: {
  job: { completedBatches: number; totalBatches: number; outputChars: number; createdAt: string };
  title: string;
  progressLabel: string;
}) {
  const elapsed = useElapsed(job.createdAt);
  const percent = job.totalBatches
    ? Math.min(99, Math.floor((job.completedBatches / job.totalBatches) * 100))
    : 0;
  return (
    <section
      role="status"
      aria-live="polite"
      className="relative overflow-hidden rounded-2xl border border-primary/25 bg-card/90 p-5 shadow-lg shadow-primary/5 sm:p-6 backdrop-blur-sm dark:border-primary/30 dark:bg-card/75 dark:shadow-none"
    >
      {/* Subtle ambient lighting effects */}
      <div
        className="pointer-events-none absolute -top-16 -right-16 size-48 rounded-full bg-primary/10 blur-3xl dark:bg-primary/20"
        aria-hidden="true"
      />
      <div
        className="pointer-events-none absolute -bottom-16 -left-16 size-44 rounded-full bg-blue-500/10 blur-3xl dark:bg-blue-500/15"
        aria-hidden="true"
      />

      <div className="relative z-10 flex flex-col gap-5">
        {/* Header: Animated AI Orbit Rings + Title + Percent Badge */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3.5">
            <div
              className="relative flex size-11 shrink-0 items-center justify-center"
              aria-hidden="true"
            >
              <div className="ai-orbit absolute inset-0 rounded-full border-2 border-primary/20 border-t-primary" />
              <div className="ai-orbit-reverse absolute inset-1 rounded-full border-2 border-primary/15 border-b-primary/70" />
              <div className="ai-pulse flex size-7 items-center justify-center rounded-full bg-primary/15 text-primary shadow-sm">
                <Sparkles className="size-3.5 text-primary" />
              </div>
            </div>

            <div>
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-base font-semibold text-foreground tracking-tight">{title}</p>
                <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary border border-primary/20">
                  <span className="size-1.5 rounded-full bg-primary animate-pulse" />
                  En progreso
                </span>
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                {job.outputChars
                  ? 'Recibiendo y analizando respuestas en streaming'
                  : 'Preparando y estructurando el lote con el contexto del proyecto'}
              </p>
            </div>
          </div>

          {/* Progress percentage & batch counter */}
          <div className="flex items-baseline gap-2 sm:flex-col sm:items-end sm:gap-0.5">
            <span className="text-2xl font-bold tracking-tight text-primary font-mono">
              {percent}%
            </span>
            <p className="text-xs font-medium text-muted-foreground">
              {job.completedBatches} de {job.totalBatches || '…'} lotes validados · {percent} %
            </p>
          </div>
        </div>

        {/* Batch Step Pills: Shown when totalBatches is defined and up to 6 */}
        {job.totalBatches && job.totalBatches > 1 && job.totalBatches <= 6 ? (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-2.5">
            {Array.from({ length: job.totalBatches }).map((_, idx) => {
              const isCompleted = idx < job.completedBatches;
              const isCurrent = idx === job.completedBatches;
              return (
                <div
                  key={idx}
                  className={`flex items-center gap-2 rounded-lg border px-2.5 py-1.5 text-xs transition-all ${
                    isCompleted
                      ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 font-medium'
                      : isCurrent
                        ? 'border-primary/40 bg-primary/10 text-primary font-medium shadow-sm ring-1 ring-primary/20'
                        : 'border-border/60 bg-muted/40 text-muted-foreground opacity-60'
                  }`}
                >
                  {isCompleted ? (
                    <CheckCircle2 className="size-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" />
                  ) : isCurrent ? (
                    <span className="relative flex size-3.5 shrink-0 items-center justify-center">
                      <span className="absolute size-2 rounded-full bg-primary animate-ping opacity-75" />
                      <span className="size-2 rounded-full bg-primary" />
                    </span>
                  ) : (
                    <div className="size-3.5 shrink-0 rounded-full border border-muted-foreground/30" />
                  )}
                  <span className="truncate">Lote {idx + 1}</span>
                  {isCompleted ? (
                    <span className="ml-auto text-[10px] opacity-75">OK</span>
                  ) : isCurrent ? (
                    <span className="ml-auto text-[10px] font-semibold animate-pulse">ACTIVO</span>
                  ) : null}
                </div>
              );
            })}
          </div>
        ) : null}

        {/* Enhanced Progress Bar */}
        <div className="space-y-1.5">
          <div
            role="progressbar"
            aria-label={progressLabel}
            aria-valuenow={percent}
            aria-valuemin={0}
            aria-valuemax={100}
            className="relative h-3 w-full overflow-hidden rounded-full bg-muted/80 dark:bg-muted/40 shadow-inner border border-border/40"
          >
            {/* When percent is 0, show active moving wave so it never looks frozen */}
            {percent === 0 ? (
              <div className="mockup-progress-indeterminate h-full w-1/3 rounded-full bg-gradient-to-r from-primary/30 via-primary to-primary/30 shadow-sm shadow-primary/30" />
            ) : (
              <div
                className="relative h-full rounded-full bg-gradient-to-r from-primary via-blue-500 to-indigo-500 transition-all duration-700 ease-out shadow-sm shadow-primary/30"
                style={{ width: `${percent}%` }}
              >
                <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/30 to-transparent animate-shimmer" />
              </div>
            )}
          </div>
        </div>

        {/* Metrics Row: 3 clean mini cards */}
        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
          <div className="flex items-center gap-3 rounded-xl border border-border/50 bg-muted/40 p-3 dark:bg-card/50">
            <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Layers className="size-4" />
            </div>
            <div className="min-w-0">
              <p className="text-[11px] text-muted-foreground font-medium">Lotes validados</p>
              <p className="text-sm font-semibold text-foreground">
                {job.completedBatches} / {job.totalBatches || '…'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3 rounded-xl border border-border/50 bg-muted/40 p-3 dark:bg-card/50">
            <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-blue-500/10 text-blue-500 dark:text-blue-400">
              <FileText className="size-4" />
            </div>
            <div className="min-w-0">
              <p className="text-[11px] text-muted-foreground font-medium">Caracteres del lote</p>
              <p className="text-sm font-semibold text-foreground">
                {job.outputChars ? job.outputChars.toLocaleString('es') : '0'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3 rounded-xl border border-border/50 bg-muted/40 p-3 dark:bg-card/50">
            <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-amber-500/10 text-amber-500 dark:text-amber-400">
              <Clock className="size-4" />
            </div>
            <div className="min-w-0">
              <p className="text-[11px] text-muted-foreground font-medium">Tiempo transcurrido</p>
              <p className="text-sm font-semibold text-foreground">{formatDuration(elapsed)}</p>
            </div>
          </div>
        </div>

        {/* Live streaming status callout */}
        <div className="flex items-center gap-3 rounded-xl border border-primary/15 bg-primary/5 px-3.5 py-2.5 text-xs text-foreground/90 dark:border-primary/20 dark:bg-primary/[0.08]">
          <Activity className="size-4 shrink-0 text-primary animate-pulse" />
          <p className="font-medium">
            {job.outputChars
              ? `Recibiendo la respuesta del lote: ${job.outputChars.toLocaleString('es')} caracteres.`
              : 'Preparando o validando el siguiente lote.'}
          </p>
        </div>

        {/* Informational notes */}
        <div className="flex items-start gap-2.5 rounded-lg bg-muted/30 px-3.5 py-2.5 text-xs text-muted-foreground border border-border/40">
          <Info className="size-3.5 shrink-0 mt-0.5 text-muted-foreground/80" />
          <div className="flex flex-col gap-0.5">
            <p>
              Tiempo transcurrido: {formatDuration(elapsed)}. Puede salir de esta página; el trabajo
              continúa mientras CASEFlow esté abierto.
            </p>
            <p className="text-[11px] text-muted-foreground/80">
              Las propuestas completas aparecerán para revisión al finalizar.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
