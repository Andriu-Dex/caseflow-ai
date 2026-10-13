'use client';

import { contextItemCode } from '@caseflow-ai/contracts';
import { GenerationProgress } from '../../components/generation-progress';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  AlertTriangle,
  CheckCircle2,
  FileText,
  Scale,
  ShieldAlert,
  Sparkles,
  Target,
  Users,
} from 'lucide-react';
import { toast } from 'sonner';
import type {
  ProjectContextCandidate,
  ProjectContextGenerationJob,
  ProjectContextResponse,
} from '@caseflow-ai/contracts';
import { api, ApiError } from '../../lib/api';
import { QueryState, RequireActiveProject } from '../../components/query-state';
import { PageHeading } from '../../components/page-heading';
import { ContextCode } from '../../components/context-coverage';
import { StatusBadge } from '../../components/status-badge';
import { Button } from '@caseflow-ai/ui';

// The read view already renders each line as its own bulleted <li>, so a
// leading "- "/"* "/"• " the user typed by habit (a very natural way to type
// a list into a plain textarea) would otherwise double up as "• - text".
const linesToItems = (text: string) =>
  text
    .split('\n')
    .map((l) => l.trim().replace(/^[-*•]\s+/, ''))
    .filter(Boolean)
    .map((description) => ({ description }));

// One actor per line as "Nombre: responsabilidades"; the description is optional.
const actorLine = (actor: { name: string; description?: string | null }) =>
  actor.description ? `${actor.name}: ${actor.description}` : actor.name;
const linesToActors = (text: string) =>
  linesToItems(text).map(({ description: line }) => {
    const colon = line.indexOf(':');
    const name = (colon > 0 ? line.slice(0, colon) : line).trim();
    const description = colon > 0 ? line.slice(colon + 1).trim() : '';
    return description ? { name, description } : { name };
  });
type ScopeType = 'IN_SCOPE' | 'OUT_OF_SCOPE';
const scopeLines = (items: { type: ScopeType; description: string }[], type: ScopeType) =>
  items
    .filter((item) => item.type === type)
    .map((item) => item.description)
    .join('\n');

// Per-tab unsent-draft convenience (not backend state): recovers an
// in-progress Context form after the browser discards/reloads a
// backgrounded tab. Never a substitute for actually saving the form.
interface ContextDraft {
  problemStatement: string;
  objective: string;
  additionalContext: string;
  actorsText: string;
  inScopeText?: string;
  outOfScopeText?: string;
  needsText: string;
  constraintsText: string;
  businessRulesText: string;
  sourceVersionIds: string[];
}
const draftKey = (projectId: string) => `caseflow.context-draft.${projectId}`;
function readDraft(projectId: string): ContextDraft | null {
  try {
    const raw = window.sessionStorage.getItem(draftKey(projectId));
    return raw ? (JSON.parse(raw) as ContextDraft) : null;
  } catch {
    return null;
  }
}
function writeDraft(projectId: string, draft: ContextDraft) {
  try {
    window.sessionStorage.setItem(draftKey(projectId), JSON.stringify(draft));
  } catch {
    // Private browsing / blocked storage: draft just won't survive a reload.
  }
}
const draftFromCandidate = (candidate: ProjectContextCandidate): ContextDraft => ({
  problemStatement: candidate.content.problemStatement,
  objective: candidate.content.objective,
  additionalContext: candidate.content.additionalContext ?? '',
  actorsText: candidate.content.actors.map(actorLine).join('\n'),
  inScopeText: scopeLines(candidate.content.scopeItems, 'IN_SCOPE'),
  outOfScopeText: scopeLines(candidate.content.scopeItems, 'OUT_OF_SCOPE'),
  needsText: candidate.content.needs.join('\n'),
  constraintsText: candidate.content.constraints.join('\n'),
  businessRulesText: candidate.content.businessRules.join('\n'),
  sourceVersionIds: candidate.sourceVersionIds,
});

// DEC-132: the proposal is generated in the background, so leaving or
// reloading the page loses nothing. The page follows the latest job while it
// runs and, when it finishes, puts the proposal in the form's draft once.
const appliedKey = (projectId: string) => `caseflow.context-applied.${projectId}`;
const isRunning = (job: ProjectContextGenerationJob | null | undefined) =>
  job?.status === 'QUEUED' || job?.status === 'RUNNING';
