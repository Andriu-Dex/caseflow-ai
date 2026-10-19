'use client';

import { useMemo, useState } from 'react';
import { ArrowRight, Box, FileCode, Layers, Link2, Search, X } from 'lucide-react';
import type { ConceptualDomainModelContent } from '@caseflow-ai/contracts';

const CARDINALITY_CONFIG: Record<string, { label: string; badge: string; code: string }> = {
  ONE_TO_ONE: {
    label: '1 a 1',
    code: '1:1',
    badge: 'border-sky-500/25 bg-sky-500/10 text-sky-700 dark:text-sky-300',
  },
  ONE_TO_MANY: {
    label: '1 a muchos',
    code: '1:N',
    badge: 'border-emerald-500/25 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
  },
  MANY_TO_MANY: {
    label: 'Muchos a muchos',
    code: 'N:M',
    badge: 'border-purple-500/25 bg-purple-500/10 text-purple-700 dark:text-purple-300',
  },
};

type ViewSection = 'all' | 'entities' | 'relationships';

export function ConceptualModelDetail({ content }: { content: ConceptualDomainModelContent }) {
  const [search, setSearch] = useState('');
  const [selectedModule, setSelectedModule] = useState<string | null>(null);
  const [section, setSection] = useState<ViewSection>('all');

  const entities = content.entities ?? [];
  const relationships = content.relationships ?? [];

  // Map of localId to Entity Name for relationship lookups
  const entityMap = useMemo(() => {
    return new Map(entities.map((e) => [e.localId, e.name]));
  }, [entities]);

  // Extract unique module names
  const modules = useMemo(() => {
    const set = new Set<string>();
    for (const e of entities) {
      if (e.moduleName) set.add(e.moduleName);
    }
    return Array.from(set).sort();
  }, [entities]);

  const normalizedQuery = search.trim().toLowerCase();

  // Filter entities
  const filteredEntities = useMemo(() => {
    return entities.filter((entity) => {
      if (selectedModule && entity.moduleName !== selectedModule) {
        return false;
      }
      if (!normalizedQuery) return true;

      const matchName = entity.name.toLowerCase().includes(normalizedQuery);
      const matchDesc = entity.description.toLowerCase().includes(normalizedQuery);
      const matchModule = entity.moduleName?.toLowerCase().includes(normalizedQuery);
      const matchClass = entity.classLocalId?.toLowerCase().includes(normalizedQuery);
      const matchAttr = entity.attributes.some(
        (a) =>
          a.name.toLowerCase().includes(normalizedQuery) ||
          a.description?.toLowerCase().includes(normalizedQuery),
      );
      return matchName || matchDesc || matchModule || matchClass || matchAttr;
    });
  }, [entities, selectedModule, normalizedQuery]);

  // Filter relationships
  const filteredRelationships = useMemo(() => {
    return relationships.filter((rel) => {
      const fromName = entityMap.get(rel.fromLocalId) ?? rel.fromLocalId;
      const toName = entityMap.get(rel.toLocalId) ?? rel.toLocalId;

      if (selectedModule) {
        const fromEntity = entities.find((e) => e.localId === rel.fromLocalId);
        const toEntity = entities.find((e) => e.localId === rel.toLocalId);
        if (fromEntity?.moduleName !== selectedModule && toEntity?.moduleName !== selectedModule) {
          return false;
        }
      }

      if (!normalizedQuery) return true;

      const matchName = rel.name.toLowerCase().includes(normalizedQuery);
      const matchDesc = rel.description?.toLowerCase().includes(normalizedQuery);
      const matchFrom = fromName.toLowerCase().includes(normalizedQuery);
      const matchTo = toName.toLowerCase().includes(normalizedQuery);
      return matchName || matchDesc || matchFrom || matchTo;
    });
  }, [relationships, entityMap, entities, selectedModule, normalizedQuery]);

  const hasResults =
    ((section === 'all' || section === 'entities') && filteredEntities.length > 0) ||
    ((section === 'all' || section === 'relationships') && filteredRelationships.length > 0);

  return (
    <div className="flex flex-col gap-5 pt-1 text-sm">
      {/* Banner Resumen */}
      <div className="relative overflow-hidden rounded-xl border border-primary/20 bg-linear-to-br from-primary/5 via-card to-background p-4 shadow-xs">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="flex size-7 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Box className="size-4" />
            </span>
            <div>
              <h4 className="font-semibold text-sm text-foreground">
                Modelo Conceptual de Dominio
              </h4>
              <p className="text-xs text-muted-foreground">
                Estructura lógica de entidades de negocio, atributos y relaciones conceptuales
                independientes de la persistencia física.
              </p>
            </div>
          </div>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/10 px-2.5 py-0.5 text-[11px] font-semibold text-primary">
            Fase de Construcción · Paso 2 de 5
          </span>
        </div>
      </div>

      {/* Barra de Filtros y Búsqueda */}
      <div className="flex flex-col gap-3 rounded-xl border border-border/70 bg-card p-3 shadow-2xs">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative flex-1 max-w-md">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar por entidad, atributo, descripción o relación..."
              aria-label="Buscar en el modelo conceptual"
              className="h-8 w-full rounded-md border border-input bg-background pl-8 pr-7 text-xs placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
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

          {/* Selector de Sección */}
          <div className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              onClick={() => setSection('all')}
              className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                section === 'all'
                  ? 'bg-primary text-primary-foreground shadow-2xs'
                  : 'bg-muted/70 text-muted-foreground hover:bg-muted hover:text-foreground'
              }`}
            >
              Vista Completa
            </button>
            <button
              type="button"
              onClick={() => setSection('entities')}
              className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                section === 'entities'
                  ? 'bg-primary text-primary-foreground shadow-2xs'
                  : 'bg-muted/70 text-muted-foreground hover:bg-muted hover:text-foreground'
              }`}
            >
              Entidades ({entities.length})
            </button>
            <button
              type="button"
              onClick={() => setSection('relationships')}
              className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                section === 'relationships'
                  ? 'bg-primary text-primary-foreground shadow-2xs'
                  : 'bg-muted/70 text-muted-foreground hover:bg-muted hover:text-foreground'
              }`}
            >
              Relaciones ({relationships.length})
            </button>
          </div>
        </div>

        {/* Filtro por Módulos si existen */}
        {modules.length > 0 ? (
          <div className="flex flex-wrap items-center gap-1.5 border-t border-border/40 pt-2">
            <span className="text-[11px] font-medium text-muted-foreground flex items-center gap-1 mr-1">
              <Layers className="size-3 text-muted-foreground" />
              Módulo:
            </span>
            <button
              type="button"
              onClick={() => setSelectedModule(null)}
              className={`rounded-full px-2.5 py-0.5 text-[11px] font-medium transition-colors ${
                selectedModule === null
                  ? 'bg-primary text-primary-foreground shadow-2xs'
                  : 'bg-muted/60 text-muted-foreground hover:bg-muted hover:text-foreground'
              }`}
            >
              Todos ({entities.length})
            </button>
            {modules.map((mod) => {
              const count = entities.filter((e) => e.moduleName === mod).length;
              const isSelected = selectedModule === mod;
              return (
                <button
                  key={mod}
                  type="button"
                  onClick={() => setSelectedModule(isSelected ? null : mod)}
                  className={`rounded-full px-2.5 py-0.5 text-[11px] font-medium transition-colors ${
                    isSelected
                      ? 'bg-primary text-primary-foreground shadow-2xs'
                      : 'border border-primary/20 bg-primary/5 text-primary hover:bg-primary/10'
                  }`}
                >
                  {mod} ({count})
                </button>
              );
            })}
          </div>
        ) : null}
      </div>

      {!hasResults ? (
        <div className="rounded-xl border border-dashed border-border p-8 text-center">
          <p className="text-xs text-muted-foreground">
            No se encontraron elementos en el modelo conceptual que coincidan con la búsqueda{' '}
            <strong className="text-foreground font-semibold">"{search}"</strong>.
          </p>
        </div>
      ) : null}

      {/* 1. SECCIÓN DE ENTIDADES DE DOMINIO */}
      {(section === 'all' || section === 'entities') && filteredEntities.length > 0 ? (
        <div className="flex flex-col gap-3">
          <h4 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            <Box className="size-3.5 text-primary" />
            Entidades de Dominio ({filteredEntities.length})
          </h4>

          <div className="grid grid-cols-1 gap-3.5 md:grid-cols-2">
            {filteredEntities.map((entity) => {
              // Get relationships where this entity participates
              const entityRels = relationships.filter(
                (r) => r.fromLocalId === entity.localId || r.toLocalId === entity.localId,
              );

              return (
                <div
                  key={entity.localId}
                  className="flex flex-col justify-between rounded-xl border border-border/80 bg-card p-4 shadow-2xs transition-all hover:border-border hover:shadow-xs"
                >
                  <div className="flex flex-col gap-2.5">
                    {/* Header de la Entidad */}
                    <div className="flex items-start justify-between gap-2 border-b border-border/40 pb-2.5">
                      <div className="flex items-center gap-2">
                        <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                          <Box className="size-4" />
                        </span>
                        <div>
                          <h5 className="font-semibold text-sm text-foreground">{entity.name}</h5>
                          <span className="font-mono text-[10px] text-muted-foreground">
                            ID: {entity.localId}
                          </span>
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-1.5">
                        {entity.moduleName ? (
                          <span className="inline-flex items-center gap-1 rounded-md border border-primary/20 bg-primary/5 px-2 py-0.5 text-[10px] font-semibold text-primary">
                            <Layers className="size-2.5" />
                            {entity.moduleName}
                          </span>
                        ) : null}
                        {entity.classLocalId ? (
                          <span
                            className="inline-flex items-center gap-1 rounded-md border border-border/50 bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground"
                            title="Clase de análisis asociada"
                          >
                            <FileCode className="size-2.5 text-muted-foreground" />
                            clase {entity.classLocalId}
                          </span>
                        ) : null}
                      </div>
                    </div>

                    {/* Descripción de la Entidad */}
                    <p className="text-xs text-muted-foreground leading-relaxed">
                      {entity.description}
                    </p>

                    {/* Lista de Atributos */}
                    <div className="flex flex-col gap-1.5 pt-1">
                      <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground flex items-center justify-between">
                        <span>Atributos de Dominio:</span>
                        <span className="font-normal lowercase">
                          {entity.attributes.length}{' '}
                          {entity.attributes.length === 1 ? 'campo' : 'campos'}
                        </span>
                      </span>

                      <div className="flex flex-col gap-1.5 rounded-lg border border-border/50 bg-muted/20 p-2 text-xs">
                        {entity.attributes.map((attr) => (
                          <div
                            key={attr.name}
                            className="flex flex-col gap-0.5 rounded border border-border/40 bg-background/80 px-2 py-1 shadow-2xs"
                          >
                            <div className="flex items-center justify-between gap-1.5">
                              <span className="font-mono font-medium text-foreground">
                                {attr.name}
                              </span>
                              <span
                                className={`rounded px-1.5 py-0.2 text-[10px] font-semibold ${
                                  attr.required
                                    ? 'bg-sky-500/10 text-sky-700 dark:text-sky-300 border border-sky-500/20'
                                    : 'bg-muted text-muted-foreground border border-border/40'
                                }`}
                              >
                                {attr.required ? 'Requerido' : 'Opcional'}
                              </span>
                            </div>
                            {attr.description ? (
                              <p className="text-[11px] text-muted-foreground leading-snug">
                                {attr.description}
                              </p>
                            ) : null}
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Relaciones resumidas */}
                    {entityRels.length > 0 ? (
                      <div className="flex flex-col gap-1 pt-1">
                        <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                          Relaciones directas ({entityRels.length}):
                        </span>
                        <div className="flex flex-wrap gap-1">
                          {entityRels.map((r, idx) => {
                            const isOutgoing = r.fromLocalId === entity.localId;
                            const otherName = isOutgoing
                              ? (entityMap.get(r.toLocalId) ?? r.toLocalId)
                              : (entityMap.get(r.fromLocalId) ?? r.fromLocalId);
                            const cardConfig =
                              CARDINALITY_CONFIG[r.cardinality] ?? CARDINALITY_CONFIG.ONE_TO_MANY!;

                            return (
                              <span
                                key={idx}
                                className="inline-flex items-center gap-1 rounded border border-border/60 bg-background px-1.5 py-0.5 text-[11px] shadow-2xs"
                              >
                                <span className="text-muted-foreground font-medium">
                                  {isOutgoing ? '➔' : '⬅'} {r.name}
                                </span>
                                <strong className="text-foreground font-semibold">
                                  {otherName}
                                </strong>
                                <span
                                  className={`rounded px-1 py-0.1 font-mono text-[9px] font-bold ${cardConfig.badge}`}
                                >
                                  {cardConfig.code}
                                </span>
                              </span>
                            );
                          })}
                        </div>
                      </div>
                    ) : null}
                  </div>

                  {/* Trazabilidad en el Footer */}
                  {entity.relatedSourceCodes && entity.relatedSourceCodes.length > 0 ? (
                    <div className="mt-3 flex flex-wrap items-center gap-1.5 border-t border-border/40 pt-2 text-[11px]">
                      <span className="text-muted-foreground font-medium">Fuentes:</span>
                      {entity.relatedSourceCodes.map((sc) => (
                        <span
                          key={sc}
                          className="inline-flex items-center rounded border border-border/40 bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground"
                        >
                          {sc}
                        </span>
                      ))}
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        </div>
      ) : null}

      {/* 2. SECCIÓN DE RELACIONES CONCEPTUALES */}
      {(section === 'all' || section === 'relationships') && filteredRelationships.length > 0 ? (
        <div className="flex flex-col gap-3">
          <h4 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            <Link2 className="size-3.5 text-primary" />
            Relaciones Conceptuales del Dominio ({filteredRelationships.length})
          </h4>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {filteredRelationships.map((rel, idx) => {
              const fromName = entityMap.get(rel.fromLocalId) ?? rel.fromLocalId;
              const toName = entityMap.get(rel.toLocalId) ?? rel.toLocalId;
              const config = CARDINALITY_CONFIG[rel.cardinality] ?? CARDINALITY_CONFIG.ONE_TO_MANY!;

              return (
                <div
                  key={`${rel.fromLocalId}-${rel.toLocalId}-${rel.name}-${idx}`}
                  className="flex flex-col justify-between rounded-xl border border-border/80 bg-card p-3.5 shadow-2xs transition-colors hover:border-border"
                >
                  <div className="flex flex-col gap-2.5">
                    {/* Flujo Visual: Origen ─── Verbo ───> Destino */}
                    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/40 pb-2">
                      <div className="flex flex-wrap items-center gap-1.5 text-xs">
                        <span className="rounded-md border border-border/70 bg-background px-2 py-0.5 font-semibold text-foreground shadow-2xs">
                          {fromName}
                        </span>
                        <div className="flex items-center gap-1 px-1 text-primary">
                          <span className="text-[11px] font-medium italic">{rel.name}</span>
                          <ArrowRight className="size-3.5" />
                        </div>
                        <span className="rounded-md border border-border/70 bg-background px-2 py-0.5 font-semibold text-foreground shadow-2xs">
                          {toName}
                        </span>
                      </div>

                      <span
                        className={`inline-flex items-center rounded-md border px-2 py-0.5 text-[11px] font-semibold ${config.badge}`}
                      >
                        {config.label} ({config.code})
                      </span>
                    </div>

                    {rel.description ? (
                      <p className="text-xs text-muted-foreground leading-relaxed">
                        {rel.description}
                      </p>
                    ) : (
                      <p className="text-xs text-muted-foreground italic">
                        Relación conceptual directa entre {fromName} y {toName}.
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
}
