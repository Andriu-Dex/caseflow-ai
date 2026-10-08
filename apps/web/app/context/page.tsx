'use client';

import { GenerationOverlay } from '../../components/generation-overlay';
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
import type { ProjectContextResponse } from '@caseflow-ai/contracts';
import { api, ApiError } from '../../lib/api';
import { QueryState, RequireActiveProject } from '../../components/query-state';
import { PageHeading } from '../../components/page-heading';
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

// Per-tab unsent-draft convenience (not backend state): recovers an
// in-progress Context form after the browser discards/reloads a
// backgrounded tab. Never a substitute for actually saving the form.
interface ContextDraft {
  problemStatement: string;
  objective: string;
  additionalContext: string;
  actorsText: string;
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
}: {
  projectId: string;
  onSaved: () => void;
  hasExisting: boolean;
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
    () => draft?.actorsText ?? initial?.actors.map((a) => a.name).join('\n') ?? '',
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
  const [generating, setGenerating] = useState(false);

  useEffect(() => {
    writeDraft(projectId, {
      problemStatement,
      objective,
      additionalContext,
      actorsText,
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

  async function handleGenerate() {
    setGenerating(true);
    try {
      const candidate = await api.context.generate(projectId);
      setProblemStatement(candidate.content.problemStatement);
      setObjective(candidate.content.objective);
      setAdditionalContext(candidate.content.additionalContext ?? '');
      setActorsText(candidate.content.actors.join('\n'));
      setNeedsText(candidate.content.needs.join('\n'));
      setConstraintsText(candidate.content.constraints.join('\n'));
      setBusinessRulesText(candidate.content.businessRules.join('\n'));
      setSourceVersionIds(candidate.sourceVersionIds);
      setSourcesPrefilled(true);
      const reports = candidate.reportSourceVersionIds.length;
      if (reports)
        toast.info(
          reports === 1
            ? 'La propuesta también se apoyó en el reporte aprobado de una fuente.'
            : `La propuesta también se apoyó en los reportes aprobados de ${reports} fuentes.`,
        );
    } catch (err) {
      toast.error(
        err instanceof ApiError
          ? err.message
          : 'No se pudo generar el contexto con IA en este momento. Puede completarlo manualmente.',
      );
    } finally {
      setGenerating(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    const input = {
      problemStatement,
      objective,
      additionalContext: additionalContext || undefined,
      actors: linesToItems(actorsText).map((i) => ({ name: i.description })),
      needs: linesToItems(needsText),
      constraints: linesToItems(constraintsText),
      businessRules: linesToItems(businessRulesText),
      scopeItems: [],
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
      className="flex flex-col gap-3 rounded-lg border border-border bg-card p-4"
    >
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-foreground">
          {hasExisting ? 'Nueva versión del Contexto' : 'Definir Contexto del Proyecto'}
        </h2>
        <Button
          variant="outline"
          size="sm"
          type="button"
          onClick={handleGenerate}
          disabled={generating || approvedSources.length === 0}
          title={
            approvedSources.length === 0
              ? 'Primero apruebe al menos una fuente del proyecto.'
              : 'Completa los campos a partir de las fuentes aprobadas. Revíselos y edítelos antes de guardar.'
          }
        >
          <Sparkles className="size-4" aria-hidden="true" />
          {generating ? 'Generando…' : 'Generar con IA'}
        </Button>
        <GenerationOverlay open={generating} />
      </div>
      <label className="flex flex-col gap-1 text-sm">
        Planteamiento del problema
        <textarea
          required
          rows={2}
          className="rounded-md border border-input px-2 py-1"
          value={problemStatement}
          onChange={(e) => setProblemStatement(e.target.value)}
        />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        Objetivo
        <textarea
          required
          rows={2}
          className="rounded-md border border-input px-2 py-1"
          value={objective}
          onChange={(e) => setObjective(e.target.value)}
        />
      </label>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-sm">
          Actores (uno por línea)
          <textarea
            rows={3}
            className="rounded-md border border-input px-2 py-1"
            value={actorsText}
            onChange={(e) => setActorsText(e.target.value)}
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Necesidades (una por línea)
          <textarea
            rows={3}
            className="rounded-md border border-input px-2 py-1"
            value={needsText}
            onChange={(e) => setNeedsText(e.target.value)}
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Restricciones (una por línea)
          <textarea
            rows={3}
            className="rounded-md border border-input px-2 py-1"
            value={constraintsText}
            onChange={(e) => setConstraintsText(e.target.value)}
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Reglas de negocio (una por línea)
          <textarea
            rows={3}
            className="rounded-md border border-input px-2 py-1"
            value={businessRulesText}
            onChange={(e) => setBusinessRulesText(e.target.value)}
          />
        </label>
      </div>
      <label className="flex flex-col gap-1 text-sm">
        Contexto adicional (opcional)
        <textarea
          rows={2}
          className="rounded-md border border-input px-2 py-1"
          value={additionalContext}
          onChange={(e) => setAdditionalContext(e.target.value)}
        />
      </label>

      <fieldset className="rounded-md border border-border p-2">
        <legend className="px-1 text-sm font-medium text-foreground/80">
          Fuentes que respaldan este contexto
        </legend>
        {approvedSources.length === 0 ? (
          <p className="text-sm text-muted-foreground">Aún no hay fuentes aprobadas.</p>
        ) : (
          <ul className="flex flex-col gap-1">
            {approvedSources.map((s) => (
              <li key={s.id} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  id={`src-${s.id}`}
                  checked={sourceVersionIds.includes(s.version.id)}
                  onChange={() => toggleSource(s.version.id)}
                />
                <label htmlFor={`src-${s.id}`}>
                  {s.code} — {s.source.title} (versión {s.version.versionNumber})
                </label>
              </li>
            ))}
          </ul>
        )}
      </fieldset>

      <Button
        variant="default"
        size="sm"
        type="submit"
        disabled={submitting}
        className="self-start"
      >
        {submitting ? 'Guardando…' : hasExisting ? 'Guardar nueva versión' : 'Crear Contexto'}
      </Button>
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
                <section className="rounded-lg border border-emerald-200 bg-emerald-50/40 p-3">
                  <h3 className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold tracking-wide text-emerald-800 uppercase">
                    <CheckCircle2 className="size-3.5" aria-hidden="true" />
                    Necesidades
                  </h3>
                  <ul className="flex flex-col gap-1.5">
                    {context.data.needs.map((n) => (
                      <li key={n.id} className="flex items-start gap-1.5">
                        <CheckCircle2
                          className="mt-0.5 size-3.5 shrink-0 text-emerald-600"
                          aria-hidden="true"
                        />
                        <span>{n.description}</span>
                      </li>
                    ))}
                  </ul>
                </section>
              ) : null}
              {context.data.constraints.length ? (
                <section className="rounded-lg border border-amber-200 bg-amber-50/40 p-3">
                  <h3 className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold tracking-wide text-amber-800 uppercase">
                    <ShieldAlert className="size-3.5" aria-hidden="true" />
                    Restricciones
                  </h3>
                  <ul className="flex flex-col gap-1.5">
                    {context.data.constraints.map((c) => (
                      <li key={c.id} className="flex items-start gap-1.5">
                        <ShieldAlert
                          className="mt-0.5 size-3.5 shrink-0 text-amber-600"
                          aria-hidden="true"
                        />
                        <span>{c.description}</span>
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
                      <li key={b.id} className="flex items-start gap-1.5">
                        <Scale
                          className="mt-0.5 size-3.5 shrink-0 text-muted-foreground"
                          aria-hidden="true"
                        />
                        <span>{b.description}</span>
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
                              ? 'border-emerald-300 bg-emerald-50 text-emerald-700'
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

      {showForm || (!context.data && notFound) ? (
        <ContextForm
          projectId={projectId}
          onSaved={invalidate}
          hasExisting={Boolean(context.data)}
          initial={context.data ?? undefined}
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
