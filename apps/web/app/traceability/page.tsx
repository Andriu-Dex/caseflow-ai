'use client';

import { useQuery, useMutation } from '@tanstack/react-query';
import { toast } from 'sonner';
import { useMemo, useState, useEffect, type ComponentType, type ReactNode } from 'react';
import Link from 'next/link';
import {
  Activity,
  AlertTriangle,
  ArrowDown,
  ArrowRight,
  ArrowUp,
  Boxes,
  CheckCircle2,
  ChevronDown,
  ClipboardCheck,
  Compass,
  Database,
  ExternalLink,
  FileText,
  GitBranch,
  Hammer,
  Image as ImageIcon,
  Layers,
  ListChecks,
  ListTodo,
  Lock,
  Network,
  Palette,
  Rocket,
  Search,
  Server,
  Shapes,
  ShieldCheck,
  Sparkles,
  Workflow,
  X,
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
import { ApprovalOriginBadge } from '../../components/workflow-route';
import { DiagramViewer } from '../../components/diagram-viewer';
import { EmptyState } from '../../components/artifact-actions';
import { Confetti } from '../../components/confetti';
import { Badge, Button, Input, Tabs, TabsContent, TabsList, TabsTrigger } from '@caseflow-ai/ui';

const ARTIFACT_TYPE_LABELS: Record<TraceabilityNode['artifactType'], string> = {
  PROJECT_SOURCE: 'Fuentes',
  PROJECT_CONTEXT: 'Contexto del proyecto',
  REQUIREMENT: 'Requisitos',
  USE_CASE: 'Casos de uso',
  DATA_MODEL: 'Modelo de datos',
  USE_CASE_DIAGRAM: 'Diagrama de casos de uso',
  CLASS_DIAGRAM: 'Diagrama de clases',
  NAVIGATION_TREE: 'Navegación',
  SOFTWARE_ARCHITECTURE: 'Arquitectura de software',
  SYSTEM_ARCHITECTURE: 'Arquitectura de sistema',
  UI_BLUEPRINT: 'Plano de interfaz',
  MOCKUP: 'Bocetos',
  GENERATION_PLAN: 'Plan de generación',
  CONCEPTUAL_DOMAIN_MODEL: 'Modelo conceptual',
  IMPLEMENTATION_PLAN: 'Plan de implementación',
  DESIGN_THEME: 'Tema y colores',
};

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
  CLASS_DIAGRAM: Boxes,
  NAVIGATION_TREE: Compass,
  SOFTWARE_ARCHITECTURE: Layers,
  SYSTEM_ARCHITECTURE: Server,
  UI_BLUEPRINT: ImageIcon,
  MOCKUP: ImageIcon,
  GENERATION_PLAN: Rocket,
  CONCEPTUAL_DOMAIN_MODEL: Shapes,
  IMPLEMENTATION_PLAN: ListTodo,
  DESIGN_THEME: Palette,
};

const ARTIFACT_TYPE_ROUTES: Partial<Record<TraceabilityNode['artifactType'], string>> = {
  PROJECT_SOURCE: '/sources',
  PROJECT_CONTEXT: '/context',
  REQUIREMENT: '/requirements',
  USE_CASE: '/use-cases',
  DATA_MODEL: '/data-model',
  USE_CASE_DIAGRAM: '/use-cases',
  CLASS_DIAGRAM: '/class-diagram',
  NAVIGATION_TREE: '/design/navigation',
  SOFTWARE_ARCHITECTURE: '/design/software-architecture',
  SYSTEM_ARCHITECTURE: '/design/system-architecture',
  UI_BLUEPRINT: '/design/ui-blueprint',
  DESIGN_THEME: '/design/theme',
  MOCKUP: '/design/mockups',
  GENERATION_PLAN: '/construction/generation-plan',
  IMPLEMENTATION_PLAN: '/construction/implementation-plan',
};

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

