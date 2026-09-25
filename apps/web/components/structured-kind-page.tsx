'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { StructuredAnalysisKind } from '@caseflow-ai/contracts';
import { AlertCircle, Eye, Sparkles, Wand2 } from 'lucide-react';
import { useState } from 'react';
import { Button, Card, CardContent, CardHeader, CardTitle, Textarea } from '@caseflow-ai/ui';
import { api, ApiError, type GenerationResult } from '../lib/api';
import { QueryState } from './query-state';
import { PageHeading } from './page-heading';
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
  const [generating, setGenerating] = useState(false);
  const ManualForm = MANUAL_FORMS[kind];

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: ['structured-analysis', kind, projectId] });
    queryClient.invalidateQueries({ queryKey: ['readiness', projectId] });
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
    setGenerating(true);
    try {
      const result = await api.structuredAnalysis.generate(projectId, kind, ids);
      setGeneration(result);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo generar (¿IA deshabilitada?).');
    } finally {
      setGenerating(false);
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
      <PageHeading title={title} projectId={projectId} />

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-sm">
            <Sparkles className="size-4 text-primary" aria-hidden="true" />
            Generar con IA
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="mb-2 text-xs text-muted-foreground">
            Use la sección de Trazabilidad para identificar las versiones APPROVED elegibles como
            fuente.
          </p>
          <Textarea
            rows={2}
            placeholder="IDs de versión fuente APPROVED, separados por coma o espacio"
            value={sourceIdsText}
            onChange={(e) => setSourceIdsText(e.target.value)}
          />
          <div className="mt-2 flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={generating}
              onClick={generate}
            >
              <Wand2 className="size-4" aria-hidden="true" />
              {generating ? 'Generando…' : 'Generar'}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setShowManualForm((v) => !v)}
            >
              Crear manualmente
            </Button>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            La generación con IA requiere un proveedor configurado. Si no está disponible, use
            &quot;Crear manualmente&quot;.
          </p>
        </CardContent>
      </Card>

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

      {error ? (
        <div className="flex items-center gap-2 text-sm text-destructive">
          <AlertCircle className="size-4 shrink-0" aria-hidden="true" />
          {error}
        </div>
      ) : null}

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
          <p className="text-sm text-muted-foreground">No hay artefactos de este tipo todavía.</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {items.map((item) => (
              <li key={item.id}>
                <Card>
                  <CardContent>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="text-sm">
                        <span className="font-mono text-xs text-muted-foreground">{item.code}</span>{' '}
                        <span className="font-medium text-foreground">{item.title}</span>
                      </div>
                      <StatusBadge status={item.version.status} />
                    </div>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {item.version.status === 'DRAFT' || item.version.status === 'GENERATED' ? (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => transition(item.id, item.version.id, 'IN_REVIEW')}
                        >
                          Enviar a revisión
                        </Button>
                      ) : null}
                      {item.version.status === 'IN_REVIEW' ? (
                        <>
                          <Button
                            type="button"
                            size="sm"
                            className="bg-emerald-600 text-white hover:bg-emerald-700"
                            onClick={() => transition(item.id, item.version.id, 'APPROVED')}
                          >
                            Aprobar
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="border-destructive/40 text-destructive hover:bg-destructive/5"
                            onClick={() =>
                              transition(item.id, item.version.id, 'CHANGES_REQUESTED')
                            }
                          >
                            Solicitar cambios
                          </Button>
                        </>
                      ) : null}
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => loadDiagram(item.id)}
                      >
                        <Eye className="size-4" aria-hidden="true" />
                        Ver diagrama
                      </Button>
                    </div>
                    {(() => {
                      const svg = diagrams[item.id];
                      return svg ? (
                        <TrustedDiagram
                          svg={svg}
                          caption={`Diagrama de ${title.toLowerCase()} — ${item.code}`}
                        />
                      ) : null;
                    })()}
                  </CardContent>
                </Card>
              </li>
            ))}
          </ul>
        )}
      </QueryState>
    </div>
  );
}
