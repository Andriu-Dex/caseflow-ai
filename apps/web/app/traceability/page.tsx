'use client';

import { useQuery, useMutation } from '@tanstack/react-query';
import { useMemo, useState, useEffect, type ComponentType, type ReactNode } from 'react';
import Link from 'next/link';
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  CheckCircle2,
  ChevronDown,
  Compass,
  Database,
  FileText,
  GitBranch,
  Image as ImageIcon,
  Layers,
  ListChecks,
  ListTodo,
  Network,
  Rocket,
  Search,
  Server,
  Shapes,
  Sparkles,
  Workflow,
} from 'lucide-react';
import {
  TRACEABILITY_ARTIFACT_TYPES,
  type StalenessEntry,
  type TraceabilityNode,
} from '@caseflow-ai/contracts';
import { api } from '../../lib/api';
import { QueryState, RequireActiveProject } from '../../components/query-state';
import { PageHeading } from '../../components/page-heading';
import { StatusBadge } from '../../components/status-badge';
import { DiagramViewer } from '../../components/diagram-viewer';
import { EmptyState } from '../../components/artifact-actions';
import { Badge, Button, Tabs, TabsContent, TabsList, TabsTrigger } from '@caseflow-ai/ui';

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
  GENERATION_PLAN: 'Plan de generación',
  CONCEPTUAL_DOMAIN_MODEL: 'Modelo conceptual',
  IMPLEMENTATION_PLAN: 'Plan de implementación',
};

// One icon per artifact type, so the list reads at a glance instead of only
// by its uppercase group label — the same visual-scanning shortcut the
// sidebar nav already uses for its own sections.
const ARTIFACT_TYPE_ICONS: Record<
  TraceabilityNode['artifactType'],
  ComponentType<{ className?: string }>
> = {
  PROJECT_SOURCE: FileText,
  PROJECT_CONTEXT: ListChecks,
  REQUIREMENT: ListChecks,
  USE_CASE: Workflow,
  DATA_MODEL: Database,
  USE_CASE_DIAGRAM: GitBranch,
  NAVIGATION_TREE: Compass,
  SOFTWARE_ARCHITECTURE: Layers,
  SYSTEM_ARCHITECTURE: Server,
  UI_BLUEPRINT: ImageIcon,
  MOCKUP: ImageIcon,
  GENERATION_PLAN: Rocket,
  CONCEPTUAL_DOMAIN_MODEL: Shapes,
  IMPLEMENTATION_PLAN: ListTodo,
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
    icon: ARTIFACT_TYPE_ICONS[type],
    nodes: byType.get(type) ?? [],
  })).filter((group) => group.nodes.length > 0);
}

// Every version of every artifact is a separate node in the graph, so two
// rows sharing a code (e.g. two SRC-001) are not a duplicate — they are two
// versions. The version number must always be visible here, or they are
// visually indistinguishable.
function NodeLabel({ node, stale }: { node: TraceabilityNode; stale?: StalenessEntry }) {
  const isStale = stale && stale.impactState !== 'CURRENT';
  return (
    <span className="inline-flex flex-wrap items-center gap-1.5">
      <span className="font-mono text-xs text-muted-foreground">
        {node.code} v{node.versionNumber}
      </span>
      <span className="font-medium text-foreground">{node.title}</span>
      {!node.isCurrent ? (
        <span className="rounded border border-input px-1.5 py-0.5 text-[10px] text-muted-foreground">
          Versión anterior
        </span>
      ) : null}
      <StatusBadge status={node.status} />
      {isStale ? (
        <span
          title="Podría estar desactualizado: hay conocimiento aprobado más reciente que esta versión no incluye."
          className="inline-flex items-center gap-1 rounded-full border border-amber-300 bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-800"
        >
          <AlertTriangle className="size-3.5" aria-hidden="true" />
          Posiblemente desactualizado
        </span>
      ) : null}
    </span>
  );
}

