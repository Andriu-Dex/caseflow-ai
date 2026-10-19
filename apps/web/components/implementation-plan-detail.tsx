'use client';

import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  ArrowRight,
  Code2,
  Cpu,
  Database,
  Globe,
  Key,
  Layout,
  Lock,
  Package,
  Search,
  TestTube,
  Unlock,
  X,
} from 'lucide-react';
import type { ImplementationPlanContent } from '@caseflow-ai/contracts';
import { Button } from '@caseflow-ai/ui';
import { api, ApiError } from '../lib/api';

const TYPE_LABELS: Record<string, string> = {
  STRING: 'texto',
  TEXT: 'texto largo',
  INT: 'entero',
  DECIMAL: 'decimal',
  BOOLEAN: 'booleano',
  DATE: 'fecha',
  DATETIME: 'fecha y hora',
  ENUM: 'enum',
};

const RELATION_LABELS: Record<string, string> = {
  MANY_TO_ONE: 'pertenece a (N:1)',
  ONE_TO_ONE: 'uno a uno (1:1)',
  MANY_TO_MANY: 'muchos a muchos (N:M)',
};

const OPERATION_LABELS: Record<string, string> = {
  LIST: 'listar',
  GET: 'consultar',
  CREATE: 'crear',
  UPDATE: 'editar',
  DELETE: 'eliminar',
};

const METHOD_COLORS: Record<string, string> = {
  GET: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
  POST: 'border-blue-500/30 bg-blue-500/10 text-blue-700 dark:text-blue-300',
  PATCH: 'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300',
  PUT: 'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300',
  DELETE: 'border-rose-500/30 bg-rose-500/10 text-rose-700 dark:text-rose-300',
};

const ROUTE_KIND_LABELS: Record<string, { label: string; badge: string }> = {
  LIST: {
    label: 'Listado',
    badge: 'border-purple-500/25 bg-purple-500/10 text-purple-700 dark:text-purple-300',
  },
  DETAIL: {
    label: 'Detalle',
    badge: 'border-sky-500/25 bg-sky-500/10 text-sky-700 dark:text-sky-300',
  },
  FORM: {
    label: 'Formulario',
    badge: 'border-amber-500/25 bg-amber-500/10 text-amber-700 dark:text-amber-300',
  },
  DASHBOARD: {
    label: 'Dashboard',
    badge: 'border-indigo-500/25 bg-indigo-500/10 text-indigo-700 dark:text-indigo-300',
  },
  CUSTOM: {
    label: 'Personalizado',
    badge: 'border-slate-500/25 bg-slate-500/10 text-slate-700 dark:text-slate-300',
  },
};

type CategoryTab = 'all' | 'modules' | 'endpoints' | 'routes' | 'config';

