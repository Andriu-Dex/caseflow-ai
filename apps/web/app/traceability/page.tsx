'use client';

import { useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { TRACEABILITY_ARTIFACT_TYPES, type TraceabilityNode } from '@caseflow-ai/contracts';
import { api } from '../../lib/api';
import { QueryState, RequireActiveProject } from '../../components/query-state';
import { PageHeading } from '../../components/page-heading';
import { StatusBadge } from '../../components/status-badge';
import { DiagramViewer } from '../../components/diagram-viewer';
import { Button } from '@caseflow-ai/ui';

const ARTIFACT_TYPE_LABELS: Record<TraceabilityNode['artifactType'], string> = {
  PROJECT_SOURCE: 'Fuentes',
  PROJECT_CONTEXT: 'Contexto del proyecto',
  REQUIREMENT: 'Requisitos',
  USE_CASE: 'Casos de uso',
  DATA_MODEL: 'Modelo de datos',
  USE_CASE_DIAGRAM: 'Diagrama de casos de uso',
  NAVIGATION_TREE: 'Navegación',
  SOFTWARE_ARCHITECTURE: 'Arquitectura de software',
  SYSTEM_ARCHITECTURE: 'Arquitectura de sistema',
  UI_BLUEPRINT: 'Plano de interfaz',
  MOCKUP: 'Bocetos',
};

// Accent-insensitive, case-insensitive substring match — mirrors the same
// normalization the backend uses for safe file names, applied here purely
// for search comparison.
function normalizeForSearch(value: string): string {
  return value.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

function groupNodesByType(nodes: TraceabilityNode[]) {
  const byType = new Map<string, TraceabilityNode[]>();
  for (const node of nodes)
    byType.set(node.artifactType, [...(byType.get(node.artifactType) ?? []), node]);
  return TRACEABILITY_ARTIFACT_TYPES.map((type) => ({
    type,
    label: ARTIFACT_TYPE_LABELS[type],
    nodes: byType.get(type) ?? [],
  })).filter((group) => group.nodes.length > 0);
}

function NodeLabel({ node }: { node: TraceabilityNode }) {
  return (
    <span>
      <span className="font-mono text-xs text-muted-foreground">{node.code}</span>{' '}
      <span className="font-medium text-foreground">{node.title}</span>{' '}
      <StatusBadge status={node.status} />
    </span>
  );
}

// Every related-node entry doubles as a shortcut to select it, so following
// a chain of provenance never requires scrolling back to find it in the list.
function RelatedNodeButton({ node, onSelect }: { node: TraceabilityNode; onSelect: () => void }) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className="rounded px-1 py-0.5 text-left hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <NodeLabel node={node} />
    </button>
  );
}