// Human-readable next step for a staleness reason, grouped by what actually
// fixes it — every reason in practice traces back to the Project Context.
function stalenessActionLabel(entry: StalenessEntry): string {
  return entry.artifactType === 'PROJECT_CONTEXT'
    ? 'Actualice y vuelva a aprobar el Contexto del Proyecto para incluir este conocimiento.'
    : 'Esto se resolverá al actualizar y aprobar de nuevo el Contexto del Proyecto; luego revise este artefacto.';
}

// Every related-node entry doubles as a shortcut to select it, so following
// a chain of provenance never requires scrolling back to find it in the list.
function RelatedNodeButton({
  node,
  stale,
  onSelect,
}: {
  node: TraceabilityNode;
  stale?: StalenessEntry;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className="w-full rounded-md px-2 py-1 text-left hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <NodeLabel node={node} stale={stale} />
    </button>
  );
}

// A short vertical rule between lineage sections, standing in for the arrow
// a real flow diagram would draw from "aguas arriba" through "actual" to
// "aguas abajo" — cheap to render, no extra dependency, still unmistakably a
// chain rather than three unrelated boxes.
function LineageConnector() {
  return (
    <div className="flex justify-center py-0.5" aria-hidden="true">
      <ChevronDown className="size-4 text-border" />
    </div>
  );
}

function SectionLabel({
  icon: Icon,
  children,
}: {
  icon: ComponentType<{ className?: string }>;
  children: ReactNode;
}) {
  return (
    <h3 className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
      <Icon className="size-3.5" aria-hidden="true" />
      {children}
    </h3>
  );
}