export function ImplementationPlanDetail({ content }: { content: ImplementationPlanContent }) {
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState<CategoryTab>('all');

  const names = useMemo(() => {
    return new Map((content.entities ?? []).map((e) => [e.localId, e.name]));
  }, [content.entities]);

  const modules = content.modules ?? [];
  const entities = content.entities ?? [];
  const endpoints = content.customEndpoints ?? [];
  const routes = content.routes ?? [];
  const envVars = content.envVars ?? [];
  const tests = content.tests ?? [];
  const auth = content.authentication ?? { required: false, roles: [] };

  const normalizedQuery = search.trim().toLowerCase();

  // Filter modules
  const filteredModules = useMemo(() => {
    if (!normalizedQuery) return modules;
    return modules.filter((mod) => {
      const matchMod =
        mod.name.toLowerCase().includes(normalizedQuery) ||
        mod.description.toLowerCase().includes(normalizedQuery);
      const matchEntity = entities
        .filter((e) => e.moduleLocalId === mod.localId)
        .some(
          (e) =>
            e.name.toLowerCase().includes(normalizedQuery) ||
            e.description?.toLowerCase().includes(normalizedQuery) ||
            e.fields.some((f) => f.name.toLowerCase().includes(normalizedQuery)),
        );
      return matchMod || matchEntity;
    });
  }, [modules, entities, normalizedQuery]);

  // Filter endpoints
  const filteredEndpoints = useMemo(() => {
    if (!normalizedQuery) return endpoints;
    return endpoints.filter(
      (ep) =>
        ep.path.toLowerCase().includes(normalizedQuery) ||
        ep.summary.toLowerCase().includes(normalizedQuery) ||
        ep.method.toLowerCase().includes(normalizedQuery) ||
        ep.roles.some((r) => r.toLowerCase().includes(normalizedQuery)),
    );
  }, [endpoints, normalizedQuery]);

  // Filter routes
  const filteredRoutes = useMemo(() => {
    if (!normalizedQuery) return routes;
    return routes.filter(
      (r) =>
        r.path.toLowerCase().includes(normalizedQuery) ||
        r.screenName.toLowerCase().includes(normalizedQuery) ||
        r.kind.toLowerCase().includes(normalizedQuery) ||
        r.actions.some((a) => a.label.toLowerCase().includes(normalizedQuery)),
    );
  }, [routes, normalizedQuery]);

  // Filter envVars
  const filteredEnvVars = useMemo(() => {
    if (!normalizedQuery) return envVars;
    return envVars.filter(
      (v) =>
        v.name.toLowerCase().includes(normalizedQuery) ||
        v.description.toLowerCase().includes(normalizedQuery),
    );
  }, [envVars, normalizedQuery]);

  // Filter tests
  const filteredTests = useMemo(() => {
    if (!normalizedQuery) return tests;
    return tests.filter(
      (t) =>
        t.description.toLowerCase().includes(normalizedQuery) ||
        t.kind.toLowerCase().includes(normalizedQuery),
    );
  }, [tests, normalizedQuery]);

  const hasAnyResults =
    ((category === 'all' || category === 'modules') && filteredModules.length > 0) ||
    ((category === 'all' || category === 'endpoints') && filteredEndpoints.length > 0) ||
    ((category === 'all' || category === 'routes') && filteredRoutes.length > 0) ||
    ((category === 'all' || category === 'config') &&
      (filteredEnvVars.length > 0 || filteredTests.length > 0));

  return (
    <div className="flex flex-col gap-5 pt-1 text-sm">
      {/* Resumen Ejecutivo */}
      <div className="relative overflow-hidden rounded-xl border border-primary/20 bg-linear-to-br from-primary/5 via-card to-background p-4 shadow-xs">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="flex size-7 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Code2 className="size-4" />
            </span>
            <div>
              <h4 className="font-semibold text-sm text-foreground">
                Plan de Implementación y Arquitectura Física
              </h4>
              <p className="text-xs text-muted-foreground">
                Mapeo determinista de módulos NestJS, entidades de base de datos Prisma, contratos
                OpenAPI y rutas Next.js.
              </p>
            </div>
          </div>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/10 px-2.5 py-0.5 text-[11px] font-semibold text-primary">
            Fase de Construcción · Paso 4 de 5
          </span>
        </div>
      </div>

      {/* Barra de Filtros y Búsqueda */}
      <div className="flex flex-col gap-3 rounded-xl border border-border/70 bg-card p-3 shadow-2xs sm:flex-row sm:items-center sm:justify-between">
        <div className="relative flex-1 max-w-md">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por módulo, entidad, campo, endpoint, ruta o variable..."
            aria-label="Buscar en el plan de implementación"
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

        {/* Categorías */}
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={() => setCategory('all')}
            className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
              category === 'all'
                ? 'bg-primary text-primary-foreground shadow-2xs'
                : 'bg-muted/70 text-muted-foreground hover:bg-muted hover:text-foreground'
            }`}
          >
            Vista General
          </button>
          <button
            type="button"
            onClick={() => setCategory('modules')}
            className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
              category === 'modules'
                ? 'bg-primary text-primary-foreground shadow-2xs'
                : 'bg-muted/70 text-muted-foreground hover:bg-muted hover:text-foreground'
            }`}
          >
            Entidades ({entities.length})
          </button>
          <button
            type="button"
            onClick={() => setCategory('endpoints')}
            className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
              category === 'endpoints'
                ? 'bg-primary text-primary-foreground shadow-2xs'
                : 'bg-muted/70 text-muted-foreground hover:bg-muted hover:text-foreground'
            }`}
          >
            Endpoints API ({endpoints.length})
          </button>
          <button
            type="button"
            onClick={() => setCategory('routes')}
            className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
              category === 'routes'
                ? 'bg-primary text-primary-foreground shadow-2xs'
                : 'bg-muted/70 text-muted-foreground hover:bg-muted hover:text-foreground'
            }`}
          >
            Frontend ({routes.length})
          </button>
          <button
            type="button"
            onClick={() => setCategory('config')}
            className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
              category === 'config'
                ? 'bg-primary text-primary-foreground shadow-2xs'
                : 'bg-muted/70 text-muted-foreground hover:bg-muted hover:text-foreground'
            }`}
          >
            Variables y Tests ({envVars.length + tests.length})
          </button>
        </div>
      </div>

      {!hasAnyResults ? (
        <div className="rounded-xl border border-dashed border-border p-8 text-center">
          <p className="text-xs text-muted-foreground">
            No se encontraron elementos en el plan de implementación que coincidan con la búsqueda{' '}
            <strong className="text-foreground font-semibold">"{search}"</strong>.
          </p>
        </div>
      ) : null}

      {/* Autenticación & Control de Acceso */}
      {(category === 'all' || category === 'modules') && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border/80 bg-card p-3.5 shadow-2xs">
          <div className="flex items-center gap-2.5">
            <span
              className={`flex size-7 shrink-0 items-center justify-center rounded-lg ${
                auth.required
                  ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400'
                  : 'bg-blue-500/10 text-blue-700 dark:text-blue-400'
              }`}
            >
              {auth.required ? <Lock className="size-4" /> : <Unlock className="size-4" />}
            </span>
            <div>
              <span className="font-semibold text-xs text-foreground block">
                Autenticación y Seguridad
              </span>
              <span className="text-[11px] text-muted-foreground">
                {auth.required
                  ? 'Control de acceso activo en backend y frontend'
                  : 'Acceso público'}
              </span>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            <span
              className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[11px] font-semibold ${
                auth.required
                  ? 'border-emerald-500/25 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400'
                  : 'border-blue-500/25 bg-blue-500/10 text-blue-700 dark:text-blue-400'
              }`}
            >
              {auth.required ? 'Requerida' : 'No requerida'}
            </span>
            {auth.roles && auth.roles.length > 0 ? (
              <span className="inline-flex items-center gap-1 rounded-md border border-border/60 bg-muted/50 px-2 py-0.5 text-[11px] text-foreground font-mono">
                <Key className="size-2.5 text-muted-foreground" />
                Roles: {auth.roles.join(', ')}
              </span>
            ) : null}
          </div>
        </div>
      )}

      {/* 1. SECCIÓN DE MÓDULOS Y ENTIDADES FÍSICAS */}
      {(category === 'all' || category === 'modules') && filteredModules.length > 0 && (
        <div className="flex flex-col gap-4">
          <h4 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            <Package className="size-3.5 text-primary" />
            Módulos NestJS y Entidades de Persistencia ({filteredModules.length})
          </h4>

          <div className="flex flex-col gap-4">
            {filteredModules.map((module) => {
              const moduleEntities = entities.filter((e) => e.moduleLocalId === module.localId);

              return (
                <div
                  key={module.localId}
                  className="flex flex-col gap-3 rounded-xl border border-border/80 bg-card p-4 shadow-2xs"
                >
                  <div className="flex flex-wrap items-start justify-between gap-2 border-b border-border/40 pb-2.5">
                    <div className="flex items-center gap-2">
                      <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                        <Package className="size-4" />
                      </span>
                      <div>
                        <h5 className="font-semibold text-sm text-foreground">{module.name}</h5>
                        <p className="text-xs text-muted-foreground leading-snug">
                          {module.description}
                        </p>
                      </div>
                    </div>
                    <span className="inline-flex items-center gap-1 rounded-md border border-primary/20 bg-primary/5 px-2 py-0.5 text-[10px] font-semibold text-primary">
                      {moduleEntities.length}{' '}
                      {moduleEntities.length === 1 ? 'entidad' : 'entidades'}
                    </span>
                  </div>

                  {/* Entidades de este módulo */}
                  <div className="grid grid-cols-1 gap-3 md:grid-cols-2 pt-1">
                    {moduleEntities.map((entity) => (
                      <div
                        key={entity.localId}
                        className="flex flex-col justify-between rounded-xl border border-border/70 bg-background/80 p-3.5 shadow-2xs"
                      >
                        <div className="flex flex-col gap-2.5">
                          {/* Header de la Entidad */}
                          <div className="flex items-start justify-between gap-1.5 border-b border-border/40 pb-2">
                            <div className="flex items-center gap-1.5">
                              <Database className="size-3.5 text-primary shrink-0" />
                              <strong className="font-mono text-sm font-semibold text-foreground">
                                {entity.name}
                              </strong>
                              {entity.classLocalId ? (
                                <span className="font-mono text-[10px] text-muted-foreground">
                                  ({entity.classLocalId})
                                </span>
                              ) : null}
                            </div>
                            {entity.operations && entity.operations.length > 0 ? (
                              <div className="flex flex-wrap gap-0.5">
                                {entity.operations.map((op) => (
                                  <span
                                    key={op}
                                    className="rounded border border-border/50 bg-muted/60 px-1 py-0.2 font-mono text-[9px] font-semibold text-foreground"
                                  >
                                    {op}
                                  </span>
                                ))}
                              </div>
                            ) : null}
                          </div>

                          {entity.description ? (
                            <p className="text-xs text-muted-foreground leading-snug">
                              {entity.description}
                            </p>
                          ) : null}

                          {/* Campos físicos de la entidad */}
                          <div className="flex flex-col gap-1">
                            <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                              Campos ({entity.fields.length}):
                            </span>
                            <div className="flex flex-col gap-1 rounded-lg border border-border/50 bg-muted/20 p-2 text-xs">
                              {entity.fields.map((f) => (
                                <div
                                  key={f.name}
                                  className="flex items-center justify-between gap-1.5 rounded border border-border/30 bg-background px-2 py-0.5 text-xs font-mono"
                                >
                                  <div className="flex items-center gap-1.5 truncate">
                                    <span className="font-semibold text-foreground">{f.name}</span>
                                    <span className="text-[10px] text-muted-foreground">
                                      ({TYPE_LABELS[f.type] ?? f.type}
                                      {f.enumValues && f.enumValues.length > 0
                                        ? `: ${f.enumValues.join(', ')}`
                                        : ''}
                                      )
                                    </span>
                                  </div>
                                  <div className="flex items-center gap-1 text-[9px] font-semibold shrink-0">
                                    {f.unique ? (
                                      <span className="rounded border border-amber-500/30 bg-amber-500/10 px-1 text-amber-700 dark:text-amber-300">
                                        ÚNICO
                                      </span>
                                    ) : null}
                                    <span
                                      className={`rounded px-1 ${
                                        f.required
                                          ? 'border border-sky-500/30 bg-sky-500/10 text-sky-700 dark:text-sky-300'
                                          : 'border border-border/50 bg-muted text-muted-foreground'
                                      }`}
                                    >
                                      {f.required ? 'REQ' : 'OPC'}
                                    </span>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>

                          {/* Relaciones físicas */}
                          {entity.relations && entity.relations.length > 0 ? (
                            <div className="flex flex-col gap-1 pt-1">
                              <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                                Relaciones ({entity.relations.length}):
                              </span>
                              <div className="flex flex-wrap gap-1">
                                {entity.relations.map((r, idx) => (
                                  <span
                                    key={idx}
                                    className="inline-flex items-center gap-1 rounded border border-border/60 bg-muted/50 px-1.5 py-0.5 font-mono text-[10px] text-foreground"
                                  >
                                    <span className="text-muted-foreground">{r.name}</span>
                                    <span className="font-semibold text-primary">
                                      {RELATION_LABELS[r.kind] ?? r.kind}
                                    </span>
                                    <strong>
                                      {names.get(r.targetEntityLocalId) ?? r.targetEntityLocalId}
                                    </strong>
                                  </span>
                                ))}
                              </div>
                            </div>
                          ) : null}

                          {/* Roles de escritura */}
                          {entity.writeRoles && entity.writeRoles.length > 0 ? (
                            <div className="text-[11px] text-muted-foreground">
                              <span className="font-medium">Escritura restringida:</span>{' '}
                              <span className="font-mono text-foreground">
                                {entity.writeRoles.join(', ')}
                              </span>
                            </div>
                          ) : null}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* 2. SECCIÓN DE ENDPOINTS DE NEGOCIO (OPENAPI) */}
      {(category === 'all' || category === 'endpoints') && filteredEndpoints.length > 0 && (
        <div className="flex flex-col gap-3">
          <h4 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            <Globe className="size-3.5 text-primary" />
            Endpoints de API y Operaciones de Negocio ({filteredEndpoints.length})
          </h4>

          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
            {filteredEndpoints.map((ep) => {
              const badgeClass = METHOD_COLORS[ep.method] ?? 'bg-muted text-foreground';

              return (
                <div
                  key={`${ep.method}-${ep.path}`}
                  className="flex flex-col justify-between rounded-xl border border-border/80 bg-card p-3 shadow-2xs transition-colors hover:border-border"
                >
                  <div className="flex flex-col gap-1.5">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <span
                          className={`inline-flex shrink-0 items-center justify-center rounded-md border px-2 py-0.5 font-mono text-[10px] font-bold ${badgeClass}`}
                        >
                          {ep.method}
                        </span>
                        <span className="font-mono text-xs font-semibold text-foreground truncate">
                          {ep.path}
                        </span>
                      </div>

                      {ep.roles && ep.roles.length > 0 ? (
                        <span className="rounded border border-border/50 bg-muted px-1.5 py-0.2 font-mono text-[9px] text-muted-foreground shrink-0">
                          {ep.roles.join(', ')}
                        </span>
                      ) : null}
                    </div>

                    <p className="text-xs text-muted-foreground leading-snug">{ep.summary}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* 3. SECCIÓN DE RUTAS DEL FRONTEND (NEXT.JS) */}
      {(category === 'all' || category === 'routes') && filteredRoutes.length > 0 && (
        <div className="flex flex-col gap-3">
          <h4 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            <Layout className="size-3.5 text-primary" />
            Pantallas del Frontend y Rutas Next.js ({filteredRoutes.length})
          </h4>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {filteredRoutes.map((r) => {
              const kindMeta = ROUTE_KIND_LABELS[r.kind] ?? {
                label: r.kind,
                badge: 'bg-muted text-foreground border-border/60',
              };

              return (
                <div
                  key={r.path}
                  className="flex flex-col justify-between rounded-xl border border-border/80 bg-card p-3.5 shadow-2xs transition-colors hover:border-border"
                >
                  <div className="flex flex-col gap-2">
                    <div className="flex items-start justify-between gap-2 border-b border-border/40 pb-2">
                      <div>
                        <div className="flex items-center gap-1.5">
                          <strong className="text-sm font-semibold text-foreground">
                            {r.screenName}
                          </strong>
                          {r.screenLocalId ? (
                            <span className="font-mono text-[10px] text-muted-foreground">
                              ({r.screenLocalId})
                            </span>
                          ) : null}
                        </div>
                        <span className="font-mono text-xs text-primary">{r.path}</span>
                      </div>

                      <span
                        className={`inline-flex items-center rounded-md border px-2 py-0.5 text-[10px] font-semibold shrink-0 ${kindMeta.badge}`}
                      >
                        {kindMeta.label}
                      </span>
                    </div>

                    {/* Acciones de la pantalla */}
                    {r.actions && r.actions.length > 0 ? (
                      <div className="flex flex-col gap-1 pt-1">
                        <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                          Acciones interactivas ({r.actions.length}):
                        </span>
                        <div className="flex flex-col gap-1">
                          {r.actions.map((a, idx) => (
                            <div
                              key={idx}
                              className="flex items-center justify-between gap-1.5 rounded border border-border/40 bg-background/80 px-2 py-1 text-xs"
                            >
                              <span className="font-medium text-foreground">{a.label}</span>
                              <div className="flex items-center gap-1 text-[10px] text-muted-foreground font-mono">
                                <ArrowRight className="size-2.5 text-primary" />
                                <span>
                                  {a.operation ? OPERATION_LABELS[a.operation] : a.endpoint}
                                </span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* 4. SECCIÓN DE VARIABLES Y PRUEBAS */}
      {(category === 'all' || category === 'config') &&
        (filteredEnvVars.length > 0 || filteredTests.length > 0) && (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {/* Variables de Entorno */}
            {filteredEnvVars.length > 0 && (
              <div className="flex flex-col gap-2.5 rounded-xl border border-border/80 bg-card p-4 shadow-2xs">
                <div className="flex items-center gap-2 border-b border-border/40 pb-2">
                  <Cpu className="size-4 text-primary" />
                  <h5 className="font-semibold text-xs uppercase tracking-wider text-muted-foreground">
                    Variables de Entorno ({filteredEnvVars.length})
                  </h5>
                </div>
                <div className="flex flex-col gap-1.5 pt-1">
                  {filteredEnvVars.map((v) => (
                    <div
                      key={v.name}
                      className="flex flex-col gap-0.5 rounded-lg border border-border/50 bg-background/80 p-2 text-xs"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-mono font-semibold text-foreground">{v.name}</span>
                        <span
                          className={`rounded px-1.5 py-0.1 text-[9px] font-semibold ${
                            v.required
                              ? 'border border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300'
                              : 'border border-border/50 bg-muted text-muted-foreground'
                          }`}
                        >
                          {v.required ? 'Obligatoria' : 'Opcional'}
                        </span>
                      </div>
                      <p className="text-[11px] text-muted-foreground leading-snug">
                        {v.description}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Pruebas Planificadas */}
            {filteredTests.length > 0 && (
              <div className="flex flex-col gap-2.5 rounded-xl border border-border/80 bg-card p-4 shadow-2xs">
                <div className="flex items-center gap-2 border-b border-border/40 pb-2">
                  <TestTube className="size-4 text-primary" />
                  <h5 className="font-semibold text-xs uppercase tracking-wider text-muted-foreground">
                    Pruebas Automatizadas ({filteredTests.length})
                  </h5>
                </div>
                <div className="flex flex-col gap-1.5 pt-1">
                  {filteredTests.map((t, idx) => (
                    <div
                      key={idx}
                      className="flex items-start gap-2 rounded-lg border border-border/50 bg-background/80 p-2 text-xs"
                    >
                      <span
                        className={`rounded px-1.5 py-0.2 font-mono text-[9px] font-bold shrink-0 mt-0.5 ${
                          t.kind === 'UNIT'
                            ? 'border border-blue-500/30 bg-blue-500/10 text-blue-700 dark:text-blue-300'
                            : t.kind === 'INTEGRATION'
                              ? 'border border-purple-500/30 bg-purple-500/10 text-purple-700 dark:text-purple-300'
                              : 'border border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
                        }`}
                      >
                        {t.kind}
                      </span>
                      <p className="text-[11px] text-foreground leading-snug">{t.description}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
    </div>
  );
}

// Read-only preview of the deterministic Prisma schema and OpenAPI contract
// the plan will generate, so reviewers approve exactly what gets built.
export function ImplementationPlanArtifacts({
  projectId,
  planId,
}: {
  projectId: string;
  planId: string;
}) {
  const [open, setOpen] = useState<'prisma' | 'openapi' | null>(null);
  const artifacts = useQuery({
    queryKey: ['implementation-plan-artifacts', projectId, planId],
    queryFn: () => api.structuredAnalysis.implementationPlanArtifacts(projectId, planId),
    enabled: open !== null,
  });
  const text =
    open === 'prisma'
      ? artifacts.data?.databaseSchema
      : open === 'openapi'
        ? JSON.stringify(artifacts.data?.openApi, null, 2)
        : undefined;

  return (
    <div className="mt-4 flex flex-col gap-3 rounded-xl border border-border/80 bg-card p-4 shadow-2xs">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/40 pb-2.5">
        <div className="flex items-center gap-2">
          <Code2 className="size-4 text-primary" />
          <h5 className="font-semibold text-xs uppercase tracking-wider text-foreground">
            Vista Previa de Esquemas Derivados
          </h5>
        </div>
        <div className="flex flex-wrap gap-2">
          {(
            [
              ['prisma', 'Esquema Prisma (schema.prisma)'],
              ['openapi', 'Contrato OpenAPI (openapi.json)'],
            ] as const
          ).map(([key, label]) => (
            <Button
              key={key}
              type="button"
              variant={open === key ? 'secondary' : 'outline'}
              size="sm"
              className="text-xs gap-1.5 h-8"
              onClick={() => setOpen(open === key ? null : key)}
            >
              <Code2 className="size-3.5" aria-hidden="true" />
              {label}
            </Button>
          ))}
        </div>
      </div>

      {open === null ? null : artifacts.isLoading ? (
        <p className="text-xs text-muted-foreground p-4 text-center">Generando vista previa…</p>
      ) : artifacts.error ? (
        <p className="text-xs text-destructive p-4">
          {artifacts.error instanceof ApiError
            ? artifacts.error.message
            : 'No se pudo generar la vista previa.'}
        </p>
      ) : (
        <div className="flex flex-col gap-1.5">
          <pre className="max-h-96 overflow-auto rounded-lg border border-border/80 bg-muted/40 p-3 font-mono text-xs leading-relaxed">
            {text}
          </pre>
        </div>
      )}
    </div>
  );
}
