'use client';

import { useEffect, useState } from 'react';
import {
  CheckCircle2,
  Cpu,
  Database,
  FileCode,
  Layout,
  Lightbulb,
  Server,
  Sparkles,
} from 'lucide-react';
import type { GenerationRunResponse } from '@caseflow-ai/contracts';
import { formatDuration, useElapsed } from './generation-overlay';

const CONSTRUCTION_PHASES = [
  {
    id: 'setup',
    label: 'Plantilla y entorno',
    sublabel: 'TargetTemplate base',
    icon: Cpu,
    thresholdMs: 7_000,
  },
  {
    id: 'backend',
    label: 'Backend NestJS',
    sublabel: 'Controladores y servicios',
    icon: Server,
    thresholdMs: 20_000,
  },
  {
    id: 'contracts',
    label: 'Contratos OpenAPI',
    sublabel: 'DTOs y cliente TypeScript',
    icon: FileCode,
    thresholdMs: 32_000,
  },
  {
    id: 'frontend',
    label: 'Frontend Next.js',
    sublabel: 'Pantallas y componentes',
    icon: Layout,
    thresholdMs: 44_000,
  },
  {
    id: 'persistence',
    label: 'Prisma y trazabilidad',
    sublabel: 'Esquema 3NF y links',
    icon: Database,
    thresholdMs: 58_000,
  },
] as const;

const ARCHITECTURAL_TIPS = [
  'Sintetizando controladores y servicios NestJS desacoplados por capacidad de negocio.',
  'Construyendo el cliente de API con TypeScript estricto derivado de la especificación OpenAPI.',
  'Inyectando enlaces de trazabilidad (CodeTraceLink) para enlazar cada archivo a sus requisitos.',
  'Configurando el modelo de datos relacional en Tercera Forma Normal (3NF) con Prisma y PostgreSQL.',
  'Estructurando vistas Next.js con Tailwind CSS y componentes accesibles de shadcn/ui.',
  'El proyecto resultante es un Modular Monolith completo, listo para descargar o validar en Docker.',
];