function TraceabilityContent({ projectId }: { projectId: string }) {
  const graph = useQuery({
    queryKey: ['traceability', projectId],
    queryFn: () => api.traceability.get(projectId),
  });
  // Same staleness data Home already warns about ("lo verá señalado en cada
  // paso") — this page is where that promise is kept: which exact version is
  // affected, why, and what to do about it.
  const staleness = useQuery({
    queryKey: ['staleness', projectId],
    queryFn: () => api.staleness.get(projectId),
  });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [view, setView] = useState<'list' | 'diagram'>('list');

  const stalenessByVersionId = useMemo(() => {
    const map = new Map<string, StalenessEntry>();
    for (const entry of staleness.data?.entries ?? []) map.set(entry.artifactVersionId, entry);
    return map;
  }, [staleness.data]);
  const affectedCount = [...stalenessByVersionId.values()].filter(
    (e) => e.impactState !== 'CURRENT',
  ).length;

  const diagram = useQuery({
    queryKey: ['traceability-diagram', projectId],
    queryFn: () => api.traceability.getDiagram(projectId),
    enabled: view === 'diagram',
  });

  const analyzeImpactMutation = useMutation({
    mutationFn: (versionId: string) => api.impactAnalysis.analyze(projectId, versionId),
  });
  // `useMutation()` returns a new object every render, so depending on the
  // whole mutation object here reran this effect (and reset the mutation)
  // after every render — including the one `mutate()` itself triggers,
  // which wiped the pending/result state before it could ever be shown. Its
  // `reset` function is bound once and stays referentially stable, so that
  // is the only thing this effect needs to depend on.
  const resetImpactAnalysis = analyzeImpactMutation.reset;
  useEffect(() => {
    resetImpactAnalysis();
  }, [selectedId, resetImpactAnalysis]);

  const selected = graph.data?.nodes.find((n) => n.id === selectedId) ?? null;
  const selectedStaleness = selected ? stalenessByVersionId.get(selected.id) : undefined;

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
              <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                <span>
                  El grafo fue acotado por tamaño ({graph.data.nodes.length} nodos). No se muestra
                  la totalidad del proyecto.
                </span>
              </div>
            ) : null}

            {!staleness.isLoading && !staleness.error ? (
              affectedCount > 0 ? (
                <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                  <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                  <span>
                    {affectedCount === 1
                      ? 'Hay 1 versión que podría estar desactualizada.'
                      : `Hay ${affectedCount} versiones que podrían estar desactualizadas.`}{' '}
                    Están señaladas en la lista de artefactos; selecciónelas para ver por qué y qué
                    hacer.
                  </span>
                </div>
              ) : (
                <div className="flex items-start gap-2 rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
                  <CheckCircle2 className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                  <span>Sin incidencias de trazabilidad pendientes: todo está al día.</span>
                </div>
              )
            ) : null}

            <Tabs value={view} onValueChange={(v) => setView(v as 'list' | 'diagram')}>
              <TabsList>
                <TabsTrigger value="list">
                  <ListTodo className="size-4" aria-hidden="true" />
                  Lista
                </TabsTrigger>
                <TabsTrigger value="diagram">
                  <Network className="size-4" aria-hidden="true" />
                  Grafo
                </TabsTrigger>
              </TabsList>

              <TabsContent value="diagram">
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
              </TabsContent>

              <TabsContent value="list">
                <div className="grid items-start gap-4 md:grid-cols-[1fr_2fr]">
                  <section className="flex flex-col rounded-lg border border-border bg-card p-3 shadow-sm">
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <h2 className="text-sm font-semibold text-foreground">Artefactos</h2>
                      <Badge variant="secondary">{graph.data.nodes.length}</Badge>
                    </div>
                    <div className="relative mb-2">
                      <Search
                        className="pointer-events-none absolute top-1/2 left-2 size-3.5 -translate-y-1/2 text-muted-foreground"
                        aria-hidden="true"
                      />
                      <input
                        type="search"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder="Buscar por código o título…"
                        aria-label="Buscar artefacto"
                        className="w-full rounded-md border border-input bg-background py-1 pr-2 pl-7 text-sm"
                      />
                    </div>
                    <div className="max-h-[32rem] overflow-auto">
                      {filteredGroups.length === 0 ? (
                        <EmptyState title="Ningún artefacto coincide">
                          Pruebe con otro código o título.
                        </EmptyState>
                      ) : (
                        <div className="flex flex-col gap-3 text-sm">
                          {filteredGroups.map((group) => {
                            const GroupIcon = group.icon;
                            return (
                              <div key={group.type}>
                                <h3 className="mb-1 flex items-center gap-1.5 px-1 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                                  <GroupIcon className="size-3.5" aria-hidden="true" />
                                  {group.label}
                                  <Badge
                                    variant="outline"
                                    className="ml-auto px-1.5 py-0 text-[10px]"
                                  >
                                    {group.nodes.length}
                                  </Badge>
                                </h3>
                                <ul className="flex flex-col gap-0.5">
                                  {group.nodes.map((n) => {
                                    const nodeStaleness = stalenessByVersionId.get(n.id);
                                    const isStale = Boolean(
                                      nodeStaleness && nodeStaleness.impactState !== 'CURRENT',
                                    );
                                    const active = selectedId === n.id;
                                    return (
                                      <li key={n.id}>
                                        <button
                                          type="button"
                                          onClick={() => setSelectedId(n.id)}
                                          title={
                                            isStale
                                              ? 'Podría estar desactualizado: seleccione para ver por qué.'
                                              : undefined
                                          }
                                          className={`flex w-full items-start gap-2 rounded-md border-l-2 px-2 py-1.5 text-left transition-colors ${
                                            active
                                              ? 'border-l-primary bg-primary text-primary-foreground'
                                              : isStale
                                                ? 'border-l-amber-400 bg-amber-50/60 hover:bg-amber-50'
                                                : 'border-l-transparent hover:bg-muted'
                                          }`}
                                        >
                                          <div className="min-w-0 flex-1">
                                            <div className="flex items-center gap-1.5">
                                              <span
                                                className={`font-mono text-[11px] ${active ? 'text-primary-foreground/80' : 'text-muted-foreground'}`}
                                              >
                                                {n.code} v{n.versionNumber}
                                              </span>
                                              {!n.isCurrent ? (
                                                <span
                                                  className={`rounded px-1 py-px text-[10px] ${active ? 'bg-white/15' : 'border border-input text-muted-foreground'}`}
                                                >
                                                  anterior
                                                </span>
                                              ) : null}
                                            </div>
                                            <p className="truncate font-medium">{n.title}</p>
                                          </div>
                                          {isStale ? (
                                            <AlertTriangle
                                              className={`mt-0.5 size-3.5 shrink-0 ${active ? '' : 'text-amber-600'}`}
                                              aria-hidden="true"
                                            />
                                          ) : null}
                                        </button>
                                      </li>
                                    );
                                  })}
                                </ul>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </section>

                  <section className="rounded-lg border border-border bg-card p-4 shadow-sm">
                    {!selected ? (
                      <EmptyState title="Seleccione un artefacto para ver su linaje">
                        Elija cualquier elemento de la lista para ver de dónde proviene, qué depende
                        de él y si hay algo que requiera su atención.
                      </EmptyState>
                    ) : (
                      <div className="flex flex-col text-sm">
                        <div>
                          <SectionLabel icon={ArrowUp}>Aguas arriba</SectionLabel>
                          {upstream.length === 0 ? (
                            <p className="pl-1 text-muted-foreground">
                              Sin conocimiento/artefacto de origen registrado.
                            </p>
                          ) : (
                            <ul className="flex flex-col gap-0.5 rounded-md border border-dashed border-border bg-muted/20 p-1">
                              {upstream.map(({ edge, node }) => (
                                <li key={`${edge.type}-${node.id}`}>
                                  <RelatedNodeButton
                                    node={node}
                                    stale={stalenessByVersionId.get(node.id)}
                                    onSelect={() => setSelectedId(node.id)}
                                  />
                                </li>
                              ))}
                            </ul>
                          )}
                        </div>

                        <LineageConnector />

                        <div
                          className={`rounded-lg border-2 p-3 ${
                            selectedStaleness && selectedStaleness.impactState !== 'CURRENT'
                              ? 'border-amber-300 bg-amber-50/50'
                              : 'border-primary/40 bg-primary/5'
                          }`}
                        >
                          <h3 className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold tracking-wide text-primary uppercase">
                            <Sparkles className="size-3.5" aria-hidden="true" />
                            Actual
                          </h3>
                          <NodeLabel node={selected} stale={selectedStaleness} />
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

                          {selectedStaleness && selectedStaleness.impactState !== 'CURRENT' ? (
                            <div className="mt-3 border-t border-amber-200 pt-2">
                              <h4 className="mb-1 flex items-center gap-1.5 text-xs font-semibold text-amber-800 uppercase">
                                <AlertTriangle className="size-3.5" aria-hidden="true" />
                                Por qué podría estar desactualizado
                              </h4>
                              <ul className="flex flex-col gap-1 text-sm text-amber-900">
                                {selectedStaleness.reasons.map((reason, i) => {
                                  const sourceNode = graph.data?.nodes.find(
                                    (n) => n.id === reason.sourceVersionId,
                                  );
                                  return (
                                    <li key={i}>
                                      {sourceNode ? (
                                        <button
                                          type="button"
                                          onClick={() => setSelectedId(sourceNode.id)}
                                          className="rounded text-left underline decoration-dotted hover:bg-amber-100"
                                        >
                                          {reason.message}
                                        </button>
                                      ) : (
                                        reason.message
                                      )}
                                    </li>
                                  );
                                })}
                              </ul>
                              <p className="mt-2 text-sm font-medium text-amber-900">
                                {stalenessActionLabel(selectedStaleness)}{' '}
                                <Link href="/context" className="underline">
                                  Ir al Contexto del Proyecto
                                </Link>
                              </p>
                            </div>
                          ) : null}
                        </div>

                        <LineageConnector />

                        <div>
                          <SectionLabel icon={ArrowDown}>Aguas abajo</SectionLabel>
                          {downstream.length === 0 ? (
                            <p className="pl-1 text-muted-foreground">
                              Ningún artefacto conocido depende de este todavía.
                            </p>
                          ) : (
                            <ul className="flex flex-col gap-0.5 rounded-md border border-dashed border-border bg-muted/20 p-1">
                              {downstream.map(({ edge, node }) => (
                                <li key={`${edge.type}-${node.id}`}>
                                  <RelatedNodeButton
                                    node={node}
                                    stale={stalenessByVersionId.get(node.id)}
                                    onSelect={() => setSelectedId(node.id)}
                                  />
                                </li>
                              ))}
                            </ul>
                          )}
                        </div>

                        <div className="mt-5 rounded-lg border border-border bg-muted/20 p-3">
                          <h3 className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-foreground">
                            <GitBranch
                              className="size-4 text-muted-foreground"
                              aria-hidden="true"
                            />
                            Análisis de impacto
                          </h3>
                          {!analyzeImpactMutation.data && !analyzeImpactMutation.isPending && (
                            <Button
                              type="button"
                              size="sm"
                              onClick={() => analyzeImpactMutation.mutate(selectedId!)}
                            >
                              Analizar impacto de este cambio
                            </Button>
                          )}
                          {analyzeImpactMutation.isPending && (
                            <p className="text-sm text-muted-foreground">Analizando...</p>
                          )}
                          {analyzeImpactMutation.isError && (
                            <p className="text-sm text-red-500">Error al analizar impacto.</p>
                          )}
                          {analyzeImpactMutation.data && (
                            <div className="flex flex-col gap-3">
                              <div>
                                <h4 className="text-xs font-semibold text-muted-foreground uppercase">
                                  Afectados Directamente (1 salto)
                                </h4>
                                {analyzeImpactMutation.data.directlyAffected.length === 0 ? (
                                  <p className="text-sm text-muted-foreground">Ninguno</p>
                                ) : (
                                  <ul className="mt-1 flex flex-col gap-1 text-sm">
                                    {analyzeImpactMutation.data.directlyAffected.map((id) => {
                                      const node = graph.data.nodes.find((n) => n.id === id);
                                      if (!node) return <li key={id}>{id}</li>;
                                      return (
                                        <li key={id}>
                                          <NodeLabel
                                            node={node}
                                            stale={stalenessByVersionId.get(id)}
                                          />
                                        </li>
                                      );
                                    })}
                                  </ul>
                                )}
                              </div>
                              <div>
                                <h4 className="text-xs font-semibold text-muted-foreground uppercase">
                                  Afectados Transitivamente (&gt;1 salto)
                                </h4>
                                {analyzeImpactMutation.data.transitivelyAffected.length === 0 ? (
                                  <p className="text-sm text-muted-foreground">Ninguno</p>
                                ) : (
                                  <ul className="mt-1 flex flex-col gap-1 text-sm">
                                    {analyzeImpactMutation.data.transitivelyAffected.map((id) => {
                                      const node = graph.data.nodes.find((n) => n.id === id);
                                      if (!node) return <li key={id}>{id}</li>;
                                      return (
                                        <li key={id}>
                                          <NodeLabel
                                            node={node}
                                            stale={stalenessByVersionId.get(id)}
                                          />
                                        </li>
                                      );
                                    })}
                                  </ul>
                                )}
                              </div>
                              <div>
                                <h4 className="text-xs font-semibold text-muted-foreground uppercase">
                                  Orden de Revisión Recomendado
                                </h4>
                                {analyzeImpactMutation.data.recommendedReviewOrder.length === 0 ? (
                                  <p className="text-sm text-muted-foreground">Ninguno</p>
                                ) : (
                                  <ol className="mt-1 flex list-decimal flex-col gap-1 pl-5 text-sm">
                                    {analyzeImpactMutation.data.recommendedReviewOrder.map((id) => {
                                      const node = graph.data.nodes.find((n) => n.id === id);
                                      if (!node) return <li key={id}>{id}</li>;
                                      return (
                                        <li key={id}>
                                          <NodeLabel
                                            node={node}
                                            stale={stalenessByVersionId.get(id)}
                                          />
                                        </li>
                                      );
                                    })}
                                  </ol>
                                )}
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </section>
                </div>
              </TabsContent>
            </Tabs>
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
