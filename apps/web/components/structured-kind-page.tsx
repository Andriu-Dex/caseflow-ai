'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { StructuredAnalysisKind } from '@caseflow-ai/contracts';
import { useState } from 'react';
import { api, ApiError, type GenerationResult } from '../lib/api';
import { QueryState } from './query-state';
import { StatusBadge } from './status-badge';
import { CandidateReview } from './candidate-review';
import {
  NavigationManualForm,
  SoftwareArchitectureManualForm,
  SystemArchitectureManualForm,
  UiBlueprintManualForm,
} from './structured-manual-forms';
import { TrustedDiagram } from './trusted-svg';

const MANUAL_FORMS: Record<
  StructuredAnalysisKind,
  (props: { projectId: string; onCreated: () => void; onCancel: () => void }) => React.JSX.Element
> = {
  NAVIGATION_TREE: NavigationManualForm,
  SOFTWARE_ARCHITECTURE: SoftwareArchitectureManualForm,
  SYSTEM_ARCHITECTURE: SystemArchitectureManualForm,
  UI_BLUEPRINT: UiBlueprintManualForm,
};

// Shared list/generate/accept/lifecycle/diagram page for the four
// StructuredAnalysis kinds (spec Phase I: Navigation, Software Architecture,
// System Architecture, UI Blueprint pages) — one implementation instead of
// four near-identical copies, since all four share the same backend shape.
export function StructuredKindPage({
  kind,
  title,
  projectId,
}: {
  kind: StructuredAnalysisKind;
  title: string;
  projectId: string;
}) {
  const queryClient = useQueryClient();
  const list = useQuery({
    queryKey: ['structured-analysis', kind, projectId],
    queryFn: () => api.structuredAnalysis.list(projectId, kind),
  });
  const [generation, setGeneration] = useState<GenerationResult | null>(null);
  const [sourceIdsText, setSourceIdsText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [diagrams, setDiagrams] = useState<Record<string, string>>({});
  const [showManualForm, setShowManualForm] = useState(false);
  const ManualForm = MANUAL_FORMS[kind];

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: ['structured-analysis', kind, projectId] });
  }

  async function generate() {
    setError(null);
    const ids = sourceIdsText
      .split(/[\s,]+/)
      .map((s) => s.trim())
      .filter(Boolean);
    if (!ids.length) {
      setError('Indique al menos una versión fuente elegible.');
      return;
    }
    try {
      const result = await api.structuredAnalysis.generate(projectId, kind, ids);
      setGeneration(result);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo generar (¿IA deshabilitada?).');
    }
  }

  async function transition(
    id: string,
    versionId: string,
    status: 'IN_REVIEW' | 'APPROVED' | 'CHANGES_REQUESTED',
  ) {
    try {
      await api.structuredAnalysis.transition(projectId, kind, id, versionId, status);
      invalidate();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo cambiar el estado.');
    }
  }

  async function loadDiagram(id: string) {
    try {
      const diagram = await api.structuredAnalysis.getDiagram(projectId, kind, id);
      setDiagrams((prev) => ({ ...prev, [id]: diagram.svg }));
    } catch {
      setError('No hay diagrama disponible para este artefacto.');
    }
  }

  const items = list.data?.items ?? [];

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-xl font-semibold text-gray-900">{title}</h1>

      <section className="rounded-lg border border-gray-200 bg-white p-4">
        <h2 className="mb-2 text-sm font-semibold text-gray-900">Generar con IA</h2>
        <p className="mb-2 text-xs text-gray-500">
          Use la sección de Trazabilidad para identificar las versiones APPROVED elegibles como
          fuente.
        </p>
        <textarea
          className="w-full rounded-md border border-gray-300 px-2 py-1 text-sm"
          rows={2}
          placeholder="IDs de versión fuente APPROVED, separados por coma o espacio"
          value={sourceIdsText}
          onChange={(e) => setSourceIdsText(e.target.value)}
        />
        <div className="mt-2 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={generate}
            className="rounded-md border border-gray-300 px-3 py-1.5 text-sm hover:bg-gray-50"
          >
            Generar
          </button>
          <button
            type="button"
            onClick={() => setShowManualForm((v) => !v)}
            className="rounded-md border border-gray-300 px-3 py-1.5 text-sm hover:bg-gray-50"
          >
            Crear manualmente
          </button>
        </div>
        <p className="mt-2 text-xs text-gray-500">
          La generación con IA requiere un proveedor configurado. Si no está disponible, use
          &quot;Crear manualmente&quot;.
        </p>
      </section>

      {showManualForm ? (
        <ManualForm
          projectId={projectId}
          onCreated={() => {
            invalidate();
            setShowManualForm(false);
          }}
          onCancel={() => setShowManualForm(false)}
        />
      ) : null}

      {error ? <p className="text-sm text-red-600">{error}</p> : null}

      {generation ? (
        <CandidateReview
          generation={generation}
          describe={(c) => String(c.name ?? c.title ?? c.candidateId)}
          onAccept={async (ids) => {
            await api.structuredAnalysis.accept(projectId, kind, generation.id, ids);
            invalidate();
          }}
          onDismiss={() => setGeneration(null)}
        />
      ) : null}

      <QueryState isLoading={list.isLoading} error={list.error}>
        {items.length === 0 ? (
          <p className="text-sm text-gray-500">No hay artefactos de este tipo todavía.</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {items.map((item) => (
              <li key={item.id} className="rounded-lg border border-gray-200 bg-white p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="text-sm">
                    <span className="font-mono text-xs text-gray-500">{item.code}</span>{' '}
                    <span className="font-medium text-gray-900">{item.title}</span>
                  </div>
                  <StatusBadge status={item.version.status} />
                </div>
                <div className="mt-2 flex flex-wrap gap-2">
                  {item.version.status === 'DRAFT' || item.version.status === 'GENERATED' ? (
                    <button
                      type="button"
                      onClick={() => transition(item.id, item.version.id, 'IN_REVIEW')}
                      className="rounded-md border border-gray-300 px-3 py-1 text-sm hover:bg-gray-50"
                    >
                      Enviar a revisión
                    </button>
                  ) : null}
                  {item.version.status === 'IN_REVIEW' ? (
                    <>
                      <button
                        type="button"
                        onClick={() => transition(item.id, item.version.id, 'APPROVED')}
                        className="rounded-md bg-emerald-600 px-3 py-1 text-sm text-white hover:bg-emerald-700"
                      >
                        Aprobar
                      </button>
                      <button
                        type="button"
                        onClick={() => transition(item.id, item.version.id, 'CHANGES_REQUESTED')}
                        className="rounded-md border border-red-300 px-3 py-1 text-sm text-red-700 hover:bg-red-50"
                      >
                        Solicitar cambios
                      </button>
                    </>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => loadDiagram(item.id)}
                    className="text-sm text-gray-600 underline"
                  >
                    Ver diagrama
                  </button>
                </div>
                {(() => {
                  const svg = diagrams[item.id];
                  return svg ? <TrustedDiagram svg={svg} /> : null;
                })()}
              </li>
            ))}
          </ul>
        )}
      </QueryState>
    </div>
  );
}