function NodeLabel({ node, stale }: { node: TraceabilityNode; stale?: StalenessEntry }) {
  const isStale = stale && stale.impactState !== 'CURRENT';
  return (
    <span className="inline-flex flex-wrap items-center gap-1.5">
      <span className="font-mono text-xs font-semibold text-muted-foreground">
        {node.code} v{node.versionNumber}
      </span>
      <span className="font-medium text-foreground">{node.title}</span>
      {!node.isCurrent ? (
        <span className="rounded border border-border/70 px-1.5 py-0.5 text-[10px] text-muted-foreground">
          Versión anterior
        </span>
      ) : null}
      <StatusBadge status={node.status} />
      <ApprovalOriginBadge origin={node.approvalOrigin} />
      {isStale ? (
        <span
          title="Podría estar desactualizado: hay conocimiento aprobado más reciente que esta versión no incluye."
          className="inline-flex items-center gap-1 rounded-full border border-amber-300 bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-800 dark:border-amber-700/60 dark:bg-amber-950/40 dark:text-amber-300"
        >
          <AlertTriangle className="size-3.5" aria-hidden="true" />
          Posiblemente desactualizado
        </span>
      ) : null}
    </span>
  );
}

function stalenessActionLabel(entry: StalenessEntry): string {
  return entry.artifactType === 'PROJECT_CONTEXT'
    ? 'Actualice y vuelva a aprobar el Contexto del Proyecto para incluir este conocimiento.'
    : 'Esto se resolverá al actualizar y aprobar de nuevo el Contexto del Proyecto; luego revise este artefacto.';
}

function RelatedNodeButton({
  node,
  stale,
  onSelect,
}: {
  node: TraceabilityNode;
  stale?: StalenessEntry;
  onSelect: () => void;
}) {
  const isStale = stale && stale.impactState !== 'CURRENT';
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`group flex w-full items-center justify-between gap-2 rounded-lg border px-3 py-2 text-left transition-all duration-150 hover:-translate-y-0.5 hover:shadow-2xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
        isStale
          ? 'border-amber-300/80 bg-amber-50/50 hover:bg-amber-50 dark:border-amber-900/50 dark:bg-amber-950/20'
          : 'border-border/70 bg-card hover:border-primary/40 hover:bg-muted/40'
      }`}
    >
      <div className="min-w-0 flex-1">
        <NodeLabel node={node} stale={stale} />
      </div>
      <span className="hidden sm:inline-flex text-[11px] font-medium text-muted-foreground group-hover:text-primary transition-colors shrink-0">
        Ver linaje →
      </span>
    </button>
  );
}

function LineageConnector() {
  return (
    <div className="flex justify-center py-1" aria-hidden="true">
      <div className="flex items-center gap-1.5 rounded-full border border-border/80 bg-muted/40 px-2 py-0.5 shadow-2xs">
        <ChevronDown className="size-3.5 text-muted-foreground" />
      </div>
    </div>
  );
}

function SectionLabel({
  icon: Icon,
  children,
  count,
}: {
  icon: ComponentType<{ className?: string }>;
  children: ReactNode;
  count?: number;
}) {
  return (
    <div className="mb-2 flex items-center justify-between gap-2">
      <h3 className="flex items-center gap-1.5 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
        <Icon className="size-3.5" aria-hidden="true" />
        {children}
      </h3>
      {count !== undefined ? (
        <span className="rounded-md border border-border/60 bg-muted/40 px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
          {count} {count === 1 ? 'nodo' : 'nodos'}
        </span>
      ) : null}
    </div>
  );
}