export function ActiveGenerationProgress({ run }: { run: GenerationRunResponse }) {
  const elapsed = useElapsed(run.startedAt ?? run.createdAt);
  const [tipIndex, setTipIndex] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setTipIndex((prev) => (prev + 1) % ARCHITECTURAL_TIPS.length);
    }, 4500);
    return () => clearInterval(timer);
  }, []);

  // Compute active phase index based on elapsed time
  const currentPhaseIndex = Math.min(
    CONSTRUCTION_PHASES.length - 1,
    CONSTRUCTION_PHASES.findIndex((p) => elapsed < p.thresholdMs) === -1
      ? CONSTRUCTION_PHASES.length - 1
      : CONSTRUCTION_PHASES.findIndex((p) => elapsed < p.thresholdMs),
  );

  // Smooth progressive percentage (up to 95% while active)
  const percent = Math.min(
    95,
    Math.max(
      8,
      Math.floor(
        (currentPhaseIndex / CONSTRUCTION_PHASES.length) * 80 +
          Math.min(15, (elapsed / 60_000) * 15),
      ),
    ),
  );

  return (
    <div
      role="status"
      aria-live="polite"
      className="relative mt-3.5 overflow-hidden rounded-xl border border-primary/30 bg-linear-to-br from-primary/5 via-card/95 to-blue-500/5 p-4 shadow-md sm:p-5 dark:border-primary/40 dark:bg-card/90"
    >
      {/* Ambient background glows */}
      <div
        className="pointer-events-none absolute -top-12 -right-12 size-40 rounded-full bg-primary/10 blur-2xl"
        aria-hidden="true"
      />
      <div
        className="pointer-events-none absolute -bottom-12 -left-12 size-40 rounded-full bg-blue-500/10 blur-2xl"
        aria-hidden="true"
      />

      <div className="relative z-10 flex flex-col gap-4">
        {/* Top Header: Orbital animation + Status info + Timer */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <div
              className="relative flex size-12 shrink-0 items-center justify-center"
              aria-hidden="true"
            >
              <div className="ai-orbit absolute inset-0 rounded-full border-2 border-primary/25 border-t-primary" />
              <div className="ai-orbit-reverse absolute inset-1.5 rounded-full border-2 border-blue-500/20 border-b-blue-600" />
              <div className="ai-pulse flex size-7 items-center justify-center rounded-full bg-primary/15 text-primary shadow-xs">
                <Sparkles className="size-3.5 text-primary animate-pulse" />
              </div>
            </div>

            <div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-semibold text-foreground tracking-tight">
                  Construyendo Modular Monolith TypeScript
                </span>
                <span className="inline-flex items-center gap-1 rounded-full border border-primary/30 bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary">
                  <span className="size-1.5 rounded-full bg-primary animate-ping" />
                  {run.status === 'QUEUED' ? 'En cola' : 'Generación activa'}
                </span>
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                Generando código fuente determinista según el diseño y el plan aprobado.
              </p>
            </div>
          </div>

          {/* Time & Percentage stats */}
          <div className="flex items-baseline justify-between gap-3 sm:flex-col sm:items-end sm:gap-0.5 border-t border-border/40 pt-2 sm:border-0 sm:pt-0">
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-muted-foreground">Avance estimado:</span>
              <span className="font-mono text-base font-bold text-primary">{percent}%</span>
            </div>
            <p className="text-xs text-muted-foreground font-mono">
              Tiempo transcurrido:{' '}
              <span className="font-medium text-foreground">{formatDuration(elapsed)}</span>
              <span className="text-[10px] text-muted-foreground/75"> (~45 s habitual)</span>
            </p>
          </div>
        </div>

        {/* Dynamic Progress Bar */}
        <div className="space-y-1">
          <div
            role="progressbar"
            aria-label="Avance de la generación del proyecto"
            aria-valuenow={percent}
            aria-valuemin={0}
            aria-valuemax={100}
            className="relative h-2.5 w-full overflow-hidden rounded-full bg-muted/80 shadow-inner border border-border/50"
          >
            <div
              className="relative h-full rounded-full bg-gradient-to-r from-primary via-blue-500 to-indigo-500 transition-all duration-700 ease-out shadow-xs"
              style={{ width: `${percent}%` }}
            >
              <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/30 to-transparent animate-shimmer" />
            </div>
          </div>
        </div>

        {/* Construction Stages Pipeline */}
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-5 sm:gap-2">
          {CONSTRUCTION_PHASES.map((phase, idx) => {
            const isCompleted = idx < currentPhaseIndex;
            const isCurrent = idx === currentPhaseIndex;
            const Icon = phase.icon;

            return (
              <div
                key={phase.id}
                className={`flex flex-col gap-1 rounded-lg border p-2 text-xs transition-all ${
                  isCompleted
                    ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-800 dark:text-emerald-300'
                    : isCurrent
                      ? 'border-primary/50 bg-primary/10 text-primary shadow-xs ring-1 ring-primary/25'
                      : 'border-border/60 bg-muted/30 text-muted-foreground opacity-60'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <Icon className="size-3.5 shrink-0" />
                    <span className="font-semibold text-[11px] truncate">{phase.label}</span>
                  </div>
                  {isCompleted ? (
                    <CheckCircle2 className="size-3 text-emerald-600 dark:text-emerald-400 shrink-0" />
                  ) : isCurrent ? (
                    <span className="relative flex size-2 shrink-0">
                      <span className="absolute size-2 rounded-full bg-primary animate-ping opacity-75" />
                      <span className="size-2 rounded-full bg-primary" />
                    </span>
                  ) : null}
                </div>
                <span className="text-[10px] opacity-75 truncate">{phase.sublabel}</span>
              </div>
            );
          })}
        </div>

        {/* Rotating Architectural Tip */}
        <div className="flex items-center gap-2.5 rounded-lg border border-border/70 bg-card/60 px-3 py-2 text-xs text-muted-foreground">
          <Lightbulb className="size-4 shrink-0 text-amber-500" aria-hidden="true" />
          <div className="min-w-0 flex-1">
            <span className="font-medium text-foreground">¿Qué está ocurriendo? </span>
            <span className="transition-opacity duration-300">{ARCHITECTURAL_TIPS[tipIndex]}</span>
          </div>
          <span className="hidden sm:inline font-mono text-[10px] text-muted-foreground/60 shrink-0">
            Paso 5 · Construcción
          </span>
        </div>

        {/* Reassuring Footnote */}
        <div className="flex items-center justify-between text-[11px] text-muted-foreground/80 border-t border-border/40 pt-2">
          <span>
            Esta tarea se ejecuta en segundo plano. Puedes continuar navegando sin perder el
            progreso.
          </span>
          <span className="font-mono text-[10px] text-primary/80">
            {run.targetTemplateIdentifier} v{run.targetTemplateVersion}
          </span>
        </div>
      </div>
    </div>
  );
}
