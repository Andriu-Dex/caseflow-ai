'use client';

import { BatchedGenerationPanel } from '../../components/batched-generation-panel';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { DataModelResponse, DiagramResponse } from '@caseflow-ai/contracts';
import {
  CheckCircle2,
  Database,
  Eye,
  EyeOff,
  Layers,
  Link2,
  Pencil,
  Plus,
  Search,
  X,
} from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { Button, Input, Tabs, TabsContent, TabsList, TabsTrigger } from '@caseflow-ai/ui';
import { api, ApiError, type ArtifactVersionStatus, type GenerationResult } from '../../lib/api';
import { QueryState, RequireActiveProject } from '../../components/query-state';
import { StatusBadge } from '../../components/status-badge';
import { CandidateReview } from '../../components/candidate-review';
import { DataModelManualForm } from '../../components/data-model-manual-form';
import { DiagramViewer } from '../../components/diagram-viewer';
import { ArchivedArtifacts } from '../../components/archived-artifacts';
import { PageHeading } from '../../components/page-heading';
import {
  AiUnavailableHint,
  ApproveAllButton,
  ArchiveButton,
  EmptyState,
  approveDirectly,
  isPendingApproval,
} from '../../components/artifact-actions';

function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function DataModelContent({ projectId }: { projectId: string }) {
  const queryClient = useQueryClient();
  const dataModels = useQuery({
    queryKey: ['data-models', projectId],
    queryFn: () => api.dataModels.list(projectId),
  });
  const requirements = useQuery({
    queryKey: ['requirements', projectId],
    queryFn: () => api.requirements.list(projectId),
  });
  const useCases = useQuery({
    queryKey: ['use-cases', projectId],
    queryFn: () => api.useCases.list(projectId),
  });

  const [generation, setGeneration] = useState<GenerationResult | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'diagram' | 'entities' | 'relationships'>('diagram');
  const [entityQuery, setEntityQuery] = useState('');
  const [relationQuery, setRelationQuery] = useState('');
  const [diagrams, setDiagrams] = useState<Record<string, DiagramResponse>>({});
  const [loadingDiagramId, setLoadingDiagramId] = useState<string | null>(null);
  const [showManualForm, setShowManualForm] = useState(false);
  const [editing, setEditing] = useState<DataModelResponse | null>(null);
  const [approvingId, setApprovingId] = useState<string | null>(null);

  const approvedRequirementIds = (requirements.data?.items ?? [])
    .filter((r) => r.version.status === 'APPROVED')
    .map((r) => r.version.id);
  const approvedUseCaseIds = (useCases.data?.items ?? [])
    .filter((u) => u.version.status === 'APPROVED')
    .map((u) => u.version.id);

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: ['data-models', projectId] });
    queryClient.invalidateQueries({ queryKey: ['readiness', projectId] });
    queryClient.invalidateQueries({ queryKey: ['archived-artifacts', projectId] });
    setDiagrams({});
  }

  const transitionFor = (m: DataModelResponse) => (status: ArtifactVersionStatus) =>
    api.dataModels.transition(projectId, m.id, m.version.id, status);

  async function approveOne(m: DataModelResponse) {
    setApprovingId(m.id);
    try {
      await approveDirectly(transitionFor(m));
      toast.success(`${m.code} aprobado.`);
      invalidate();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'No se pudo aprobar el modelo de datos.');
    } finally {
      setApprovingId(null);
    }
  }

  async function transition(m: DataModelResponse, status: ArtifactVersionStatus) {
    try {
      await transitionFor(m)(status);
      invalidate();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'No se pudo cambiar el estado.');
    }
  }

  async function openDiagram(id: string) {
    if (expandedId === id && activeTab === 'diagram') {
      setExpandedId(null);
      return;
    }
    setExpandedId(id);
    setActiveTab('diagram');
    if (!diagrams[id]) {
      setLoadingDiagramId(id);
      try {
        const diagram = await api.dataModels.getDiagram(projectId, id);
        setDiagrams((prev) => ({ ...prev, [id]: diagram }));
      } catch (err) {
        toast.error(err instanceof ApiError ? err.message : 'No se pudo mostrar el diagrama.');
      } finally {
        setLoadingDiagramId(null);
      }
    }
  }

  function openEntities(id: string) {
    if (expandedId === id && (activeTab === 'entities' || activeTab === 'relationships')) {
      setExpandedId(null);
      return;
    }
    setExpandedId(id);
    setActiveTab('entities');
  }

  function handleTabChange(id: string, tab: 'diagram' | 'entities' | 'relationships') {
    setActiveTab(tab);
    if (tab === 'diagram' && !diagrams[id]) {
      setLoadingDiagramId(id);
      api.dataModels
        .getDiagram(projectId, id)
        .then((diagram) => setDiagrams((prev) => ({ ...prev, [id]: diagram })))
        .catch((err) =>
          toast.error(err instanceof ApiError ? err.message : 'No se pudo mostrar el diagrama.'),
        )
        .finally(() => setLoadingDiagramId(null));
    }
  }

  const items = dataModels.data?.items ?? [];
  const pending = items.filter((m) => isPendingApproval(m.version.status));

  return (
    <div className="flex flex-col gap-6">
      <PageHeading title="Modelo de datos" projectId={projectId} />

      <section className="flex flex-col gap-3 rounded-xl border border-border/80 bg-card p-4 shadow-2xs">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <BatchedGenerationPanel
              queryKey={['data-model-generation-job', projectId]}
              latest={() => api.dataModels.latestGeneration(projectId)}
              start={() =>
                api.dataModels.startGeneration(
                  projectId,
                  approvedRequirementIds,
                  approvedUseCaseIds,
                )
              }
              fetchGeneration={(generationId) => api.dataModels.generation(projectId, generationId)}
              jobSelection={(job) => job.sourceVersionIds}
              selection={[...approvedRequirementIds, ...approvedUseCaseIds]}
              onCompleted={setGeneration}
              title="Generando el modelo de datos por lotes"
              progressLabel="Lotes del modelo de datos validados"
              startLabel={() => 'Generar con IA'}
            >
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setEditing(null);
                  setShowManualForm((v) => !v);
                }}
                className="gap-1.5"
              >
                <Plus className="size-4" aria-hidden="true" />
                Crear manualmente
              </Button>
            </BatchedGenerationPanel>
          </div>
          <div className="flex items-center gap-2">
            <ApproveAllButton
              pending={pending}
              approve={(id) => approveDirectly(transitionFor(items.find((m) => m.id === id)!))}
              onDone={invalidate}
            />
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 border-t border-border/50 pt-2.5 text-xs text-muted-foreground">
          <span>Insumos para generación:</span>
          <span className="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-0.5 font-medium text-foreground">
            <CheckCircle2
              className="size-3 text-emerald-600 dark:text-emerald-400"
              aria-hidden="true"
            />
            {approvedRequirementIds.length}{' '}
            {approvedRequirementIds.length === 1 ? 'requisito aprobado' : 'requisitos aprobados'}
          </span>
          <span className="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-0.5 font-medium text-foreground">
            <CheckCircle2
              className="size-3 text-emerald-600 dark:text-emerald-400"
              aria-hidden="true"
            />
            {approvedUseCaseIds.length}{' '}
            {approvedUseCaseIds.length === 1 ? 'caso de uso aprobado' : 'casos de uso aprobados'}
          </span>
          <span className="ml-auto">
            <AiUnavailableHint />
          </span>
        </div>
      </section>

      {showManualForm || editing ? (
        <DataModelManualForm
          key={editing?.id ?? 'new'}
          projectId={projectId}
          initial={editing ?? undefined}
          onCreated={() => {
            invalidate();
            setShowManualForm(false);
            setEditing(null);
          }}
          onCancel={() => {
            setShowManualForm(false);
            setEditing(null);
          }}
        />
      ) : null}

      {generation ? (
        <CandidateReview
          generation={generation}
          describe={(c) => String(c.title ?? c.name ?? c.candidateId)}
          onAccept={async (ids) => {
            await api.dataModels.accept(projectId, generation.id, ids);
            invalidate();
          }}
          onDismiss={() => setGeneration(null)}
        />
      ) : null}

      <QueryState isLoading={dataModels.isLoading} error={dataModels.error}>
        {items.length === 0 ? (
          <EmptyState title="Aún no hay un modelo de datos">
            Genérelo con IA a partir de los requisitos y casos de uso aprobados, o defina las
            entidades manualmente.
          </EmptyState>
        ) : (
          <ul className="flex flex-col gap-4">
            {items.map((m) => (
              <li
                key={m.id}
                className="rounded-xl border border-border/80 bg-card p-5 shadow-2xs transition-shadow hover:shadow-xs"
              >
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex flex-wrap items-center gap-2.5">
                    <span className="rounded-md border border-primary/25 bg-primary/10 px-2 py-0.5 font-mono text-xs font-semibold text-primary">
                      {m.code}
                    </span>
                    <h3 className="text-base font-semibold text-foreground">{m.dataModel.title}</h3>
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 font-medium">
                        <Database className="size-3 text-muted-foreground" aria-hidden="true" />
                        {m.dataModel.entities.length}{' '}
                        {m.dataModel.entities.length === 1 ? 'entidad' : 'entidades'}
                      </span>
                      <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 font-medium">
                        <Link2 className="size-3 text-muted-foreground" aria-hidden="true" />
                        {m.dataModel.relationships.length}{' '}
                        {m.dataModel.relationships.length === 1 ? 'relación' : 'relaciones'}
                      </span>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <StatusBadge status={m.version.status} />
                    {isPendingApproval(m.version.status) ? (
                      <Button
                        variant="default"
                        size="sm"
                        type="button"
                        onClick={() => approveOne(m)}
                        disabled={approvingId === m.id}
                        className="h-8 gap-1.5"
                      >
                        <CheckCircle2 className="size-3.5" aria-hidden="true" />
                        {approvingId === m.id ? 'Aprobando…' : 'Aprobar'}
                      </Button>
                    ) : null}
                    {m.version.status === 'IN_REVIEW' ? (
                      <>
                        <Button
                          variant="default"
                          size="sm"
                          type="button"
                          onClick={() => transition(m, 'APPROVED')}
                          className="h-8 gap-1.5"
                        >
                          <CheckCircle2 className="size-3.5" aria-hidden="true" />
                          Aprobar
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          type="button"
                          onClick={() => transition(m, 'CHANGES_REQUESTED')}
                          className="h-8 border-destructive/30 text-destructive hover:bg-destructive/10"
                        >
                          Solicitar cambios
                        </Button>
                      </>
                    ) : null}
                    <Button
                      variant="ghost"
                      size="sm"
                      type="button"
                      onClick={() => {
                        setShowManualForm(false);
                        setEditing(m);
                      }}
                      className="h-8 gap-1 text-muted-foreground hover:text-foreground"
                    >
                      <Pencil className="size-3.5" aria-hidden="true" />
                      Editar
                    </Button>
                    <ArchiveButton
                      projectId={projectId}
                      artifactId={m.id}
                      code={m.code}
                      onDone={invalidate}
                    />
                  </div>
                </div>

                {(() => {
                  const filteredEntities = m.dataModel.entities.filter((entity) => {
                    if (!entityQuery.trim()) return true;
                    const q = normalizeText(entityQuery);
                    const matchesName = normalizeText(entity.name).includes(q);
                    const matchesDesc = entity.description
                      ? normalizeText(entity.description).includes(q)
                      : false;
                    const matchesAttr = entity.attributes.some(
                      (attr) =>
                        normalizeText(attr.name).includes(q) ||
                        normalizeText(attr.type).includes(q),
                    );
                    return matchesName || matchesDesc || matchesAttr;
                  });

                  const filteredRelationships = m.dataModel.relationships.filter((rel) => {
                    if (!relationQuery.trim()) return true;
                    const q = normalizeText(relationQuery);
                    const sourceEntity = m.dataModel.entities.find(
                      (en) => en.localId === rel.sourceEntityId,
                    );
                    const targetEntity = m.dataModel.entities.find(
                      (en) => en.localId === rel.targetEntityId,
                    );
                    const matchesName = rel.name ? normalizeText(rel.name).includes(q) : false;
                    const matchesDesc = rel.description
                      ? normalizeText(rel.description).includes(q)
                      : false;
                    const matchesSource = sourceEntity
                      ? normalizeText(sourceEntity.name).includes(q)
                      : false;
                    const matchesTarget = targetEntity
                      ? normalizeText(targetEntity.name).includes(q)
                      : false;
                    return matchesName || matchesDesc || matchesSource || matchesTarget;
                  });

                  return (
                    <>
                      <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-border/50 pt-3">
                        <Button
                          variant={
                            expandedId === m.id && activeTab === 'diagram' ? 'secondary' : 'outline'
                          }
                          size="sm"
                          type="button"
                          onClick={() => openDiagram(m.id)}
                          className="h-8 gap-1.5 text-xs text-primary"
                        >
                          {expandedId === m.id && activeTab === 'diagram' ? (
                            <EyeOff className="size-3.5" aria-hidden="true" />
                          ) : (
                            <Eye className="size-3.5" aria-hidden="true" />
                          )}
                          {expandedId === m.id && activeTab === 'diagram'
                            ? 'Ocultar diagrama'
                            : 'Ver diagrama entidad-relación'}
                        </Button>
                        <Button
                          variant={
                            expandedId === m.id &&
                            (activeTab === 'entities' || activeTab === 'relationships')
                              ? 'secondary'
                              : 'outline'
                          }
                          size="sm"
                          type="button"
                          onClick={() => openEntities(m.id)}
                          className="h-8 gap-1.5 text-xs"
                        >
                          <Layers className="size-3.5" aria-hidden="true" />
                          {expandedId === m.id &&
                          (activeTab === 'entities' || activeTab === 'relationships')
                            ? 'Ocultar entidades'
                            : 'Ver entidades y relaciones'}
                        </Button>
                      </div>

                      {expandedId === m.id ? (
                        <div className="mt-4 flex flex-col gap-3 border-t border-border/60 pt-4">
                          <Tabs
                            value={activeTab}
                            onValueChange={(val) =>
                              handleTabChange(m.id, val as 'diagram' | 'entities' | 'relationships')
                            }
                            className="w-full"
                          >
                            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/40 pb-3">
                              <TabsList className="bg-muted/70 p-1">
                                <TabsTrigger value="diagram" className="gap-1.5 text-xs">
                                  <Eye className="size-3.5" aria-hidden="true" />
                                  Diagrama ER
                                </TabsTrigger>
                                <TabsTrigger value="entities" className="gap-1.5 text-xs">
                                  <Database className="size-3.5" aria-hidden="true" />
                                  Entidades ({m.dataModel.entities.length})
                                </TabsTrigger>
                                <TabsTrigger value="relationships" className="gap-1.5 text-xs">
                                  <Link2 className="size-3.5" aria-hidden="true" />
                                  Relaciones ({m.dataModel.relationships.length})
                                </TabsTrigger>
                              </TabsList>
                              <Button
                                variant="ghost"
                                size="sm"
                                type="button"
                                onClick={() => setExpandedId(null)}
                                className="h-8 gap-1 text-xs text-muted-foreground hover:text-foreground"
                              >
                                <EyeOff className="size-3.5" aria-hidden="true" />
                                Ocultar detalles
                              </Button>
                            </div>

                            <TabsContent
                              value="diagram"
                              forceMount
                              className={activeTab !== 'diagram' ? 'hidden' : 'pt-3'}
                            >
                              {diagrams[m.id] ? (
                                <DiagramViewer
                                  svg={diagrams[m.id]!.svg}
                                  source={diagrams[m.id]!.source}
                                  sourceFormat={diagrams[m.id]!.sourceFormat}
                                  code={m.code}
                                  caption={`Diagrama entidad-relación de ${m.code}`}
                                  pngUrl={api.dataModels.diagramPngUrl(projectId, m.id)}
                                />
                              ) : loadingDiagramId === m.id ? (
                                <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-border/60 bg-muted/10 p-12 text-center text-xs text-muted-foreground">
                                  <div className="size-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                                  <p>Cargando diagrama entidad-relación...</p>
                                </div>
                              ) : (
                                <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border/70 p-10 text-center text-xs text-muted-foreground">
                                  <Eye
                                    className="size-6 text-muted-foreground/60"
                                    aria-hidden="true"
                                  />
                                  <p>Diagrama no cargado todavía.</p>
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => openDiagram(m.id)}
                                    className="h-8 text-xs"
                                  >
                                    Cargar diagrama
                                  </Button>
                                </div>
                              )}
                            </TabsContent>

                            <TabsContent
                              value="entities"
                              forceMount
                              className={
                                activeTab !== 'entities' ? 'hidden' : 'pt-3 flex flex-col gap-3'
                              }
                            >
                              <div className="flex flex-wrap items-center justify-between gap-3">
                                <div className="flex items-center gap-2">
                                  <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                                    Entidades ({m.dataModel.entities.length})
                                  </h4>
                                  {entityQuery.trim() ? (
                                    <span className="text-xs text-muted-foreground">
                                      ({filteredEntities.length} coincidencia
                                      {filteredEntities.length === 1 ? '' : 's'})
                                    </span>
                                  ) : null}
                                </div>
                                {m.dataModel.entities.length > 1 ? (
                                  <div className="relative w-full sm:w-64">
                                    <Search
                                      className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground"
                                      aria-hidden="true"
                                    />
                                    <Input
                                      placeholder="Buscar entidad o atributo..."
                                      value={entityQuery}
                                      onChange={(e) => setEntityQuery(e.target.value)}
                                      className="h-8 pl-8 pr-8 text-xs"
                                    />
                                    {entityQuery ? (
                                      <button
                                        type="button"
                                        onClick={() => setEntityQuery('')}
                                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                                        aria-label="Limpiar búsqueda de entidades"
                                      >
                                        <X className="size-3.5" aria-hidden="true" />
                                      </button>
                                    ) : null}
                                  </div>
                                ) : null}
                              </div>

                              {filteredEntities.length === 0 ? (
                                <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border/80 p-8 text-center text-xs text-muted-foreground">
                                  <Search
                                    className="size-6 text-muted-foreground/50 mb-2"
                                    aria-hidden="true"
                                  />
                                  <p>
                                    No se encontraron entidades que coincidan con &ldquo;
                                    {entityQuery}&rdquo;.
                                  </p>
                                  <Button
                                    variant="link"
                                    size="sm"
                                    onClick={() => setEntityQuery('')}
                                    className="mt-1 h-auto p-0 text-xs text-primary"
                                  >
                                    Limpiar búsqueda
                                  </Button>
                                </div>
                              ) : (
                                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                                  {filteredEntities.map((e) => (
                                    <div
                                      key={e.localId}
                                      className="flex flex-col rounded-lg border border-border/80 bg-muted/20 p-3 shadow-2xs transition-colors hover:border-border"
                                    >
                                      <div className="flex items-center gap-1.5 pb-1.5 border-b border-border/40">
                                        <Database
                                          className="size-3.5 text-primary shrink-0"
                                          aria-hidden="true"
                                        />
                                        <span className="font-semibold text-sm text-foreground truncate">
                                          {e.name}
                                        </span>
                                      </div>
                                      {e.description ? (
                                        <p className="mt-1 text-xs text-muted-foreground line-clamp-2">
                                          {e.description}
                                        </p>
                                      ) : null}
                                      <div className="mt-2.5 flex flex-col gap-1">
                                        <span className="text-[11px] font-medium text-muted-foreground">
                                          Atributos:
                                        </span>
                                        <ul className="flex flex-col gap-1 text-xs">
                                          {e.attributes.map((attr, ai) => (
                                            <li
                                              key={ai}
                                              className="flex flex-wrap items-center justify-between gap-1 rounded bg-background/80 px-2 py-1 border border-border/40"
                                            >
                                              <span className="font-mono text-foreground font-medium text-xs">
                                                {attr.name}
                                              </span>
                                              <div className="flex items-center gap-1 text-[10px]">
                                                <span className="rounded bg-muted px-1 py-0.2 font-mono text-muted-foreground">
                                                  {attr.type}
                                                </span>
                                                {attr.primaryKey ? (
                                                  <span
                                                    className="rounded bg-amber-500/15 text-amber-700 dark:text-amber-400 font-semibold px-1"
                                                    title="Clave primaria"
                                                  >
                                                    PK
                                                  </span>
                                                ) : null}
                                                {attr.required ? (
                                                  <span
                                                    className="rounded bg-blue-500/15 text-blue-700 dark:text-blue-400 font-semibold px-1"
                                                    title="Requerido (NOT NULL)"
                                                  >
                                                    REQ
                                                  </span>
                                                ) : null}
                                                {attr.unique ? (
                                                  <span
                                                    className="rounded bg-purple-500/15 text-purple-700 dark:text-purple-400 font-semibold px-1"
                                                    title="Único"
                                                  >
                                                    UNIQ
                                                  </span>
                                                ) : null}
                                              </div>
                                            </li>
                                          ))}
                                        </ul>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </TabsContent>

                            <TabsContent
                              value="relationships"
                              forceMount
                              className={
                                activeTab !== 'relationships'
                                  ? 'hidden'
                                  : 'pt-3 flex flex-col gap-3'
                              }
                            >
                              <div className="flex flex-wrap items-center justify-between gap-3">
                                <div className="flex items-center gap-2">
                                  <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                                    Relaciones ({m.dataModel.relationships.length})
                                  </h4>
                                  {relationQuery.trim() ? (
                                    <span className="text-xs text-muted-foreground">
                                      ({filteredRelationships.length} coincidencia
                                      {filteredRelationships.length === 1 ? '' : 's'})
                                    </span>
                                  ) : null}
                                </div>
                                {m.dataModel.relationships.length > 0 ? (
                                  <div className="relative w-full sm:w-64">
                                    <Search
                                      className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground"
                                      aria-hidden="true"
                                    />
                                    <Input
                                      placeholder="Filtrar por entidad o relación..."
                                      value={relationQuery}
                                      onChange={(e) => setRelationQuery(e.target.value)}
                                      className="h-8 pl-8 pr-8 text-xs"
                                    />
                                    {relationQuery ? (
                                      <button
                                        type="button"
                                        onClick={() => setRelationQuery('')}
                                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                                        aria-label="Limpiar filtro de relaciones"
                                      >
                                        <X className="size-3.5" aria-hidden="true" />
                                      </button>
                                    ) : null}
                                  </div>
                                ) : null}
                              </div>

                              {m.dataModel.relationships.length === 0 ? (
                                <div className="rounded-lg border border-dashed border-border/80 p-6 text-center text-xs text-muted-foreground">
                                  Este modelo de datos no tiene relaciones definidas.
                                </div>
                              ) : filteredRelationships.length === 0 ? (
                                <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border/80 p-8 text-center text-xs text-muted-foreground">
                                  <Search
                                    className="size-6 text-muted-foreground/50 mb-2"
                                    aria-hidden="true"
                                  />
                                  <p>
                                    No se encontraron relaciones que coincidan con &ldquo;
                                    {relationQuery}&rdquo;.
                                  </p>
                                  <Button
                                    variant="link"
                                    size="sm"
                                    onClick={() => setRelationQuery('')}
                                    className="mt-1 h-auto p-0 text-xs text-primary"
                                  >
                                    Limpiar filtro
                                  </Button>
                                </div>
                              ) : (
                                <div className="flex flex-col gap-2">
                                  {filteredRelationships.map((r, ri) => {
                                    const sourceEntity = m.dataModel.entities.find(
                                      (en) => en.localId === r.sourceEntityId,
                                    );
                                    const targetEntity = m.dataModel.entities.find(
                                      (en) => en.localId === r.targetEntityId,
                                    );
                                    const cardLabel = (c: string) => {
                                      if (c === 'ONE') return '1';
                                      if (c === 'ZERO_OR_ONE') return '0..1';
                                      if (c === 'ONE_OR_MORE') return '1..*';
                                      if (c === 'ZERO_OR_MORE') return '0..*';
                                      return c;
                                    };
                                    return (
                                      <div
                                        key={ri}
                                        className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border/70 bg-muted/20 px-3 py-2 text-xs"
                                      >
                                        <div className="flex flex-wrap items-center gap-2">
                                          <div className="flex items-center gap-1.5 font-medium">
                                            <span className="rounded-md bg-background px-2 py-0.5 border border-border font-semibold text-foreground">
                                              {sourceEntity?.name ?? r.sourceEntityId}
                                            </span>
                                            <span className="font-mono text-muted-foreground text-[11px] font-semibold">
                                              [{cardLabel(r.sourceCardinality)}]
                                            </span>
                                          </div>
                                          <div className="flex items-center gap-1 text-muted-foreground">
                                            <span className="h-px w-3 bg-border" />
                                            <span className="rounded-full bg-primary/10 px-2 py-0.5 text-primary text-[11px] font-medium">
                                              {r.name || 'se relaciona con'}
                                            </span>
                                            <span className="text-primary font-bold">→</span>
                                            <span className="h-px w-3 bg-border" />
                                          </div>
                                          <div className="flex items-center gap-1.5 font-medium">
                                            <span className="font-mono text-muted-foreground text-[11px] font-semibold">
                                              [{cardLabel(r.targetCardinality)}]
                                            </span>
                                            <span className="rounded-md bg-background px-2 py-0.5 border border-border font-semibold text-foreground">
                                              {targetEntity?.name ?? r.targetEntityId}
                                            </span>
                                          </div>
                                        </div>
                                        {r.description ? (
                                          <span className="text-muted-foreground italic text-[11px]">
                                            {r.description}
                                          </span>
                                        ) : null}
                                      </div>
                                    );
                                  })}
                                </div>
                              )}
                            </TabsContent>
                          </Tabs>
                        </div>
                      ) : null}
                    </>
                  );
                })()}
              </li>
            ))}
          </ul>
        )}
      </QueryState>

      <ArchivedArtifacts projectId={projectId} types={['DATA_MODEL']} onRestored={invalidate} />
    </div>
  );
}

export default function DataModelPage() {
  return (
    <RequireActiveProject>
      {(projectId) => <DataModelContent projectId={projectId} />}
    </RequireActiveProject>
  );
}