function TraceabilityContent({ projectId }: { projectId: string }) {
  const graph = useQuery({
    queryKey: ['traceability', projectId],
    queryFn: () => api.traceability.get(projectId),
  });

  const staleness = useQuery({
    queryKey: ['staleness', projectId],
    queryFn: () => api.staleness.get(projectId),
  });

  const readiness = useQuery({
    queryKey: ['readiness', projectId],
    queryFn: () => api.readiness.get(projectId),
  });

  const isPlanningComplete = readiness.data?.ready === true;
  const [showConfetti, setShowConfetti] = useState(false);

  useEffect(() => {
    const key = `caseflow.celebrated-construction.${projectId}`;
    if (isPlanningComplete) {
      try {
        if (!sessionStorage.getItem(key)) {
          setShowConfetti(true);
          sessionStorage.setItem(key, 'true');
        }
      } catch {
        setShowConfetti(true);
      }
    } else {
      try {
        sessionStorage.removeItem(key);
      } catch {
        // Storage access might fail in restricted environments
      }
    }
  }, [isPlanningComplete, projectId]);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [view, setView] = useState<'list' | 'diagram'>('list');
  const [onlyStale, setOnlyStale] = useState(false);
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({});

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

  // The drawing holds at most 500 links; when there are more, say so once.
  const omittedLinks = diagram.data?.omittedLinks ?? 0;
  useEffect(() => {
    if (omittedLinks > 0)
      toast.warning(
        `El grafo muestra los vínculos principales: faltan ${omittedLinks} por el límite del dibujo. La lista los incluye todos.`,
      );
  }, [omittedLinks]);

  const analyzeImpactMutation = useMutation({
    mutationFn: (versionId: string) => api.impactAnalysis.analyze(projectId, versionId),
  });

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
    let matching = query
      ? nodes.filter(
          (n) =>
            normalizeForSearch(n.code).includes(query) ||
            normalizeForSearch(n.title).includes(query),
        )
      : nodes;

    if (onlyStale) {
      matching = matching.filter((n) => {
        const s = stalenessByVersionId.get(n.id);
        return Boolean(s && s.impactState !== 'CURRENT');
      });
    }
    return groupNodesByType(matching);
  }, [graph.data, search, onlyStale, stalenessByVersionId]);

  const totalMatchingNodes = filteredGroups.reduce((acc, g) => acc + g.nodes.length, 0);

  function toggleGroupCollapse(type: string) {
    setCollapsedGroups((prev) => ({ ...prev, [type]: !prev[type] }));
  }

  const selectedRoute = selected ? ARTIFACT_TYPE_ROUTES[selected.artifactType] : null;

  return (
    <div className="flex flex-col gap-6 relative">
      {showConfetti && <Confetti onComplete={() => setShowConfetti(false)} />}
      <div className="flex flex-col gap-1">
        <PageHeading title="Trazabilidad" projectId={projectId} />
        <p className="text-sm text-muted-foreground">
          Visualiza el linaje completo de artefactos del proyecto, dependencias cruzadas y calcula
          el impacto en cascada de cualquier cambio antes de aplicarlo.
        </p>
      </div>

      <QueryState isLoading={graph.isLoading} error={graph.error}>
        {graph.data ? (
          <>
            {/* KPI & Status Overview Bar */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="flex items-center gap-3 rounded-xl border border-border/80 bg-card p-3.5 shadow-2xs">
                <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary border border-primary/20">
                  <Boxes className="size-5" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground font-medium">Nodos en Grafo</p>
                  <p className="text-lg font-bold text-foreground">
                    {graph.data.nodes.length}{' '}
                    <span className="text-xs font-normal text-muted-foreground">artefactos</span>
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-3 rounded-xl border border-border/80 bg-card p-3.5 shadow-2xs">
                <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20">
                  <Network className="size-5" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground font-medium">Enlaces / Relaciones</p>
                  <p className="text-lg font-bold text-foreground">
                    {graph.data.edges.length}{' '}
                    <span className="text-xs font-normal text-muted-foreground">dependencias</span>
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-3 rounded-xl border border-border/80 bg-card p-3.5 shadow-2xs">
                <div
                  className={`flex size-10 shrink-0 items-center justify-center rounded-lg border ${
                    affectedCount > 0
                      ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30'
                      : 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30'
                  }`}
                >
                  {affectedCount > 0 ? (
                    <AlertTriangle className="size-5" />
                  ) : (
                    <CheckCircle2 className="size-5" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-xs text-muted-foreground font-medium">Salud de Coherencia</p>
                  <p className="text-sm font-semibold truncate text-foreground">
                    {affectedCount > 0
                      ? `${affectedCount} ${affectedCount === 1 ? 'desactualizado' : 'desactualizados'}`
                      : 'Todo al día'}
                  </p>
                </div>
                {affectedCount > 0 ? (
                  <Button
                    type="button"
                    variant={onlyStale ? 'default' : 'outline'}
                    size="sm"
                    className="h-7 text-xs px-2 shrink-0"
                    onClick={() => setOnlyStale((v) => !v)}
                  >
                    {onlyStale ? 'Ver todos' : 'Filtrar'}
                  </Button>
                ) : null}
              </div>
            </div>

            {graph.data.truncated ? (
              <div className="flex items-start gap-2 rounded-xl border border-amber-300/80 bg-amber-50/70 p-3.5 text-sm text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-200">
                <AlertTriangle
                  className="mt-0.5 size-4 shrink-0 text-amber-600"
                  aria-hidden="true"
                />
                <span>
                  El grafo fue acotado por tamaño ({graph.data.nodes.length} nodos). No se muestra
                  la totalidad del proyecto.
                </span>
              </div>
            ) : null}

            {!staleness.isLoading && !staleness.error ? (
              affectedCount > 0 ? (
                <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-200">
                  <AlertTriangle
                    className="mt-0.5 size-4 shrink-0 text-amber-600"
                    aria-hidden="true"
                  />
                  <span>
                    {affectedCount === 1
                      ? 'Hay 1 versión que podría estar desactualizada.'
                      : `Hay ${affectedCount} versiones que podrían estar desactualizadas.`}{' '}
                    Están señaladas en la lista de artefactos; selecciónelas para ver por qué y qué
                    hacer.
                  </span>
                </div>
              ) : (
                <div className="flex items-start gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-200">
                  <CheckCircle2
                    className="mt-0.5 size-4 shrink-0 text-emerald-600"
                    aria-hidden="true"
                  />
                  <span>Sin incidencias de trazabilidad pendientes: todo está al día.</span>
                </div>
              )
            ) : null}

            <Tabs value={view} onValueChange={(v) => setView(v as 'list' | 'diagram')}>
              <TabsList className="bg-muted/60 p-1">
                <TabsTrigger value="list" className="gap-2">
                  <ListTodo className="size-4" aria-hidden="true" />
                  Lista
                </TabsTrigger>
                <TabsTrigger value="diagram" className="gap-2">
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
                <div className="grid items-start gap-5 lg:grid-cols-[1fr_1.85fr]">
                  {/* Left Column: Artifacts Selection */}
                  <section className="flex flex-col rounded-xl border border-border/80 bg-card p-4 shadow-2xs">
                    <div className="mb-3 flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <h2 className="text-sm font-semibold text-foreground">Artefactos</h2>
                        <span className="text-xs text-muted-foreground">
                          ({totalMatchingNodes})
                        </span>
                      </div>
                      <Badge variant="secondary" className="font-mono text-xs">
                        {graph.data.nodes.length} totales
                      </Badge>
                    </div>

                    <div className="relative mb-3">
                      <Search
                        className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground"
                        aria-hidden="true"
                      />
                      <Input
                        type="search"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder="Buscar por código o título…"
                        aria-label="Buscar artefacto"
                        className="h-8.5 bg-background pr-7 pl-8 text-xs"
                      />
                      {search ? (
                        <button
                          type="button"
                          onClick={() => setSearch('')}
                          aria-label="Limpiar búsqueda"
                          className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                        >
                          <X className="size-3.5" />
                        </button>
                      ) : null}
                    </div>

                    {affectedCount > 0 ? (
                      <div className="mb-3 flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setOnlyStale((v) => !v)}
                          className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                            onlyStale
                              ? 'bg-amber-500/20 text-amber-900 border border-amber-500/40 dark:text-amber-200'
                              : 'border border-border/70 bg-muted/30 text-muted-foreground hover:text-foreground'
                          }`}
                        >
                          <AlertTriangle className="size-3 text-amber-600" />
                          <span>Solo desactualizados ({affectedCount})</span>
                        </button>
                      </div>
                    ) : null}

                    <div className="max-h-[36rem] overflow-auto pr-1">
                      {filteredGroups.length === 0 ? (
                        <EmptyState title="Ningún artefacto coincide">
                          Pruebe con otro código o título.
                        </EmptyState>
                      ) : (
                        <div className="flex flex-col gap-3 text-sm">
                          {filteredGroups.map((group) => {
                            const GroupIcon = group.icon;
                            const isCollapsed = Boolean(collapsedGroups[group.type]);
                            return (
                              <div
                                key={group.type}
                                className="rounded-lg border border-border/60 bg-muted/20 p-1.5"
                              >
                                <button
                                  type="button"
                                  onClick={() => toggleGroupCollapse(group.type)}
                                  className="mb-1 flex w-full items-center justify-between gap-1.5 px-1 py-0.5 text-xs font-semibold tracking-wide text-muted-foreground hover:text-foreground uppercase transition-colors"
                                >
                                  <span className="flex items-center gap-1.5">
                                    <GroupIcon
                                      className="size-3.5 text-primary/80"
                                      aria-hidden="true"
                                    />
                                    <span>{group.label}</span>
                                  </span>
                                  <span className="flex items-center gap-1">
                                    <Badge
                                      variant="outline"
                                      className="px-1.5 py-0 text-[10px] font-mono"
                                    >
                                      {group.nodes.length}
                                    </Badge>
                                    <ChevronDown
                                      className={`size-3.5 text-muted-foreground transition-transform duration-200 ${
                                        isCollapsed ? '-rotate-90' : ''
                                      }`}
                                    />
                                  </span>
                                </button>

                                {!isCollapsed ? (
                                  <ul className="flex flex-col gap-1">
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
                                            className={`flex w-full items-start gap-2 rounded-lg border-l-[3px] p-2 text-left transition-all duration-150 ${
                                              active
                                                ? 'border-l-primary bg-primary/10 text-foreground ring-1 ring-primary/30 shadow-2xs'
                                                : isStale
                                                  ? 'border-l-amber-500 bg-amber-50/70 hover:bg-amber-100/70 dark:bg-amber-950/20'
                                                  : 'border-l-transparent bg-card/60 hover:bg-muted/60 hover:border-l-border'
                                            }`}
                                          >
                                            <div className="min-w-0 flex-1">
                                              <div className="flex items-center gap-1.5">
                                                <span className="font-mono text-[11px] font-semibold text-muted-foreground">
                                                  {n.code} v{n.versionNumber}
                                                </span>
                                                {!n.isCurrent ? (
                                                  <span className="rounded border border-border/70 bg-background/80 px-1 py-px text-[10px] text-muted-foreground">
                                                    anterior
                                                  </span>
                                                ) : null}
                                              </div>
                                              <p className="truncate font-medium text-xs sm:text-sm mt-0.5">
                                                {n.title}
                                              </p>
                                            </div>
                                            {isStale ? (
                                              <AlertTriangle
                                                className="mt-0.5 size-3.5 shrink-0 text-amber-600"
                                                aria-hidden="true"
                                              />
                                            ) : null}
                                          </button>
                                        </li>
                                      );
                                    })}
                                  </ul>
                                ) : null}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </section>

                  {/* Right Column: Lineage & Impact Inspector */}
                  <section className="rounded-xl border border-border/80 bg-card p-5 shadow-2xs">
                    {!selected ? (
                      <EmptyState title="Seleccione un artefacto para ver su linaje">
                        Elija cualquier elemento de la lista para ver de dónde proviene, qué depende
                        de él y si hay algo que requiera su atención.
                      </EmptyState>
                    ) : (
                      <div className="flex flex-col text-sm">
                        {/* Header with selected artifact quick link */}
                        <div className="mb-4 flex flex-wrap items-center justify-between gap-2 border-b border-border/60 pb-3">
                          <div className="flex items-center gap-2">
                            <Activity className="size-4 text-primary" />
                            <h2 className="text-sm font-semibold text-foreground">
                              Linaje de {selected.code}
                            </h2>
                          </div>
                          {selectedRoute ? (
                            <Link
                              href={selectedRoute}
                              className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                            >
                              <span>Abrir en su pantalla</span>
                              <ExternalLink className="size-3" />
                            </Link>
                          ) : null}
                        </div>

                        {/* Upstream */}
                        <div>
                          <SectionLabel icon={ArrowUp} count={upstream.length}>
                            Aguas arriba
                          </SectionLabel>
                          {upstream.length === 0 ? (
                            <div className="rounded-lg border border-dashed border-border/80 bg-muted/20 p-3 text-muted-foreground text-xs">
                              Sin conocimiento/artefacto de origen registrado.
                            </div>
                          ) : (
                            <ul className="flex flex-col gap-1.5 rounded-lg border border-border/70 bg-muted/20 p-2">
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

                        {/* Current / Inspected Artifact */}
                        <div
                          className={`rounded-xl border-2 p-4 shadow-2xs transition-colors ${
                            selectedStaleness && selectedStaleness.impactState !== 'CURRENT'
                              ? 'border-amber-400 bg-amber-50/60 dark:bg-amber-950/20'
                              : 'border-primary/40 bg-primary/5'
                          }`}
                        >
                          <div className="mb-2 flex items-center justify-between gap-2">
                            <h3 className="flex items-center gap-1.5 text-xs font-bold tracking-wide text-primary uppercase">
                              <Sparkles className="size-3.5" aria-hidden="true" />
                              Actual
                            </h3>
                            <span className="text-[11px] font-mono text-muted-foreground">
                              ID: {selected.id}
                            </span>
                          </div>

                          <div className="py-1">
                            <NodeLabel node={selected} stale={selectedStaleness} />
                          </div>

                          {selected.generation ? (
                            <div className="mt-2.5 rounded-lg border border-border/60 bg-background/80 px-3 py-1.5 text-xs text-muted-foreground">
                              <span className="font-semibold text-foreground">Generación IA:</span>{' '}
                              {selected.generation.provider ?? '—'} /{' '}
                              {selected.generation.model ?? '—'}
                              {selected.generation.promptKey
                                ? ` · ${selected.generation.promptKey} v${selected.generation.promptVersion}`
                                : ''}
                            </div>
                          ) : selected.generator ? (
                            <div className="mt-2.5 rounded-lg border border-border/60 bg-background/80 px-3 py-1.5 text-xs text-muted-foreground">
                              <span className="font-semibold text-foreground">Motor:</span>{' '}
                              Generador determinístico v{selected.generator.generatorVersion}
                            </div>
                          ) : null}

                          {selectedStaleness && selectedStaleness.impactState !== 'CURRENT' ? (
                            <div className="mt-3.5 rounded-lg border border-amber-300/80 bg-amber-50 p-3 text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-200">
                              <h4 className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-amber-800 dark:text-amber-300 uppercase">
                                <AlertTriangle className="size-3.5" aria-hidden="true" />
                                Por qué podría estar desactualizado
                              </h4>
                              <ul className="flex flex-col gap-1 text-sm text-amber-900 dark:text-amber-200">
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
                                          className="rounded text-left underline decoration-dotted hover:bg-amber-200/50"
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
                              <p className="mt-2 text-sm font-medium text-amber-900 dark:text-amber-200">
                                {stalenessActionLabel(selectedStaleness)}{' '}
                                <Link href="/context" className="underline font-semibold">
                                  Ir al Contexto del Proyecto
                                </Link>
                              </p>
                            </div>
                          ) : null}
                        </div>

                        <LineageConnector />

                        {/* Downstream */}
                        <div>
                          <SectionLabel icon={ArrowDown} count={downstream.length}>
                            Aguas abajo
                          </SectionLabel>
                          {downstream.length === 0 ? (
                            <div className="rounded-lg border border-dashed border-border/80 bg-muted/20 p-3 text-muted-foreground text-xs">
                              Ningún artefacto conocido depende de este todavía.
                            </div>
                          ) : (
                            <ul className="flex flex-col gap-1.5 rounded-lg border border-border/70 bg-muted/20 p-2">
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

                        {/* Impact Analysis Dashboard */}
                        <div className="mt-6 rounded-xl border border-border/80 bg-muted/20 p-4 shadow-2xs">
                          <div className="mb-3 flex items-center justify-between gap-2">
                            <h3 className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
                              <GitBranch className="size-4 text-primary" aria-hidden="true" />
                              Análisis de impacto
                            </h3>
                            <span className="text-xs text-muted-foreground">
                              Propagación topológica
                            </span>
                          </div>

                          {!analyzeImpactMutation.data && !analyzeImpactMutation.isPending && (
                            <Button
                              type="button"
                              size="sm"
                              onClick={() => analyzeImpactMutation.mutate(selectedId!)}
                              className="w-full sm:w-auto"
                            >
                              <GitBranch className="size-3.5 mr-1.5" />
                              Analizar impacto de este cambio
                            </Button>
                          )}
                          {analyzeImpactMutation.isPending && (
                            <p className="text-sm text-muted-foreground flex items-center gap-2">
                              <span className="size-2 rounded-full bg-primary animate-ping" />
                              Analizando...
                            </p>
                          )}
                          {analyzeImpactMutation.isError && (
                            <p className="text-sm text-red-500">Error al analizar impacto.</p>
                          )}
                          {analyzeImpactMutation.data && (
                            <div className="flex flex-col gap-4">
                              {/* Impact Stats Summary */}
                              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 pt-1">
                                <div className="rounded-lg border border-border/60 bg-background p-2.5">
                                  <p className="text-[11px] text-muted-foreground font-medium">
                                    Directos (1 salto)
                                  </p>
                                  <p className="text-base font-bold text-foreground">
                                    {analyzeImpactMutation.data.directlyAffected.length}
                                  </p>
                                </div>
                                <div className="rounded-lg border border-border/60 bg-background p-2.5">
                                  <p className="text-[11px] text-muted-foreground font-medium">
                                    Transitivamente (&gt;1 salto)
                                  </p>
                                  <p className="text-base font-bold text-foreground">
                                    {analyzeImpactMutation.data.transitivelyAffected.length}
                                  </p>
                                </div>
                                <div className="col-span-2 sm:col-span-1 rounded-lg border border-border/60 bg-background p-2.5">
                                  <p className="text-[11px] text-muted-foreground font-medium">
                                    Total afectados
                                  </p>
                                  <p className="text-base font-bold text-primary">
                                    {analyzeImpactMutation.data.directlyAffected.length +
                                      analyzeImpactMutation.data.transitivelyAffected.length}
                                  </p>
                                </div>
                              </div>

                              <div>
                                <h4 className="text-xs font-semibold text-muted-foreground uppercase">
                                  Afectados Directamente (1 salto)
                                </h4>
                                {analyzeImpactMutation.data.directlyAffected.length === 0 ? (
                                  <p className="text-sm text-muted-foreground mt-1">Ninguno</p>
                                ) : (
                                  <ul className="mt-1.5 flex flex-col gap-1.5 text-sm">
                                    {analyzeImpactMutation.data.directlyAffected.map((id) => {
                                      const node = graph.data.nodes.find((n) => n.id === id);
                                      if (!node) return <li key={id}>{id}</li>;
                                      return (
                                        <li
                                          key={id}
                                          className="rounded-lg border border-border/60 bg-background p-2"
                                        >
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
                                  <p className="text-sm text-muted-foreground mt-1">Ninguno</p>
                                ) : (
                                  <ul className="mt-1.5 flex flex-col gap-1.5 text-sm">
                                    {analyzeImpactMutation.data.transitivelyAffected.map((id) => {
                                      const node = graph.data.nodes.find((n) => n.id === id);
                                      if (!node) return <li key={id}>{id}</li>;
                                      return (
                                        <li
                                          key={id}
                                          className="rounded-lg border border-border/60 bg-background p-2"
                                        >
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
                                  <p className="text-sm text-muted-foreground mt-1">Ninguno</p>
                                ) : (
                                  <ol className="mt-1.5 flex list-decimal flex-col gap-1.5 pl-5 text-sm">
                                    {analyzeImpactMutation.data.recommendedReviewOrder.map((id) => {
                                      const node = graph.data.nodes.find((n) => n.id === id);
                                      if (!node) return <li key={id}>{id}</li>;
                                      return (
                                        <li
                                          key={id}
                                          className="rounded-lg border border-border/60 bg-background p-2 pl-3"
                                        >
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

            {/* Construction Transition Milestone Card */}
            <div className="mt-4 rounded-2xl border-2 border-primary/30 bg-gradient-to-br from-card via-card to-primary/5 p-6 shadow-md transition-all">
              {isPlanningComplete ? (
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                  <div className="flex items-start gap-4">
                    <div className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary shadow-sm border border-primary/20">
                      <Sparkles className="size-6 text-primary animate-pulse" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2.5 py-0.5 text-xs font-semibold text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                          <ShieldCheck className="size-3.5" />
                          Planificación Completada (13/13)
                        </span>
                      </div>
                      <h2 className="mt-1.5 text-lg font-bold text-foreground">
                        ¡Fase de Planificación Completada con Éxito!
                      </h2>
                      <p className="mt-1 max-w-2xl text-sm text-muted-foreground leading-relaxed">
                        Todos los artefactos de análisis, diseño y trazabilidad están aprobados y
                        coherentes. La sección de <strong>Construcción</strong> en el menú lateral
                        ha sido desbloqueada. Puede avanzar ahora al primer paso de construcción:{' '}
                        <strong>Plan de generación</strong>.
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 shrink-0">
                    <Link href="/construction/generation-plan">
                      <Button size="lg" className="w-full sm:w-auto shadow-sm gap-2 font-semibold">
                        <Hammer className="size-4" />
                        Iniciar Fase de Construcción
                        <ArrowRight className="size-4" />
                      </Button>
                    </Link>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                  <div className="flex items-start gap-4">
                    <div className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-muted/60 text-muted-foreground border border-border">
                      <Lock className="size-6 text-muted-foreground" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium text-muted-foreground border border-border">
                          Fase 2: Construcción (Bloqueada)
                        </span>
                      </div>
                      <h2 className="mt-1.5 text-lg font-semibold text-foreground">
                        Siguiente fase: Construcción de Software
                      </h2>
                      <p className="mt-1 max-w-2xl text-sm text-muted-foreground leading-relaxed">
                        La fase de construcción (generación guiada del software, modelo conceptual y
                        sandbox) se habilitará en el menú lateral automáticamente cuando todos los
                        pasos de planificación estén satisfechos y aprobados.
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 shrink-0">
                    <Link href="/readiness">
                      <Button variant="outline" size="sm" className="gap-2 text-xs">
                        <ClipboardCheck className="size-3.5" />
                        Revisar Preparación
                      </Button>
                    </Link>
                    <Button disabled size="sm" className="gap-2 text-xs opacity-60">
                      <Lock className="size-3.5" />
                      Construcción Bloqueada
                    </Button>
                  </div>
                </div>
              )}
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
