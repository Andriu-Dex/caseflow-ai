'use client';

import { useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import type { TraceabilityNode } from '@caseflow-ai/contracts';
import { api } from '../../lib/api';
import { QueryState, RequireActiveProject } from '../../components/query-state';
import { StatusBadge } from '../../components/status-badge';

function NodeLabel({ node }: { node: TraceabilityNode }) {
  return (
    <span>
      <span className="font-mono text-xs text-gray-500">{node.code}</span>{' '}
      <span className="font-medium text-gray-900">{node.title}</span>{' '}
      <StatusBadge status={node.status} />
    </span>
  );
}

function TraceabilityContent({ projectId }: { projectId: string }) {
  const graph = useQuery({
    queryKey: ['traceability', projectId],
    queryFn: () => api.traceability.get(projectId),
  });
  const [selectedId, setSelectedId] = useState<string | null>(null);

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

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-xl font-semibold text-gray-900">Trazabilidad</h1>

      <QueryState isLoading={graph.isLoading} error={graph.error}>
        {graph.data ? (
          <>
            {graph.data.truncated ? (
              <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                El grafo fue acotado por tamaño ({graph.data.nodes.length} nodos). No se muestra la
                totalidad del proyecto.
              </div>
            ) : null}

            <div className="grid gap-4 md:grid-cols-[1fr_2fr]">
              <section className="rounded-lg border border-gray-200 bg-white p-3">
                <h2 className="mb-2 text-sm font-semibold text-gray-900">
                  Artefactos ({graph.data.nodes.length})
                </h2>
                <ul className="max-h-[28rem] overflow-auto text-sm">
                  {graph.data.nodes.map((n) => (
                    <li key={n.id}>
                      <button
                        type="button"
                        onClick={() => setSelectedId(n.id)}
                        className={`block w-full rounded px-2 py-1 text-left ${
                          selectedId === n.id ? 'bg-gray-900 text-white' : 'hover:bg-gray-100'
                        }`}
                      >
                        {n.code} — {n.title}
                      </button>
                    </li>
                  ))}
                </ul>
              </section>

              <section className="rounded-lg border border-gray-200 bg-white p-4">
                {!selected ? (
                  <p className="text-sm text-gray-500">
                    Seleccione un artefacto para ver su linaje.
                  </p>
                ) : (
                  <div className="flex flex-col gap-4 text-sm">
                    <div>
                      <h3 className="mb-1 text-xs font-semibold uppercase text-gray-400">
                        Aguas arriba
                      </h3>
                      {upstream.length === 0 ? (
                        <p className="text-gray-500">
                          Sin conocimiento/artefacto de origen registrado.
                        </p>
                      ) : (
                        <ul className="flex flex-col gap-1">
                          {upstream.map(({ edge, node }) => (
                            <li key={`${edge.type}-${node.id}`}>
                              <NodeLabel node={node} />
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                    <div className="rounded-md border border-gray-900 bg-gray-50 p-2">
                      <h3 className="mb-1 text-xs font-semibold uppercase text-gray-400">Actual</h3>
                      <NodeLabel node={selected} />
                      {selected.generation ? (
                        <p className="mt-1 text-xs text-gray-500">
                          IA: {selected.generation.provider ?? '—'} /{' '}
                          {selected.generation.model ?? '—'}
                          {selected.generation.promptKey
                            ? ` · ${selected.generation.promptKey} v${selected.generation.promptVersion}`
                            : ''}
                        </p>
                      ) : selected.generator ? (
                        <p className="mt-1 text-xs text-gray-500">
                          Generador determinístico v{selected.generator.generatorVersion}
                        </p>
                      ) : null}
                    </div>
                    <div>
                      <h3 className="mb-1 text-xs font-semibold uppercase text-gray-400">
                        Aguas abajo
                      </h3>
                      {downstream.length === 0 ? (
                        <p className="text-gray-500">
                          Ningún artefacto conocido depende de este todavía.
                        </p>
                      ) : (
                        <ul className="flex flex-col gap-1">
                          {downstream.map(({ edge, node }) => (
                            <li key={`${edge.type}-${node.id}`}>
                              <NodeLabel node={node} />
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  </div>
                )}
              </section>
            </div>
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
