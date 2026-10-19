'use client';

import { useMemo, useState } from 'react';
import {
  AlertTriangle,
  Box,
  ChevronRight,
  Cpu,
  ExternalLink,
  GitBranch,
  Globe,
  Key,
  Lock,
  Monitor,
  Package,
  Search,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Unlock,
  Users,
  X,
} from 'lucide-react';
import type { GenerationPlanContent } from '@caseflow-ai/contracts';

type FilterCategory = 'all' | 'modules' | 'workflows' | 'security' | 'risks';

export function GenerationPlanDetail({ content }: { content: GenerationPlanContent }) {
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState<FilterCategory>('all');

  const normalizedQuery = search.trim().toLowerCase();

  // Normalize arrays to prevent crashes on undefined
  const modules = content.modules ?? [];
  const workflows = content.workflows ?? [];
  const screens = content.screens ?? [];
  const actors = content.actors ?? [];
  const integrations = content.integrations ?? [];
  const technicalConstraints = content.technicalConstraints ?? [];
  const risks = content.risks ?? [];
  const auth = content.authentication ?? { required: false, roles: [] };

  // Filter modules
  const filteredModules = useMemo(() => {
    if (!normalizedQuery) return modules;
    return modules.filter((mod) => {
      const matchName = mod.name.toLowerCase().includes(normalizedQuery);
      const matchPurpose = mod.purpose.toLowerCase().includes(normalizedQuery);
      const matchEntities = mod.entityNames?.some((e) => e.toLowerCase().includes(normalizedQuery));
      const matchReq = mod.relatedRequirementCodes?.some((r) =>
        r.toLowerCase().includes(normalizedQuery),
      );
      const matchCu = mod.relatedUseCaseCodes?.some((c) =>
        c.toLowerCase().includes(normalizedQuery),
      );
      return matchName || matchPurpose || matchEntities || matchReq || matchCu;
    });
  }, [modules, normalizedQuery]);

  // Filter workflows
  const filteredWorkflows = useMemo(() => {
    if (!normalizedQuery) return workflows;
    return workflows.filter((wf) => {
      const matchName = wf.name.toLowerCase().includes(normalizedQuery);
      const matchSteps = wf.steps?.some((s) => s.toLowerCase().includes(normalizedQuery));
      const matchCu = wf.relatedUseCaseCodes?.some((c) =>
        c.toLowerCase().includes(normalizedQuery),
      );
      return matchName || matchSteps || matchCu;
    });
  }, [workflows, normalizedQuery]);

  // Filter actors
  const filteredActors = useMemo(() => {
    if (!normalizedQuery) return actors;
    return actors.filter((actor) => {
      const matchName = actor.name.toLowerCase().includes(normalizedQuery);
      const matchDesc = actor.description?.toLowerCase().includes(normalizedQuery);
      const matchPerm = actor.permissions?.some((p) => p.toLowerCase().includes(normalizedQuery));
      return matchName || matchDesc || matchPerm;
    });
  }, [actors, normalizedQuery]);

  // Filter risks
  const filteredRisks = useMemo(() => {
    if (!normalizedQuery) return risks;
    return risks.filter((r) => {
      const matchDesc = r.description.toLowerCase().includes(normalizedQuery);
      const matchMit = r.mitigation?.toLowerCase().includes(normalizedQuery);
      return matchDesc || matchMit;
    });
  }, [risks, normalizedQuery]);

  const hasAnyResults =
    ((category === 'all' || category === 'modules') && filteredModules.length > 0) ||
    ((category === 'all' || category === 'workflows') && filteredWorkflows.length > 0) ||
    ((category === 'all' || category === 'security') &&
      (filteredActors.length > 0 || auth.strategy)) ||
    ((category === 'all' || category === 'risks') &&
      (filteredRisks.length > 0 || technicalConstraints.length > 0));

  return (
    <div className="flex flex-col gap-5 pt-1 text-sm">
      {/* Resumen Ejecutivo */}
      <div className="relative overflow-hidden rounded-xl border border-primary/20 bg-linear-to-br from-primary/5 via-card to-background p-4 shadow-xs">
        <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-border/50">
          <div className="flex items-center gap-2">
            <span className="flex size-7 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Sparkles className="size-4" />
            </span>
            <h4 className="font-semibold text-sm text-foreground">
              Resumen del Sistema a Construir
            </h4>
          </div>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/10 px-2.5 py-0.5 text-[11px] font-semibold text-primary">
            Fase de Construcción · Paso 1 de 5
          </span>
        </div>
        <p className="mt-3 text-xs leading-relaxed text-muted-foreground sm:text-sm">
          {content.summary}
        </p>
      </div>

      {/* Barra de Filtros y Búsqueda */}
      <div className="flex flex-col gap-3 rounded-xl border border-border/70 bg-card p-3 shadow-2xs sm:flex-row sm:items-center sm:justify-between">
        <div className="relative flex-1 max-w-md">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por módulo, entidad, actor, flujo o código..."
            aria-label="Buscar en el plan de generación"
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
            Todo
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
            Módulos ({modules.length})
          </button>
          <button
            type="button"
            onClick={() => setCategory('workflows')}
            className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
              category === 'workflows'
                ? 'bg-primary text-primary-foreground shadow-2xs'
                : 'bg-muted/70 text-muted-foreground hover:bg-muted hover:text-foreground'
            }`}
          >
            Flujos ({workflows.length})
          </button>
          <button
            type="button"
            onClick={() => setCategory('security')}
            className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
              category === 'security'
                ? 'bg-primary text-primary-foreground shadow-2xs'
                : 'bg-muted/70 text-muted-foreground hover:bg-muted hover:text-foreground'
            }`}
          >
            Seguridad ({actors.length})
          </button>
          <button
            type="button"
            onClick={() => setCategory('risks')}
            className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
              category === 'risks'
                ? 'bg-primary text-primary-foreground shadow-2xs'
                : 'bg-muted/70 text-muted-foreground hover:bg-muted hover:text-foreground'
            }`}
          >
            Riesgos ({risks.length})
          </button>
        </div>
      </div>

      {!hasAnyResults ? (
        <div className="rounded-xl border border-dashed border-border p-8 text-center">
          <p className="text-xs text-muted-foreground">
            No se encontraron elementos en el plan de generación que coincidan con la búsqueda{' '}
            <strong className="text-foreground font-semibold">"{search}"</strong>.
          </p>
        </div>
      ) : null}

      {/* 1. SECCIÓN DE MÓDULOS FUNCIONALES */}
      {(category === 'all' || category === 'modules') && filteredModules.length > 0 ? (
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <h4 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              <Package className="size-3.5 text-primary" />
              Módulos Funcionales de Software ({filteredModules.length})
            </h4>
          </div>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {filteredModules.map((module) => {
              const moduleScreens = screens.filter((s) => s.moduleLocalId === module.localId);
              return (
                <div
                  key={module.localId}
                  className="flex flex-col justify-between rounded-xl border border-border/80 bg-card p-4 shadow-2xs transition-all hover:border-border hover:shadow-xs"
                >
                  <div className="flex flex-col gap-2.5">
                    {/* Header del Módulo */}
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                          <Package className="size-4" />
                        </span>
                        <div>
                          <h5 className="font-semibold text-sm text-foreground">{module.name}</h5>
                          <span className="font-mono text-[10px] text-muted-foreground">
                            ID: {module.localId}
                          </span>
                        </div>
                      </div>
                      {module.entityNames && module.entityNames.length > 0 ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary">
                          <Box className="size-3" />
                          {module.entityNames.length}{' '}
                          {module.entityNames.length === 1 ? 'entidad' : 'entidades'}
                        </span>
                      ) : null}
                    </div>

                    {/* Propósito */}
                    <p className="text-xs text-muted-foreground leading-relaxed">
                      {module.purpose}
                    </p>

                    {/* Entidades de Negocio */}
                    {module.entityNames && module.entityNames.length > 0 ? (
                      <div className="flex flex-col gap-1.5 pt-1">
                        <span className="text-[11px] font-medium text-muted-foreground">
                          Entidades de dominio:
                        </span>
                        <div className="flex flex-wrap gap-1">
                          {module.entityNames.map((entity) => (
                            <span
                              key={entity}
                              className="inline-flex items-center rounded-md border border-primary/20 bg-primary/5 px-2 py-0.5 font-mono text-[11px] font-medium text-primary"
                            >
                              {entity}
                            </span>
                          ))}
                        </div>
                      </div>
                    ) : null}

                    {/* Pantallas del Módulo */}
                    {moduleScreens.length > 0 ? (
                      <div className="flex flex-col gap-1.5 pt-1">
                        <span className="text-[11px] font-medium text-muted-foreground">
                          Pantallas asignadas:
                        </span>
                        <div className="flex flex-wrap gap-1">
                          {moduleScreens.map((screen) => (
                            <span
                              key={screen.name}
                              className="inline-flex items-center gap-1 rounded-md border border-border/60 bg-muted/40 px-2 py-0.5 text-[11px] text-foreground"
                            >
                              <Monitor className="size-3 text-muted-foreground" />
                              {screen.name}
                            </span>
                          ))}
                        </div>
                      </div>
                    ) : null}
                  </div>

                  {/* Trazabilidad en el Footer de la Tarjeta */}
                  {(module.relatedRequirementCodes?.length ?? 0) > 0 ||
                  (module.relatedUseCaseCodes?.length ?? 0) > 0 ||
                  (module.relatedSourceCodes?.length ?? 0) > 0 ? (
                    <div className="mt-3 flex flex-wrap items-center gap-1.5 border-t border-border/40 pt-2.5 text-[11px]">
                      <span className="text-muted-foreground font-medium mr-0.5">
                        Trazabilidad:
                      </span>
                      {module.relatedRequirementCodes?.map((req) => (
                        <span
                          key={req}
                          className="inline-flex items-center rounded border border-sky-500/25 bg-sky-500/10 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-sky-700 dark:text-sky-300"
                        >
                          {req}
                        </span>
                      ))}
                      {module.relatedUseCaseCodes?.map((cu) => (
                        <span
                          key={cu}
                          className="inline-flex items-center rounded border border-emerald-500/25 bg-emerald-500/10 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-emerald-700 dark:text-emerald-300"
                        >
                          {cu}
                        </span>
                      ))}
                      {module.relatedSourceCodes?.map((sc) => (
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

      {/* 2. SECCIÓN DE FLUJOS PRINCIPALES (WORKFLOWS) */}
      {(category === 'all' || category === 'workflows') && filteredWorkflows.length > 0 ? (
        <div className="flex flex-col gap-3">
          <h4 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            <GitBranch className="size-3.5 text-primary" />
            Flujos de Trabajo del Sistema ({filteredWorkflows.length})
          </h4>

          <div className="flex flex-col gap-3">
            {filteredWorkflows.map((workflow) => (
              <div
                key={workflow.localId}
                className="flex flex-col gap-3 rounded-xl border border-border/80 bg-card p-4 shadow-2xs transition-colors hover:border-border"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-700 dark:text-emerald-400">
                      <GitBranch className="size-4" />
                    </span>
                    <div>
                      <h5 className="font-semibold text-sm text-foreground">{workflow.name}</h5>
                      <span className="font-mono text-[10px] text-muted-foreground">
                        ID: {workflow.localId}
                      </span>
                    </div>
                  </div>

                  {workflow.relatedUseCaseCodes && workflow.relatedUseCaseCodes.length > 0 ? (
                    <div className="flex items-center gap-1">
                      {workflow.relatedUseCaseCodes.map((cu) => (
                        <span
                          key={cu}
                          className="inline-flex items-center rounded border border-emerald-500/25 bg-emerald-500/10 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-emerald-700 dark:text-emerald-300"
                        >
                          {cu}
                        </span>
                      ))}
                    </div>
                  ) : null}
                </div>

                {/* Secuencia de Pasos */}
                <div className="flex flex-wrap items-center gap-2 pt-1">
                  {workflow.steps.map((step, idx) => (
                    <div key={idx} className="flex items-center gap-2">
                      <div className="flex items-center gap-1.5 rounded-lg border border-border/80 bg-background/90 px-2.5 py-1.5 text-xs shadow-2xs">
                        <span className="flex size-4 shrink-0 items-center justify-center rounded-full bg-primary/15 text-[10px] font-bold text-primary">
                          {idx + 1}
                        </span>
                        <span className="text-foreground font-medium">{step}</span>
                      </div>
                      {idx < workflow.steps.length - 1 ? (
                        <ChevronRight className="size-3.5 text-muted-foreground/60 shrink-0" />
                      ) : null}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {/* 3. SECCIÓN DE SEGURIDAD Y ACTORES */}
      {(category === 'all' || category === 'security') && (filteredActors.length > 0 || auth) ? (
        <div className="flex flex-col gap-3">
          <h4 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            <Lock className="size-3.5 text-primary" />
            Seguridad, Roles y Actores
          </h4>

          {/* Tarjeta de Autenticación */}
          <div className="flex flex-col gap-3 rounded-xl border border-border/80 bg-card p-4 shadow-2xs">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/40 pb-2.5">
              <div className="flex items-center gap-2">
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
                  <h5 className="font-semibold text-sm text-foreground">
                    Autenticación del Sistema
                  </h5>
                  <span className="text-xs text-muted-foreground">
                    {auth.required ? 'Control de acceso activo' : 'Acceso público'}
                  </span>
                </div>
              </div>

              <span
                className={`inline-flex items-center gap-1 rounded-md border px-2.5 py-1 text-xs font-semibold ${
                  auth.required
                    ? 'border-emerald-500/25 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400'
                    : 'border-blue-500/25 bg-blue-500/10 text-blue-700 dark:text-blue-400'
                }`}
              >
                {auth.required ? (
                  <>
                    <Lock className="size-3" /> Requerida
                  </>
                ) : (
                  <>
                    <Unlock className="size-3" /> No requerida
                  </>
                )}
              </span>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 text-xs">
              <div className="flex flex-col gap-1">
                <span className="text-muted-foreground font-medium">Estrategia técnica:</span>
                <span className="font-mono text-xs text-foreground bg-muted/40 rounded px-2 py-1 border border-border/40">
                  {auth.strategy || 'Por defecto según TargetTemplate (JWT / Sessions)'}
                </span>
              </div>
              <div className="flex flex-col gap-1">
                <span className="text-muted-foreground font-medium">Roles globales asignados:</span>
                {auth.roles && auth.roles.length > 0 ? (
                  <div className="flex flex-wrap gap-1">
                    {auth.roles.map((role) => (
                      <span
                        key={role}
                        className="rounded border border-border/60 bg-muted px-2 py-0.5 font-medium text-foreground text-[11px]"
                      >
                        {role}
                      </span>
                    ))}
                  </div>
                ) : (
                  <span className="text-muted-foreground italic text-xs">
                    Sin roles específicos configurados
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Grilla de Actores */}
          {filteredActors.length > 0 ? (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {filteredActors.map((actor) => (
                <div
                  key={actor.name}
                  className="flex flex-col justify-between rounded-xl border border-border/80 bg-card p-3.5 shadow-2xs transition-colors hover:border-border"
                >
                  <div className="flex flex-col gap-2">
                    <div className="flex items-center gap-2">
                      <span className="flex size-6 shrink-0 items-center justify-center rounded-md bg-purple-500/10 text-purple-700 dark:text-purple-400">
                        <Users className="size-3.5" />
                      </span>
                      <h5 className="font-semibold text-xs text-foreground">{actor.name}</h5>
                    </div>

                    {actor.description ? (
                      <p className="text-xs text-muted-foreground leading-relaxed">
                        {actor.description}
                      </p>
                    ) : null}

                    {actor.permissions && actor.permissions.length > 0 ? (
                      <div className="flex flex-col gap-1 pt-1">
                        <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                          Permisos asignados:
                        </span>
                        <div className="flex flex-wrap gap-1">
                          {actor.permissions.map((perm) => (
                            <span
                              key={perm}
                              className="inline-flex items-center gap-1 rounded bg-muted/70 px-1.5 py-0.5 text-[11px] text-foreground border border-border/40"
                            >
                              <Key className="size-2.5 text-muted-foreground" />
                              {perm}
                            </span>
                          ))}
                        </div>
                      </div>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}

      {/* 4. SECCIÓN DE RIESGOS Y RESTRICCIONES */}
      {(category === 'all' || category === 'risks') &&
      (filteredRisks.length > 0 || technicalConstraints.length > 0 || integrations.length > 0) ? (
        <div className="flex flex-col gap-4">
          <h4 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            <ShieldAlert className="size-3.5 text-primary" />
            Riesgos, Restricciones e Integraciones
          </h4>

          {/* Matriz de Riesgos */}
          {filteredRisks.length > 0 ? (
            <div className="flex flex-col gap-2.5">
              <span className="text-xs font-medium text-foreground">
                Matriz de Riesgos y Mitigación ({filteredRisks.length}):
              </span>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                {filteredRisks.map((risk, idx) => (
                  <div
                    key={idx}
                    className="flex flex-col justify-between rounded-xl border border-amber-500/30 bg-amber-500/5 p-3.5 shadow-2xs"
                  >
                    <div className="flex flex-col gap-2">
                      <div className="flex items-center gap-1.5 text-amber-700 dark:text-amber-400 font-semibold text-xs">
                        <AlertTriangle className="size-3.5 shrink-0" />
                        <span>Riesgo Detectado</span>
                      </div>
                      <p className="text-xs text-foreground leading-relaxed">{risk.description}</p>
                    </div>

                    {risk.mitigation ? (
                      <div className="mt-2.5 flex items-start gap-1.5 rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-2 text-xs text-foreground">
                        <ShieldCheck className="size-3.5 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
                        <div>
                          <strong className="text-emerald-700 dark:text-emerald-400 font-medium">
                            Mitigación prevista:{' '}
                          </strong>
                          {risk.mitigation}
                        </div>
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          {/* Restricciones Técnicas e Integraciones */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {/* Restricciones Técnicas */}
            {technicalConstraints.length > 0 ? (
              <div className="flex flex-col gap-2 rounded-xl border border-border/80 bg-card p-3.5 shadow-2xs">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
                  <Cpu className="size-3.5 text-primary" />
                  <span>Restricciones Técnicas ({technicalConstraints.length})</span>
                </div>
                <ul className="flex flex-col gap-1.5 pt-1 text-xs text-muted-foreground">
                  {technicalConstraints.map((constraint, i) => (
                    <li key={i} className="flex items-start gap-1.5">
                      <span className="mt-1 size-1.5 shrink-0 rounded-full bg-primary" />
                      <span className="text-foreground">{constraint}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            {/* Integraciones Externas */}
            {integrations.length > 0 ? (
              <div className="flex flex-col gap-2 rounded-xl border border-border/80 bg-card p-3.5 shadow-2xs">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
                  <Globe className="size-3.5 text-primary" />
                  <span>Integraciones Externas ({integrations.length})</span>
                </div>
                <div className="flex flex-col gap-2 pt-1 text-xs">
                  {integrations.map((integration) => (
                    <div
                      key={integration.name}
                      className="rounded-lg border border-border/50 bg-background/80 p-2 shadow-2xs"
                    >
                      <div className="flex items-center gap-1.5 font-semibold text-foreground">
                        <ExternalLink className="size-3 text-primary" />
                        <span>{integration.name}</span>
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">{integration.purpose}</p>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