function wasApplied(projectId: string, candidateId: string) {
  try {
    return window.sessionStorage.getItem(appliedKey(projectId)) === candidateId;
  } catch {
    return false;
  }
}
function markApplied(projectId: string, candidateId: string) {
  try {
    window.sessionStorage.setItem(appliedKey(projectId), candidateId);
  } catch {
    // Private browsing: the proposal may be offered again after a reload.
  }
}
function announceCandidate(candidate: ProjectContextCandidate) {
  toast.success('La propuesta del contexto está lista. Revísela antes de guardarla.');
  const reports = candidate.reportSourceVersionIds.length;
  if (reports)
    toast.info(
      reports === 1
        ? 'La propuesta también se apoyó en el reporte aprobado de una fuente.'
        : `La propuesta también se apoyó en los reportes aprobados de ${reports} fuentes.`,
    );
  // DEC-127: a long source is read as its most relevant sections.
  const partial = candidate.partialSourceVersionIds.length;
  if (partial)
    toast.info(
      partial === 1
        ? 'Una fuente es larga: la propuesta usó sus secciones más relevantes y su reporte. Revise que no falte nada importante.'
        : `${partial} fuentes son largas: la propuesta usó sus secciones más relevantes y sus reportes. Revise que no falte nada importante.`,
    );
}

function clearDraft(projectId: string) {
  try {
    window.sessionStorage.removeItem(draftKey(projectId));
  } catch {
    // Ignore.
  }
}

