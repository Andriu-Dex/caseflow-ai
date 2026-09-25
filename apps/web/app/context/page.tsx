'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { api, ApiError } from '../../lib/api';
import { QueryState, RequireActiveProject } from '../../components/query-state';
import { StatusBadge } from '../../components/status-badge';

const linesToItems = (text: string) =>
  text
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .map((description) => ({ description }));

function ContextForm({
  projectId,
  onSaved,
  hasExisting,
}: {
  projectId: string;
  onSaved: () => void;
  hasExisting: boolean;
}) {
  const sources = useQuery({
    queryKey: ['sources', projectId],
    queryFn: () => api.sources.list(projectId),
  });
  const approvedSources = (sources.data?.items ?? []).filter(
    (s) => s.version.status === 'APPROVED',
  );

  const [problemStatement, setProblemStatement] = useState('');
  const [objective, setObjective] = useState('');
  const [additionalContext, setAdditionalContext] = useState('');
  const [actorsText, setActorsText] = useState('');
  const [needsText, setNeedsText] = useState('');
  const [constraintsText, setConstraintsText] = useState('');
  const [businessRulesText, setBusinessRulesText] = useState('');
  const [sourceVersionIds, setSourceVersionIds] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function toggleSource(versionId: string) {
    setSourceVersionIds((prev) =>
      prev.includes(versionId) ? prev.filter((id) => id !== versionId) : [...prev, versionId],
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
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
      onSaved();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo guardar el contexto.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="flex flex-col gap-3 rounded-lg border border-border bg-card p-4"
    >
      <h2 className="text-sm font-semibold text-foreground">
        {hasExisting ? 'Nueva versión del Contexto' : 'Definir Contexto del Proyecto'}
      </h2>
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
          <p className="text-sm text-muted-foreground">No hay fuentes APPROVED todavía.</p>
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
                  {s.code} — {s.source.title} (v{s.version.versionNumber}, APPROVED)
                </label>
              </li>
            ))}
          </ul>
        )}
      </fieldset>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      <button
        type="submit"
        disabled={submitting}
        className="self-start rounded-md bg-primary px-3 py-1.5 text-sm text-white disabled:opacity-50"
      >
        {submitting ? 'Guardando…' : hasExisting ? 'Guardar nueva versión' : 'Crear Contexto'}
      </button>
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
  const [actionError, setActionError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: ['context', projectId] });
    setShowForm(false);
  }

  async function transition(status: 'IN_REVIEW' | 'APPROVED' | 'CHANGES_REQUESTED') {
    if (!context.data) return;
    setActionError(null);
    try {
      await api.context.transition(projectId, context.data.version.id, status);
      invalidate();
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : 'No se pudo cambiar el estado.');
    }
  }

  const notFound = context.error instanceof ApiError && context.error.status === 404;

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-xl font-semibold text-foreground">Contexto del proyecto</h1>

      {context.isLoading ? (
        <p className="text-sm text-muted-foreground">Cargando…</p>
      ) : notFound ? (
        <p className="text-sm text-muted-foreground">
          Todavía no hay un Contexto definido para este proyecto.
        </p>
      ) : context.error ? (
        <QueryState isLoading={false} error={context.error}>
          {null}
        </QueryState>
      ) : context.data ? (
        <div className="rounded-lg border border-border bg-card p-4">
          <div className="mb-2 flex items-center gap-2">
            <span className="font-mono text-xs text-muted-foreground">{context.data.code}</span>
            <StatusBadge status={context.data.version.status} />
            <span className="text-xs text-muted-foreground">
              v{context.data.version.versionNumber}
            </span>
          </div>
          <dl className="flex flex-col gap-2 text-sm text-foreground/80">
            <div>
              <dt className="font-medium">Planteamiento del problema</dt>
              <dd>{context.data.problemStatement}</dd>
            </div>
            <div>
              <dt className="font-medium">Objetivo</dt>
              <dd>{context.data.objective}</dd>
            </div>
            {context.data.actors.length ? (
              <div>
                <dt className="font-medium">Actores</dt>
                <dd>{context.data.actors.map((a) => a.name).join(', ')}</dd>
              </div>
            ) : null}
            <div>
              <dt className="font-medium">Fuentes vinculadas</dt>
              <dd>
                {context.data.sources.length
                  ? context.data.sources.map((s) => `${s.code} (${s.title})`).join(', ')
                  : 'Ninguna'}
              </dd>
            </div>
          </dl>
          <div className="mt-3 flex flex-wrap gap-2 border-t border-border pt-2">
            {context.data.version.status === 'DRAFT' ||
            context.data.version.status === 'GENERATED' ? (
              <button
                type="button"
                onClick={() => transition('IN_REVIEW')}
                className="rounded-md border border-input px-3 py-1 text-sm hover:bg-muted/40"
              >
                Enviar a revisión
              </button>
            ) : null}
            {context.data.version.status === 'IN_REVIEW' ? (
              <>
                <button
                  type="button"
                  onClick={() => transition('APPROVED')}
                  className="rounded-md bg-emerald-600 px-3 py-1 text-sm text-white hover:bg-emerald-700"
                >
                  Aprobar
                </button>
                <button
                  type="button"
                  onClick={() => transition('CHANGES_REQUESTED')}
                  className="rounded-md border border-destructive/40 px-3 py-1 text-sm text-destructive hover:bg-destructive/5"
                >
                  Solicitar cambios
                </button>
              </>
            ) : null}
            <button
              type="button"
              onClick={() => setShowForm((v) => !v)}
              className="text-sm text-muted-foreground underline"
            >
              {showForm ? 'Cancelar' : 'Crear nueva versión'}
            </button>
          </div>
          {actionError ? <p className="mt-2 text-sm text-destructive">{actionError}</p> : null}
        </div>
      ) : null}

      {showForm || (!context.data && notFound) ? (
        <ContextForm
          projectId={projectId}
          onSaved={invalidate}
          hasExisting={Boolean(context.data)}
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