function TraceabilityContent({ projectId }: { projectId: string }) {
  const graph = useQuery({
    queryKey: ['traceability', projectId],
    queryFn: () => api.traceability.get(projectId),
  });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [view, setView] = useState<'list' | 'diagram'>('list');

  const diagram = useQuery({
    queryKey: ['traceability-diagram', projectId],
    queryFn: () => api.traceability.getDiagram(projectId),
    enabled: view === 'diagram',
  });

  const selected = graph.data?.nodes.find((n) => n.id === selectedId) ?? null;

  const { upstream, downstream } = useMemo(() => {
    if (!graph.data || !selectedId) return { upstream: [], downstream: [] };
    const nodesById = new Map(graph.data.nodes.map((n) => [n.id, n]));
    const up = graph.data.edges
      .filter((e) => e.toId === selectedId)
      .map((e) => ({ edge: e, node: nodesById.get(e.fromId) }))
      .filter((x): x is { edge: typeof x.edge; node: TraceabilityNode } => Boolean(x.node));
    const down = graph.data.edges
      .filter((e) => e.fromId === selectedId)
      .map((e) => ({ edge: e, node: nodesById.get(e.toId) }))
      .filter((x): x is { edge: typeof x.edge; node: TraceabilityNode } => Boolean(x.node));
    return { upstream: up, downstream: down };
  }, [graph.data, selectedId]);

  const filteredGroups = useMemo(() => {
    const nodes = graph.data?.nodes ?? [];
    const query = normalizeForSearch(search.trim());
    const matching = query
      ? nodes.filter(
          (n) =>
            normalizeForSearch(n.code).includes(query) ||
            normalizeForSearch(n.title).includes(query),
        )
      : nodes;
    return groupNodesByType(matching);
  }, [graph.data, search]);

  return (
    <div className="flex flex-col gap-6">
      <PageHeading title="Trazabilidad" projectId={projectId} />

      <QueryState isLoading={graph.isLoading} error={graph.error}>
        {graph.data ? (
          <>
            {graph.data.truncated ? (
              <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                El grafo fue acotado por tamaño ({graph.data.nodes.length} nodos). No se muestra la
                totalidad del proyecto.
              </div>
            ) : null}

            <div className="flex gap-1 rounded-md border border-border bg-muted/30 p-1 text-sm">
              <button
                type="button"
                onClick={() => setView('list')}
                className={`rounded px-3 py-1 ${view === 'list' ? 'bg-card font-medium shadow-sm' : 'text-muted-foreground'}`}
              >
                Lista
              </button>
              <button
                type="button"
                onClick={() => setView('diagram')}
                className={`rounded px-3 py-1 ${view === 'diagram' ? 'bg-card font-medium shadow-sm' : 'text-muted-foreground'}`}
              >
                Grafo
              </button>
            </div>

            {view === 'diagram' ? (
              <QueryState isLoading={diagram.isLoading} error={diagram.error}>
                {diagram.data ? (
                  <DiagramViewer
                    svg={diagram.data.svg}
                    source={diagram.data.source}
                    sourceFormat={diagram.data.sourceFormat}
                    code="trazabilidad"
                    pngUrl={api.traceability.diagramPngUrl(projectId)}
                    caption="Vista general de la trazabilidad del proyecto."
                  />
                ) : null}
              </QueryState>
            ) : (
              <div className="grid gap-4 md:grid-cols-[1fr_2fr]">
                <section className="rounded-lg border border-border bg-card p-3">
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <h2 className="text-sm font-semibold text-foreground">
                      Artefactos ({graph.data.nodes.length})
                    </h2>
                  </div>
                  <input
                    type="search"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Buscar por código o título…"
                    aria-label="Buscar artefacto"
                    className="mb-2 w-full rounded-md border border-input bg-background px-2 py-1 text-sm"
                  />
                  <div className="max-h-[28rem] overflow-auto text-sm">
                    {filteredGroups.length === 0 ? (
                      <p className="px-2 py-1 text-muted-foreground">Ningún artefacto coincide.</p>
                    ) : (
                      filteredGroups.map((group) => (
                        <div key={group.type} className="mb-2">
                          <h3 className="px-2 py-1 text-xs font-semibold uppercase text-muted-foreground">
                            {group.label} ({group.nodes.length})
                          </h3>
                          <ul>
                            {group.nodes.map((n) => (
                              <li key={n.id}>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  type="button"
                                  onClick={() => setSelectedId(n.id)}
                                  className={`block w-full rounded px-2 py-1 text-left ${
                                    selectedId === n.id
                                      ? 'bg-primary text-primary-foreground'
                                      : 'hover:bg-muted'
                                  }`}
                                >
                                  {n.code} — {n.title}
                                </Button>
                              </li>
                            ))}
                          </ul>
                        </div>
                      ))
                    )}
                  </div>
                </section>

                <section className="rounded-lg border border-border bg-card p-4">
                  {!selected ? (
                    <p className="text-sm text-muted-foreground">
                      Seleccione un artefacto para ver su linaje.
                    </p>
                  ) : (
                    <div className="flex flex-col gap-4 text-sm">
                      <div>
                        <h3 className="mb-1 text-xs font-semibold uppercase text-muted-foreground">
                          Aguas arriba
                        </h3>
                        {upstream.length === 0 ? (
                          <p className="text-muted-foreground">
                            Sin conocimiento/artefacto de origen registrado.
                          </p>
                        ) : (
                          <ul className="flex flex-col gap-1">
                            {upstream.map(({ edge, node }) => (
                              <li key={`${edge.type}-${node.id}`}>
                                <RelatedNodeButton
                                  node={node}
                                  onSelect={() => setSelectedId(node.id)}
                                />
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                      <div className="rounded-md border border-gray-900 bg-muted/40 p-2">
                        <h3 className="mb-1 text-xs font-semibold uppercase text-muted-foreground">
                          Actual
                        </h3>
                        <NodeLabel node={selected} />
                        {selected.generation ? (
                          <p className="mt-1 text-xs text-muted-foreground">
                            IA: {selected.generation.provider ?? '—'} /{' '}
                            {selected.generation.model ?? '—'}
                            {selected.generation.promptKey
                              ? ` · ${selected.generation.promptKey} v${selected.generation.promptVersion}`
                              : ''}
                          </p>
                        ) : selected.generator ? (
                          <p className="mt-1 text-xs text-muted-foreground">
                            Generador determinístico v{selected.generator.generatorVersion}
                          </p>
                        ) : null}
                      </div>
                      <div>
                        <h3 className="mb-1 text-xs font-semibold uppercase text-muted-foreground">
                          Aguas abajo
                        </h3>
                        {downstream.length === 0 ? (
                          <p className="text-muted-foreground">
                            Ningún artefacto conocido depende de este todavía.
                          </p>
                        ) : (
                          <ul className="flex flex-col gap-1">
                            {downstream.map(({ edge, node }) => (
                              <li key={`${edge.type}-${node.id}`}>
                                <RelatedNodeButton
                                  node={node}
                                  onSelect={() => setSelectedId(node.id)}
                                />
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    </div>
                  )}
                </section>
              </div>
            )}
          </>
        ) : null}
      </QueryState>
    </div>
  );
}

export default function TraceabilityPage() {
  return (
    <RequireActiveProject>
      {(projectId) => <TraceabilityContent projectId={projectId} />}
    </RequireActiveProject>
  );
}