function ContextForm({
  projectId,
  onSaved,
  hasExisting,
  initial,
  generating,
  onGenerate,
}: {
  projectId: string;
  onSaved: () => void;
  hasExisting: boolean;
  // A background generation is running (DEC-132); its progress shows above.
  generating: boolean;
  onGenerate: () => void;
  // The current approved/current version, so "Crear nueva versión" starts
  // from what is already approved instead of a blank form — otherwise the
  // user loses their existing problem statement, objective, actors, etc.
  // every time they open it (only an unsent draft, if any, ever survived).
  initial?: ProjectContextResponse;
}) {
  const sources = useQuery({
    queryKey: ['sources', projectId],
    queryFn: () => api.sources.list(projectId),
  });
  const approvedSources = useMemo(
    () => (sources.data?.items ?? []).filter((s) => s.version.status === 'APPROVED'),
    [sources.data],
  );

  const draft = useMemo(() => readDraft(projectId), [projectId]);

  const [problemStatement, setProblemStatement] = useState(
    () => draft?.problemStatement ?? initial?.problemStatement ?? '',
  );
  const [objective, setObjective] = useState(() => draft?.objective ?? initial?.objective ?? '');
  const [additionalContext, setAdditionalContext] = useState(
    () => draft?.additionalContext ?? initial?.additionalContext ?? '',
  );
  const [actorsText, setActorsText] = useState(
    () => draft?.actorsText ?? initial?.actors.map(actorLine).join('\n') ?? '',
  );
  const [inScopeText, setInScopeText] = useState(
    () => draft?.inScopeText ?? scopeLines(initial?.scopeItems ?? [], 'IN_SCOPE'),
  );
  const [outOfScopeText, setOutOfScopeText] = useState(
    () => draft?.outOfScopeText ?? scopeLines(initial?.scopeItems ?? [], 'OUT_OF_SCOPE'),
  );
  const [needsText, setNeedsText] = useState(
    () => draft?.needsText ?? initial?.needs.map((n) => n.description).join('\n') ?? '',
  );
  const [constraintsText, setConstraintsText] = useState(
    () => draft?.constraintsText ?? initial?.constraints.map((n) => n.description).join('\n') ?? '',
  );
  const [businessRulesText, setBusinessRulesText] = useState(
    () =>
      draft?.businessRulesText ?? initial?.businessRules.map((n) => n.description).join('\n') ?? '',
  );
  const [sourceVersionIds, setSourceVersionIds] = useState<string[]>(
    () => draft?.sourceVersionIds ?? [],
  );
  // Prefilling sourceVersionIds needs the sources list (async), so it can't
  // happen in the lazy useState initializers above like the text fields did.
  // Runs once: never overrides a recovered draft, and upgrades each already
  // -linked source to its current approved version (by code) when one
  // exists, so a newer approved source version is pre-selected automatically
  // instead of silently staying pinned to the one the old version used.
  const [sourcesPrefilled, setSourcesPrefilled] = useState(Boolean(draft));
  useEffect(() => {
    if (sourcesPrefilled || !initial || sources.isLoading) return;
    const latestByCode = new Map(approvedSources.map((s) => [s.code, s.version.id]));
    setSourceVersionIds(initial.sources.map((s) => latestByCode.get(s.code) ?? s.versionId));
    setSourcesPrefilled(true);
  }, [sourcesPrefilled, initial, sources.isLoading, approvedSources]);

  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    writeDraft(projectId, {
      problemStatement,
      objective,
      additionalContext,
      actorsText,
      inScopeText,
      outOfScopeText,
      needsText,
      constraintsText,
      businessRulesText,
      sourceVersionIds,
    });
  }, [
    projectId,
    problemStatement,
    objective,
    additionalContext,
    actorsText,
    inScopeText,
    outOfScopeText,
    needsText,
    constraintsText,
    businessRulesText,
    sourceVersionIds,
  ]);

  function toggleSource(versionId: string) {
    setSourceVersionIds((prev) =>
      prev.includes(versionId) ? prev.filter((id) => id !== versionId) : [...prev, versionId],
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    const input = {
      problemStatement,
      objective,
      additionalContext: additionalContext || undefined,
      actors: linesToActors(actorsText),
      needs: linesToItems(needsText),
      constraints: linesToItems(constraintsText),
      businessRules: linesToItems(businessRulesText),
      scopeItems: [
        ...linesToItems(inScopeText).map((i) => ({ type: 'IN_SCOPE' as const, ...i })),
        ...linesToItems(outOfScopeText).map((i) => ({ type: 'OUT_OF_SCOPE' as const, ...i })),
      ],
      sourceVersionIds,
    };
    try {
      if (hasExisting) await api.context.createVersion(projectId, input);
      else await api.context.create(projectId, input);
      clearDraft(projectId);
      onSaved();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'No se pudo guardar el contexto.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="flex flex-col gap-6 rounded-xl border border-border bg-card p-6 shadow-sm transition-all duration-200 hover:shadow-md"
    >
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border pb-4">
        <div>
          <h2 className="text-lg font-semibold tracking-tight text-foreground">
            {hasExisting ? 'Nueva versión del Contexto' : 'Definir Contexto del Proyecto'}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Complete la información a continuación para establecer la base de su proyecto.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            size="sm"
            type="button"
            onClick={onGenerate}
            disabled={generating || approvedSources.length === 0}
            title={
              approvedSources.length === 0
                ? 'Primero apruebe al menos una fuente del proyecto.'
                : 'Completa los campos a partir de las fuentes aprobadas. Revíselos y edítelos antes de guardar.'
            }
            className="group relative overflow-hidden border-primary/20 hover:border-primary/50 hover:bg-primary/5"
          >
            <div className="absolute inset-0 bg-gradient-to-r from-primary/10 to-transparent opacity-0 transition-opacity group-hover:opacity-100" />
            <Sparkles
              className="mr-2 size-4 text-primary group-hover:animate-pulse"
              aria-hidden="true"
            />
            <span className="font-medium text-primary">
              {generating ? 'Generando…' : 'Generar con IA'}
            </span>
          </Button>
        </div>
      </div>

      <div className="space-y-6">
        <label className="group flex flex-col gap-2">
          <span className="flex items-center gap-2 text-sm font-medium text-foreground transition-colors group-focus-within:text-primary">
            <FileText className="size-4" aria-hidden="true" />
            Planteamiento del problema
          </span>
          <textarea
            required
            rows={4}
            className="rounded-lg border border-input bg-transparent px-3 py-2 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:border-primary focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary"
            value={problemStatement}
            onChange={(e) => setProblemStatement(e.target.value)}
            placeholder="Describa el problema principal que este proyecto busca resolver..."
          />
        </label>

        <label className="group flex flex-col gap-2">
          <span className="flex items-center gap-2 text-sm font-medium text-foreground transition-colors group-focus-within:text-primary">
            <Target className="size-4" aria-hidden="true" />
            Objetivo
          </span>
          <textarea
            required
            rows={3}
            className="rounded-lg border border-input bg-transparent px-3 py-2 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:border-primary focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary"
            value={objective}
            onChange={(e) => setObjective(e.target.value)}
            placeholder="¿Cuál es el objetivo principal del proyecto?"
          />
        </label>

        <div className="grid gap-6 sm:grid-cols-2">
          <label className="group flex flex-col gap-2">
            <span className="flex items-center gap-2 text-sm font-medium text-foreground transition-colors group-focus-within:text-primary">
              <Users className="size-4" aria-hidden="true" />
              Actores{' '}
              <span className="ml-auto text-xs font-normal text-muted-foreground">
                (uno por línea · Nombre: responsabilidades)
              </span>
            </span>
            <textarea
              rows={4}
              className="rounded-lg border border-input bg-transparent px-3 py-2 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:border-primary focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary"
              value={actorsText}
              onChange={(e) => setActorsText(e.target.value)}
              placeholder="Ej: Administrador: configura el sistema y los usuarios&#10;Cajero: registra las ventas"
            />
          </label>
          <label className="group flex flex-col gap-2">
            <span className="flex items-center gap-2 text-sm font-medium text-foreground transition-colors group-focus-within:text-primary">
              <CheckCircle2 className="size-4" aria-hidden="true" />
              Necesidades{' '}
              <span className="ml-auto text-xs font-normal text-muted-foreground">
                (una por línea)
              </span>
            </span>
            <textarea
              rows={4}
              className="rounded-lg border border-input bg-transparent px-3 py-2 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:border-primary focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary"
              value={needsText}
              onChange={(e) => setNeedsText(e.target.value)}
              placeholder="Ej: Registro rápido de usuarios&#10;Reportes en tiempo real"
            />
          </label>
          <label className="group flex flex-col gap-2">
            <span className="flex items-center gap-2 text-sm font-medium text-foreground transition-colors group-focus-within:text-primary">
              <ShieldAlert className="size-4" aria-hidden="true" />
              Restricciones{' '}
              <span className="ml-auto text-xs font-normal text-muted-foreground">
                (una por línea)
              </span>
            </span>
            <textarea
              rows={4}
              className="rounded-lg border border-input bg-transparent px-3 py-2 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:border-primary focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary"
              value={constraintsText}
              onChange={(e) => setConstraintsText(e.target.value)}
              placeholder="Ej: Presupuesto limitado&#10;Debe funcionar offline"
            />
          </label>
          <label className="group flex flex-col gap-2">
            <span className="flex items-center gap-2 text-sm font-medium text-foreground transition-colors group-focus-within:text-primary">
              <Scale className="size-4" aria-hidden="true" />
              Reglas de negocio{' '}
              <span className="ml-auto text-xs font-normal text-muted-foreground">
                (una por línea)
              </span>
            </span>
            <textarea
              rows={4}
              className="rounded-lg border border-input bg-transparent px-3 py-2 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:border-primary focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary"
              value={businessRulesText}
              onChange={(e) => setBusinessRulesText(e.target.value)}
              placeholder="Ej: Usuarios inactivos por 30 días se suspenden"
            />
          </label>
          <label className="group flex flex-col gap-2">
            <span className="flex items-center gap-2 text-sm font-medium text-foreground transition-colors group-focus-within:text-primary">
              Dentro del alcance{' '}
              <span className="ml-auto text-xs font-normal text-muted-foreground">
                (uno por línea)
              </span>
            </span>
            <textarea
              rows={4}
              className="rounded-lg border border-input bg-transparent px-3 py-2 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:border-primary focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary"
              value={inScopeText}
              onChange={(e) => setInScopeText(e.target.value)}
              placeholder="Ej: Ventas por sucursal&#10;Inventario y alertas"
            />
          </label>
          <label className="group flex flex-col gap-2">
            <span className="flex items-center gap-2 text-sm font-medium text-foreground transition-colors group-focus-within:text-primary">
              Fuera del alcance{' '}
              <span className="ml-auto text-xs font-normal text-muted-foreground">
                (uno por línea)
              </span>
            </span>
            <textarea
              rows={4}
              className="rounded-lg border border-input bg-transparent px-3 py-2 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:border-primary focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary"
              value={outOfScopeText}
              onChange={(e) => setOutOfScopeText(e.target.value)}
              placeholder="Ej: Facturación electrónica&#10;Pasarela de pago"
            />
          </label>
        </div>

        <label className="group flex flex-col gap-2">
          <span className="flex items-center gap-2 text-sm font-medium text-foreground transition-colors group-focus-within:text-primary">
            Contexto adicional{' '}
            <span className="ml-auto text-xs font-normal text-muted-foreground">(opcional)</span>
          </span>
          <textarea
            rows={3}
            className="rounded-lg border border-input bg-transparent px-3 py-2 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:border-primary focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary"
            value={additionalContext}
            onChange={(e) => setAdditionalContext(e.target.value)}
            placeholder="Cualquier otra información relevante..."
          />
        </label>
      </div>

      <fieldset className="rounded-lg border border-border bg-muted/20 p-4 transition-colors hover:border-border/80">
        <legend className="flex items-center gap-2 px-2 text-sm font-semibold text-foreground">
          <FileText className="size-4" aria-hidden="true" />
          Fuentes que respaldan este contexto
        </legend>
        {approvedSources.length === 0 ? (
          <div className="flex items-center gap-2 px-2 py-2 text-sm text-muted-foreground">
            <ShieldAlert className="size-4" aria-hidden="true" />
            <p>
              Aún no hay fuentes aprobadas. Puede agregar y aprobar fuentes en la sección "Fuentes".
            </p>
          </div>
        ) : (
          <ul className="mt-2 grid gap-2 sm:grid-cols-2">
            {approvedSources.map((s) => (
              <li key={s.id} className="relative">
                <label
                  htmlFor={`src-${s.id}`}
                  className={`flex cursor-pointer items-start gap-3 rounded-md border p-3 text-sm transition-all hover:bg-accent ${
                    sourceVersionIds.includes(s.version.id)
                      ? 'border-primary bg-primary/5 shadow-sm'
                      : 'border-border bg-card'
                  }`}
                >
                  <div className="flex h-5 items-center">
                    <input
                      type="checkbox"
                      id={`src-${s.id}`}
                      aria-label={`${s.code} — ${s.source.title} (versión ${s.version.versionNumber})`}
                      className="size-4 rounded border-primary text-primary focus:ring-primary"
                      checked={sourceVersionIds.includes(s.version.id)}
                      onChange={() => toggleSource(s.version.id)}
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    <span className="leading-none font-medium text-foreground">
                      {s.source.title}
                    </span>
                    <span className="font-mono text-xs text-muted-foreground">
                      {s.code} • v{s.version.versionNumber}
                    </span>
                  </div>
                </label>
              </li>
            ))}
          </ul>
        )}
      </fieldset>

      <div className="mt-2 flex items-center justify-end border-t border-border pt-4">
        <Button
          variant="default"
          size="default"
          type="submit"
          disabled={submitting}
          className="min-w-[150px] shadow-sm transition-all active:scale-[0.98]"
        >
          {submitting ? (
            <span className="flex items-center gap-2">
              <span className="size-4 animate-spin rounded-full border-2 border-primary-foreground border-t-transparent" />
              Guardando...
            </span>
          ) : hasExisting ? (
            'Guardar nueva versión'
          ) : (
            'Crear Contexto'
          )}
        </Button>
      </div>
    </form>
  );
}

function ContextContent({ projectId }: { projectId: string }) {
  const queryClient = useQueryClient();
  const context = useQuery({
    queryKey: ['context', projectId],
    queryFn: () => api.context.getCurrent(projectId),
    retry: false,
  });
  // Closes the same loop Traceability does: if Home or Trazabilidad sent the
  // user here to fix staleness, this page must say so too, not stay silent.
  const staleness = useQuery({
    queryKey: ['staleness', projectId],
    queryFn: () => api.staleness.get(projectId),
  });
  const contextStaleness = staleness.data?.entries.find(
    (e) => e.artifactType === 'PROJECT_CONTEXT' && e.impactState !== 'CURRENT',
  );
  const [showForm, setShowForm] = useState(false);
  const [approving, setApproving] = useState(false);
  // Remounts the form so it reads a draft the generation just wrote.
  const [formRevision, setFormRevision] = useState(0);

  const generation = useQuery({
    queryKey: ['context-generation', projectId],
    queryFn: () => api.context.latestGeneration(projectId),
    refetchInterval: (query) => (isRunning(query.state.data?.job) ? 2000 : false),
  });
  const job = generation.data?.job ?? null;
  const running = isRunning(job);
  // A job seen running here is announced when it ends, even after a reload.
  const [followedJobId, setFollowedJobId] = useState<string | null>(null);
  useEffect(() => {
    if (running && job) setFollowedJobId(job.id);
  }, [running, job]);
  useEffect(() => {
    if (!job || running || generation.isFetching) return;
    if (job.status === 'COMPLETED' && job.candidate) {
      // Never brings back a proposal older than the context already saved.
      const newerThanContext =
        !context.data || new Date(job.updatedAt) > new Date(context.data.version.createdAt);
      if (wasApplied(projectId, job.candidate.id) || !newerThanContext) return;
      markApplied(projectId, job.candidate.id);
      writeDraft(projectId, draftFromCandidate(job.candidate));
      announceCandidate(job.candidate);
      setFormRevision((revision) => revision + 1);
      setShowForm(true);
    } else if (job.status === 'FAILED' && followedJobId === job.id) {
      setFollowedJobId(null);
      toast.error(
        job.errorMessage ??
          'No se pudo generar el contexto con IA en este momento. Puede completarlo manualmente.',
      );
    }
  }, [job, running, generation.isFetching, followedJobId, projectId, context.data]);

  async function startGeneration() {
    try {
      const started = await api.context.startGeneration(projectId);
      setFollowedJobId(started.id);
      queryClient.setQueryData(['context-generation', projectId], { job: started });
    } catch (err) {
      toast.error(
        err instanceof ApiError
          ? err.message
          : 'No se pudo generar el contexto con IA en este momento. Puede completarlo manualmente.',
      );
    }
  }

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: ['context', projectId] });
    queryClient.invalidateQueries({ queryKey: ['readiness', projectId] });
    // Otherwise the staleness banner can keep showing a verdict from before
    // this very save, since it was never told the context just changed.
    queryClient.invalidateQueries({ queryKey: ['staleness', projectId] });
    setShowForm(false);
  }

  async function transition(status: 'IN_REVIEW' | 'APPROVED' | 'CHANGES_REQUESTED') {
    if (!context.data) return;
    try {
      await api.context.transition(projectId, context.data.version.id, status);
      invalidate();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'No se pudo cambiar el estado.');
    }
  }

  async function approveDirectly() {
    if (!context.data) return;
    setApproving(true);
    try {
      await api.context.transition(projectId, context.data.version.id, 'IN_REVIEW');
      await api.context.transition(projectId, context.data.version.id, 'APPROVED');
      invalidate();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'No se pudo aprobar el contexto.');
    } finally {
      setApproving(false);
    }
  }

  const notFound = context.error instanceof ApiError && context.error.status === 404;

  return (
    <div className="flex flex-col gap-6">
      <PageHeading title="Contexto del proyecto" projectId={projectId} />

      {contextStaleness ? (
        <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <div>
            <p className="font-medium">
              Esta versión del contexto no incluye el conocimiento aprobado más reciente.
            </p>
            <ul className="mt-1 flex flex-col gap-0.5">
              {contextStaleness.reasons.map((reason, i) => (
                <li key={i}>{reason.message}</li>
              ))}
            </ul>
            <p className="mt-2">
              Cree una nueva versión para incluirlo — el formulario parte de lo ya aprobado y de las
              versiones más recientes de sus fuentes, no desde cero.{' '}
              <button type="button" onClick={() => setShowForm(true)} className="underline">
                Crear nueva versión ahora
              </button>
              , o revise la{' '}
              <Link href="/traceability" className="underline">
                trazabilidad completa
              </Link>
              .
            </p>
          </div>
        </div>
      ) : null}

      {context.isLoading ? (
        <p className="text-sm text-muted-foreground">Cargando…</p>
      ) : notFound ? (
        <p className="text-sm text-muted-foreground">
          Aún no ha definido el contexto del proyecto. Complete el formulario o genérelo con IA a
          partir de las fuentes aprobadas.
        </p>
      ) : context.error ? (
        <QueryState isLoading={false} error={context.error}>
          {null}
        </QueryState>
      ) : context.data ? (
        <div className="rounded-lg border border-border bg-card p-6 shadow-sm">
          <div className="mb-4 flex flex-wrap items-center gap-2 border-b border-border pb-4">
            <span className="font-mono text-xs text-muted-foreground">{context.data.code}</span>
            <StatusBadge status={context.data.version.status} />
            <span className="text-xs text-muted-foreground">
              v{context.data.version.versionNumber}
            </span>
          </div>

          <div className="flex flex-col gap-5 text-sm leading-relaxed text-foreground/90">
            <section className="border-l-4 border-primary/30 pl-4">
              <h3 className="mb-1 flex items-center gap-1.5 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                <FileText className="size-3.5" aria-hidden="true" />
                Planteamiento del problema
              </h3>
              <p className="text-base whitespace-pre-line text-foreground">
                {context.data.problemStatement}
              </p>
            </section>
            <section className="rounded-lg border border-primary/20 bg-primary/5 p-4">
              <h3 className="mb-1 flex items-center gap-1.5 text-xs font-semibold tracking-wide text-primary uppercase">
                <Target className="size-3.5" aria-hidden="true" />
                Objetivo
              </h3>
              <p className="font-medium whitespace-pre-line">{context.data.objective}</p>
            </section>
            {context.data.additionalContext ? (
              <section>
                <h3 className="mb-1 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                  Contexto adicional
                </h3>
                <p className="whitespace-pre-line">{context.data.additionalContext}</p>
              </section>
            ) : null}

            {context.data.actors.length ? (
              <section>
                <h3 className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                  <Users className="size-3.5" aria-hidden="true" />
                  Actores
                </h3>
                <ul className="flex flex-wrap gap-1.5">
                  {context.data.actors.map((a) => (
                    <li
                      key={a.id}
                      className="rounded-full border border-border bg-muted/40 px-2.5 py-1 text-xs font-medium"
                    >
                      {a.name}
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}

            <div className="grid gap-4 sm:grid-cols-2">
              {context.data.needs.length ? (
                <section className="rounded-lg border border-emerald-200 bg-emerald-50/40 p-3 dark:border-emerald-900/50 dark:bg-emerald-950/20">
                  <h3 className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold tracking-wide text-emerald-800 uppercase dark:text-emerald-400">
                    <CheckCircle2 className="size-3.5" aria-hidden="true" />
                    Necesidades
                  </h3>
                  <ul className="flex flex-col gap-1.5">
                    {context.data.needs.map((n) => (
                      <li key={n.id} className="flex items-start gap-2">
                        <ContextCode code={contextItemCode('NEED', n.position)} kind="NEED" />
                        <span className="text-foreground">{n.description}</span>
                      </li>
                    ))}
                  </ul>
                </section>
              ) : null}
              {context.data.constraints.length ? (
                <section className="rounded-lg border border-amber-200 bg-amber-50/40 p-3 dark:border-amber-900/50 dark:bg-amber-950/20">
                  <h3 className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold tracking-wide text-amber-800 uppercase dark:text-amber-400">
                    <ShieldAlert className="size-3.5" aria-hidden="true" />
                    Restricciones
                  </h3>
                  <ul className="flex flex-col gap-1.5">
                    {context.data.constraints.map((c) => (
                      <li key={c.id} className="flex items-start gap-2">
                        <ContextCode
                          code={contextItemCode('CONSTRAINT', c.position)}
                          kind="CONSTRAINT"
                        />
                        <span className="text-foreground">{c.description}</span>
                      </li>
                    ))}
                  </ul>
                </section>
              ) : null}
              {context.data.businessRules.length ? (
                <section className="rounded-lg border border-border bg-muted/20 p-3">
                  <h3 className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                    <Scale className="size-3.5" aria-hidden="true" />
                    Reglas de negocio
                  </h3>
                  <ul className="flex flex-col gap-1.5">
                    {context.data.businessRules.map((b) => (
                      <li key={b.id} className="flex items-start gap-2">
                        <ContextCode
                          code={contextItemCode('BUSINESS_RULE', b.position)}
                          kind="BUSINESS_RULE"
                        />
                        <span className="text-foreground">{b.description}</span>
                      </li>
                    ))}
                  </ul>
                </section>
              ) : null}
              {context.data.scopeItems.length ? (
                <section className="rounded-lg border border-border bg-muted/20 p-3">
                  <h3 className="mb-1.5 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                    Alcance
                  </h3>
                  <ul className="flex flex-col gap-1.5">
                    {context.data.scopeItems.map((s) => (
                      <li key={s.id} className="flex items-start gap-1.5">
                        <span
                          className={`mt-0.5 shrink-0 rounded-full border px-1.5 py-0 text-[10px] font-medium ${
                            s.type === 'IN_SCOPE'
                              ? 'border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-400'
                              : 'border-input text-muted-foreground'
                          }`}
                        >
                          {s.type === 'IN_SCOPE' ? 'Incluye' : 'Excluye'}
                        </span>
                        <span>{s.description}</span>
                      </li>
                    ))}
                  </ul>
                </section>
              ) : null}
            </div>

            <section>
              <h3 className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                <FileText className="size-3.5" aria-hidden="true" />
                Fuentes vinculadas
              </h3>
              {context.data.sources.length ? (
                <ul className="flex flex-wrap gap-1.5">
                  {context.data.sources.map((s) => (
                    <li
                      key={s.id}
                      className="rounded-full border border-border bg-muted/40 px-2.5 py-1 text-xs"
                    >
                      <span className="font-mono text-[11px] text-muted-foreground">{s.code}</span>{' '}
                      {s.title}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-muted-foreground">Ninguna</p>
              )}
            </section>
          </div>

          <div className="mt-5 flex flex-wrap gap-2 border-t border-border pt-4">
            {context.data.version.status === 'DRAFT' ||
            context.data.version.status === 'GENERATED' ? (
              // "Enviar a revisión" stays hidden until multi-user review ships
              // (see sources/page.tsx); approveDirectly still drives IN_REVIEW.
              <Button
                variant="default"
                size="sm"
                type="button"
                onClick={approveDirectly}
                disabled={approving}
                className="bg-emerald-600 hover:bg-emerald-700 text-white"
              >
                {approving ? 'Aprobando…' : 'Aprobar'}
              </Button>
            ) : null}
            {context.data.version.status === 'IN_REVIEW' ? (
              <>
                <Button
                  variant="ghost"
                  size="sm"
                  type="button"
                  onClick={() => transition('APPROVED')}
                  className="rounded-md bg-emerald-600 px-3 py-1 text-sm text-white hover:bg-emerald-700"
                >
                  Aprobar
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  type="button"
                  onClick={() => transition('CHANGES_REQUESTED')}
                  className="rounded-md border border-destructive/40 px-3 py-1 text-sm text-destructive hover:bg-destructive/5"
                >
                  Solicitar cambios
                </Button>
              </>
            ) : null}
            <Button
              variant="ghost"
              size="sm"
              type="button"
              onClick={() => setShowForm((v) => !v)}
              className="text-sm text-muted-foreground underline"
            >
              {showForm ? 'Cancelar' : 'Crear nueva versión'}
            </Button>
          </div>
        </div>
      ) : null}

      {running && job ? (
        <GenerationProgress
          title="Generando la propuesta del contexto"
          startedAt={job.createdAt}
          outputChars={job.outputChars}
          expectedOutputTokens={job.expectedOutputTokens}
          expectedDurationMs={job.expectedDurationMs}
        />
      ) : null}

      {showForm || (!context.data && notFound) ? (
        <ContextForm
          key={formRevision}
          projectId={projectId}
          onSaved={invalidate}
          hasExisting={Boolean(context.data)}
          initial={context.data ?? undefined}
          generating={running}
          onGenerate={startGeneration}
        />
      ) : null}
    </div>
  );
}

export default function ContextPage() {
  return (
    <RequireActiveProject>
      {(projectId) => <ContextContent projectId={projectId} />}
    </RequireActiveProject>
  );
}
