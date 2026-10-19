'use client';

import { useMemo, useState } from 'react';
import { useQueries, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertCircle,
  AlertTriangle,
  Box,
  CheckCircle2,
  Clock,
  FileCode,
  FileImage,
  FolderTree,
  Layers,
  Layout,
  Lock,
  Package,
  Palette,
  Server,
  ShieldCheck,
  Tag,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  REQUIRED_DESIGN_BASELINE_ROLES,
  type CreateDesignBaselineRequest,
  type DesignBaselineRole,
} from '@caseflow-ai/contracts';
import { Button } from '@caseflow-ai/ui';
import { api, ApiError } from '../../../lib/api';
import { PageHeading } from '../../../components/page-heading';
import { QueryState, RequireActiveProject } from '../../../components/query-state';
import { ConstructionFooter } from '../../../components/construction-footer';
import { EmptyState } from '../../../components/artifact-actions';

type StructuredRole = Exclude<DesignBaselineRole, 'MOCKUP'>;

const ROLE_CONFIG: Record<
  DesignBaselineRole,
  {
    label: string;
    icon: React.ComponentType<{ className?: string }>;
    color: string;
    badgeColor: string;
  }
> = {
  GENERATION_PLAN: {
    label: 'Plan de generación',
    icon: Package,
    color: 'text-blue-600 dark:text-blue-400',
    badgeColor: 'border-blue-500/25 bg-blue-500/10 text-blue-700 dark:text-blue-300',
  },
  CONCEPTUAL_DOMAIN_MODEL: {
    label: 'Modelo conceptual',
    icon: Box,
    color: 'text-indigo-600 dark:text-indigo-400',
    badgeColor: 'border-indigo-500/25 bg-indigo-500/10 text-indigo-700 dark:text-indigo-300',
  },
  CLASS_DIAGRAM: {
    label: 'Diagrama de clases',
    icon: FileCode,
    color: 'text-cyan-600 dark:text-cyan-400',
    badgeColor: 'border-cyan-500/25 bg-cyan-500/10 text-cyan-700 dark:text-cyan-300',
  },
  NAVIGATION_TREE: {
    label: 'Navegación',
    icon: FolderTree,
    color: 'text-emerald-600 dark:text-emerald-400',
    badgeColor: 'border-emerald-500/25 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
  },
  UI_BLUEPRINT: {
    label: 'Plano de interfaz',
    icon: Layout,
    color: 'text-purple-600 dark:text-purple-400',
    badgeColor: 'border-purple-500/25 bg-purple-500/10 text-purple-700 dark:text-purple-300',
  },
  DESIGN_THEME: {
    label: 'Tema y colores',
    icon: Palette,
    color: 'text-pink-600 dark:text-pink-400',
    badgeColor: 'border-pink-500/25 bg-pink-500/10 text-pink-700 dark:text-pink-300',
  },
  MOCKUP: {
    label: 'Boceto',
    icon: FileImage,
    color: 'text-amber-600 dark:text-amber-400',
    badgeColor: 'border-amber-500/25 bg-amber-500/10 text-amber-700 dark:text-amber-300',
  },
  SOFTWARE_ARCHITECTURE: {
    label: 'Arquitectura de software',
    icon: Layers,
    color: 'text-slate-600 dark:text-slate-400',
    badgeColor: 'border-slate-500/25 bg-slate-500/10 text-slate-700 dark:text-slate-300',
  },
  SYSTEM_ARCHITECTURE: {
    label: 'Arquitectura de sistema',
    icon: Server,
    color: 'text-violet-600 dark:text-violet-400',
    badgeColor: 'border-violet-500/25 bg-violet-500/10 text-violet-700 dark:text-violet-300',
  },
};

const ROLE_LABELS: Record<DesignBaselineRole, string> = {
  GENERATION_PLAN: 'Plan de generación',
  CONCEPTUAL_DOMAIN_MODEL: 'Modelo conceptual',
  CLASS_DIAGRAM: 'Diagrama de clases',
  NAVIGATION_TREE: 'Navegación',
  UI_BLUEPRINT: 'Plano de interfaz',
  DESIGN_THEME: 'Tema y colores',
  MOCKUP: 'Boceto',
  SOFTWARE_ARCHITECTURE: 'Arquitectura de software',
  SYSTEM_ARCHITECTURE: 'Arquitectura de sistema',
};

const STRUCTURED_ROLES: StructuredRole[] = [
  'GENERATION_PLAN',
  'CONCEPTUAL_DOMAIN_MODEL',
  'CLASS_DIAGRAM',
  'NAVIGATION_TREE',
  'UI_BLUEPRINT',
  'DESIGN_THEME',
  'SOFTWARE_ARCHITECTURE',
  'SYSTEM_ARCHITECTURE',
];

const REQUIRED = new Set<DesignBaselineRole>(REQUIRED_DESIGN_BASELINE_ROLES);

const NAME_SUGGESTIONS = ['Diseño Aprobado v1', 'Línea Base UI Final', 'Release Candidate UI'];

interface Option {
  versionId: string;
  label: string;
}

function DesignBaselineContent({ projectId }: { projectId: string }) {
  const queryClient = useQueryClient();
  const structured = useQueries({
    queries: STRUCTURED_ROLES.map((role) => ({
      queryKey: ['structured-analysis', role, projectId],
      queryFn: () => api.structuredAnalysis.list(projectId, role),
    })),
  });
  const mockups = useQuery({
    queryKey: ['mockups', projectId],
    queryFn: () => api.mockups.list(projectId),
  });
  const baselines = useQuery({
    queryKey: ['design-baselines', projectId],
    queryFn: () => api.designBaselines.list(projectId),
  });

  const [selected, setSelected] = useState<Partial<Record<DesignBaselineRole, string>>>({});
  const [label, setLabel] = useState('');
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Only the currently approved version of each artifact can be frozen.
  const options = useMemo(() => {
    const result = {} as Record<DesignBaselineRole, Option[]>;
    STRUCTURED_ROLES.forEach((role, index) => {
      result[role] = (structured[index]?.data?.items ?? [])
        .filter((item) => item.version.status === 'APPROVED')
        .map((item) => ({
          versionId: item.version.id,
          label: `${item.code} · ${item.title} (v${item.version.versionNumber})`,
        }));
    });
    return result;
  }, [structured]);

  // The theme and class diagram are preselected when there is one: they are mandatory for new
  // projects (the API enforces it) and optional for older ones.
  const choice = (role: DesignBaselineRole) =>
    role in selected
      ? selected[role]
      : REQUIRED.has(role) || role === 'DESIGN_THEME' || role === 'CLASS_DIAGRAM'
        ? options[role]?.[0]?.versionId
        : undefined;

  const uiBlueprintVersionId = choice('UI_BLUEPRINT');
  const themeVersionId = choice('DESIGN_THEME') ?? null;

  // The frozen mockup must come from the frozen UI blueprint and theme versions.
  const mockupOptions: Option[] = (mockups.data?.items ?? [])
    .filter(
      (m) =>
        m.version.status === 'APPROVED' &&
        m.uiBlueprintVersionId === uiBlueprintVersionId &&
        m.designThemeVersionId === themeVersionId,
    )
    .map((m) => ({ versionId: m.version.id, label: `${m.code} (v${m.version.versionNumber})` }));

  const mockupVersionId =
    selected.MOCKUP && mockupOptions.some((o) => o.versionId === selected.MOCKUP)
      ? selected.MOCKUP
      : mockupOptions[0]?.versionId;

  const missing = [...REQUIRED].filter((role) =>
    role === 'MOCKUP' ? !mockupVersionId : !choice(role),
  );
  const loading = structured.some((q) => q.isLoading) || mockups.isLoading;

  const totalRequired = REQUIRED.size;
  const readyRequired = totalRequired - missing.length;
  const isGateReady = missing.length === 0 && !loading;

  async function approve() {
    const versions = Object.fromEntries(
      [...STRUCTURED_ROLES.map((role) => [role, choice(role)]), ['MOCKUP', mockupVersionId]].filter(
        ([, value]) => Boolean(value),
      ),
    ) as CreateDesignBaselineRequest['versions'];
    setSubmitting(true);
    try {
      await api.designBaselines.create(projectId, {
        label: label.trim(),
        note: note.trim() || undefined,
        versions,
      });
      toast.success('Diseño aprobado y congelado.');
      setLabel('');
      setNote('');
      await queryClient.invalidateQueries({ queryKey: ['design-baselines', projectId] });
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'No se pudo aprobar el diseño.');
    } finally {
      setSubmitting(false);
    }
  }

  const renderRoleCard = (role: DesignBaselineRole, list: Option[], value: string | undefined) => {
    const config = ROLE_CONFIG[role];
    const Icon = config.icon;
    const isRequired = REQUIRED.has(role);
    const isReady = Boolean(value);

    return (
      <div
        key={role}
        className={`flex flex-col justify-between rounded-xl border p-3.5 shadow-2xs transition-all ${
          isReady
            ? 'border-border/80 bg-card hover:border-border'
            : isRequired
              ? 'border-amber-500/40 bg-amber-500/5'
              : 'border-border/50 bg-muted/20 opacity-80'
        }`}
      >
        <div className="flex flex-col gap-2">
          {/* Header de la tarjeta */}
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-center gap-2">
              <span
                className={`flex size-7 shrink-0 items-center justify-center rounded-lg ${config.badgeColor}`}
              >
                <Icon className="size-4" />
              </span>
              <div>
                <span className="font-semibold text-xs text-foreground block">{config.label}</span>
                <span className="text-[10px] text-muted-foreground">
                  {isRequired ? 'Requerido para la compuerta' : 'Opcional'}
                </span>
              </div>
            </div>

            <span
              className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-semibold ${
                isReady
                  ? 'border border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
                  : isRequired
                    ? 'border border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300'
                    : 'border border-border/50 bg-muted text-muted-foreground'
              }`}
            >
              {isReady ? (
                <>
                  <CheckCircle2 className="size-2.5 text-emerald-600 dark:text-emerald-400" />
                  Listo
                </>
              ) : isRequired ? (
                <>
                  <Clock className="size-2.5 text-amber-600 dark:text-amber-400" />
                  Pendiente
                </>
              ) : (
                'Opcional'
              )}
            </span>
          </div>

          {/* Form label and select (Preserves test findByLabelText) */}
          <label className="flex flex-col gap-1 text-xs mt-1">
            <span className="text-muted-foreground text-[11px] font-medium sr-only">
              {ROLE_LABELS[role]}
              {isRequired ? '' : ' (opcional)'}
            </span>

            {list.length === 0 && isRequired ? (
              <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-2 text-xs text-amber-700 dark:text-amber-400">
                {role === 'MOCKUP'
                  ? 'No hay un boceto aprobado generado desde el plano de interfaz y el tema seleccionados.'
                  : `Aún no hay una versión aprobada de ${ROLE_LABELS[role].toLowerCase()}.`}
              </div>
            ) : (
              <select
                className="h-8 w-full rounded-md border border-input bg-background/80 px-2 py-1 text-xs font-mono shadow-2xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                value={value ?? ''}
                onChange={(e) =>
                  setSelected((prev) => ({ ...prev, [role]: e.target.value || undefined }))
                }
              >
                {isRequired ? null : <option value="">No incluir</option>}
                {list.map((option) => (
                  <option key={option.versionId} value={option.versionId}>
                    {option.label}
                  </option>
                ))}
              </select>
            )}
          </label>
        </div>
      </div>
    );
  };

  return (
    <div className="flex flex-col gap-6">
      <PageHeading title="Aprobación de diseño" projectId={projectId} />

      {/* KPI Cards de la Compuerta de Diseño */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {/* Estado de la Compuerta */}
        <div className="flex flex-col justify-between rounded-xl border border-border/80 bg-card p-4 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground">
              Estado de la Compuerta
            </span>
            <span
              className={`flex size-7 items-center justify-center rounded-lg ${
                isGateReady
                  ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400'
                  : 'bg-amber-500/10 text-amber-700 dark:text-amber-400'
              }`}
            >
              {isGateReady ? <CheckCircle2 className="size-4" /> : <Clock className="size-4" />}
            </span>
          </div>
          <div className="mt-2">
            <span
              className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                isGateReady
                  ? 'border border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
                  : 'border border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300'
              }`}
            >
              {isGateReady ? 'Lista para congelar' : 'Faltan aprobaciones'}
            </span>
          </div>
        </div>

        {/* Artefactos Requeridos */}
        <div className="flex flex-col justify-between rounded-xl border border-border/80 bg-card p-4 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground">Artefactos Requeridos</span>
            <span className="flex size-7 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Layers className="size-4" />
            </span>
          </div>
          <div className="mt-2 flex items-baseline gap-1.5">
            <span className="text-xl font-bold text-foreground">
              {readyRequired} / {totalRequired}
            </span>
            <span className="text-xs text-muted-foreground">aprobados</span>
          </div>
        </div>

        {/* Boceto UI Sincronizado */}
        <div className="flex flex-col justify-between rounded-xl border border-border/80 bg-card p-4 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground">Boceto Visual</span>
            <span className="flex size-7 items-center justify-center rounded-lg bg-purple-500/10 text-purple-700 dark:text-purple-400">
              <FileImage className="size-4" />
            </span>
          </div>
          <div className="mt-2">
            <span
              className={`inline-flex items-center gap-1 text-xs font-semibold ${
                mockupVersionId
                  ? 'text-emerald-700 dark:text-emerald-400'
                  : 'text-amber-700 dark:text-amber-400'
              }`}
            >
              {mockupVersionId ? (
                <>
                  <CheckCircle2 className="size-3.5" />
                  Sincronizado con UI y Tema
                </>
              ) : (
                <>
                  <AlertCircle className="size-3.5" />
                  Requiere boceto compatible
                </>
              )}
            </span>
          </div>
        </div>

        {/* Líneas Base Congeladas */}
        <div className="flex flex-col justify-between rounded-xl border border-border/80 bg-card p-4 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground">
              Líneas Base Congeladas
            </span>
            <span className="flex size-7 items-center justify-center rounded-lg bg-blue-500/10 text-blue-700 dark:text-blue-400">
              <Lock className="size-4" />
            </span>
          </div>
          <div className="mt-2 flex items-baseline gap-1.5">
            <span className="text-xl font-bold text-foreground">
              {baselines.data?.items?.length ?? 0}
            </span>
            <span className="text-xs text-muted-foreground">registradas</span>
          </div>
        </div>
      </div>

      {/* Banner Explicativo */}
      <div className="rounded-xl border border-border/70 bg-muted/20 p-4 text-xs text-muted-foreground leading-relaxed sm:text-sm">
        <p>
          Congele las versiones aprobadas exactas que definen el sistema. La generación de código
          solo puede partir de un diseño aprobado aquí, y una línea base aprobada no se modifica: si
          el diseño cambia, apruebe una nueva.
        </p>
      </div>

      {/* Sección Formulario: Nueva Línea Base */}
      <section className="flex flex-col gap-5 rounded-xl border border-border bg-card p-5 shadow-xs">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/60 pb-3">
          <div className="flex items-center gap-2">
            <span className="flex size-7 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <ShieldCheck className="size-4" />
            </span>
            <h2 className="text-sm font-semibold text-foreground">Nueva línea base de diseño</h2>
          </div>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/25 bg-primary/10 px-2.5 py-0.5 text-[11px] font-semibold text-primary">
            Compuerta de Control Humano (DEC-095)
          </span>
        </div>

        <QueryState isLoading={loading} error={null}>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {STRUCTURED_ROLES.map((role) =>
              renderRoleCard(role, options[role] ?? [], choice(role)),
            )}
            {renderRoleCard('MOCKUP', mockupOptions, mockupVersionId)}
          </div>
        </QueryState>

        {/* Nombre con chips de sugerencia */}
        <div className="flex flex-col gap-2 pt-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <label htmlFor="baseline-name-input" className="text-xs font-semibold text-foreground">
              Nombre de la línea base:
            </label>
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-[11px] text-muted-foreground flex items-center gap-1 mr-1">
                <Tag className="size-3 text-muted-foreground" />
                Sugerencias:
              </span>
              {NAME_SUGGESTIONS.map((sug) => (
                <button
                  key={sug}
                  type="button"
                  onClick={() => setLabel(sug)}
                  className="rounded-full border border-border/70 bg-muted/50 px-2 py-0.5 text-[10px] font-medium text-foreground hover:border-primary/50 hover:bg-primary/10 hover:text-primary transition-colors"
                >
                  {sug}
                </button>
              ))}
            </div>
          </div>

          <input
            id="baseline-name-input"
            placeholder="Nombre (p. ej. Diseño aprobado v1)"
            className="h-9 w-full rounded-md border border-input bg-background px-3 text-xs placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
          />
        </div>

        {/* Nota o Excepciones */}
        <div className="flex flex-col gap-1.5">
          <label htmlFor="baseline-note-input" className="text-xs font-semibold text-foreground">
            Nota o justificación de cambios (opcional):
          </label>
          <textarea
            id="baseline-note-input"
            rows={2}
            placeholder="Nota o excepciones justificadas (opcional)"
            className="w-full rounded-md border border-input bg-background p-2.5 text-xs placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        </div>

        {/* Mensaje de Faltantes */}
        {missing.length > 0 && !loading ? (
          <div className="flex items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-700 dark:text-amber-300">
            <AlertTriangle className="size-4 shrink-0 text-amber-600 dark:text-amber-400" />
            <p>Falta: {missing.map((role) => ROLE_LABELS[role].toLowerCase()).join(', ')}.</p>
          </div>
        ) : null}

        {/* Botón de Aprobación */}
        <div className="flex items-center justify-between pt-1">
          <Button
            type="button"
            className="gap-2 font-semibold shadow-xs"
            disabled={submitting || missing.length > 0 || !label.trim()}
            onClick={approve}
          >
            <Lock className="size-4" aria-hidden="true" />
            {submitting ? 'Aprobando…' : 'Aprobar y congelar diseño'}
          </Button>

          {isGateReady && label.trim() ? (
            <span className="text-xs text-emerald-600 dark:text-emerald-400 flex items-center gap-1 font-medium">
              <CheckCircle2 className="size-3.5" />
              Todo listo para congelar la línea base
            </span>
          ) : null}
        </div>
      </section>

      {/* Historial de Líneas Base Congeladas */}
      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
          <Lock className="size-4 text-primary" />
          Líneas base de diseño aprobadas
        </h2>

        <QueryState isLoading={baselines.isLoading} error={baselines.error}>
          {baselines.data?.items.length ? (
            <ul className="flex flex-col gap-3">
              {baselines.data.items.map((baseline, index) => (
                <li
                  key={baseline.id}
                  className={`flex flex-col gap-3 rounded-xl border p-4 shadow-2xs transition-all ${
                    index === 0
                      ? 'border-primary/40 bg-linear-to-br from-primary/5 via-card to-background ring-1 ring-primary/20'
                      : 'border-border bg-card'
                  }`}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/40 pb-2">
                    <div className="flex items-center gap-2">
                      <span className="flex size-6 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                        <Lock className="size-3.5" />
                      </span>
                      <strong className="text-sm text-foreground">{baseline.label}</strong>
                    </div>

                    <div className="flex items-center gap-2">
                      {index === 0 ? (
                        <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-0.5 text-[10px] font-semibold text-emerald-700 dark:text-emerald-300">
                          <CheckCircle2 className="size-2.5" />
                          Vigente para construcción
                        </span>
                      ) : null}
                      <span className="text-xs text-muted-foreground flex items-center gap-1">
                        <Clock className="size-3" />
                        {new Date(baseline.createdAt).toLocaleString('es-EC')}
                      </span>
                    </div>
                  </div>

                  {baseline.note ? (
                    <div className="rounded-lg border border-border/50 bg-muted/30 p-2.5 text-xs text-foreground">
                      <strong className="text-muted-foreground font-medium">Nota: </strong>
                      {baseline.note}
                    </div>
                  ) : null}

                  <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 pt-1">
                    {baseline.entries.map((entry) => {
                      const config = ROLE_CONFIG[entry.role];
                      const Icon = config.icon;

                      return (
                        <div
                          key={entry.role}
                          className="flex items-center justify-between gap-2 rounded-lg border border-border/60 bg-background/80 p-2 shadow-2xs text-xs"
                        >
                          <div className="flex items-center gap-1.5 min-w-0">
                            <Icon className={`size-3.5 shrink-0 ${config.color}`} />
                            <span className="text-muted-foreground truncate font-medium">
                              {ROLE_LABELS[entry.role]}:
                            </span>
                          </div>
                          <span
                            className={`inline-flex items-center rounded px-1.5 py-0.5 font-mono text-[10px] font-semibold shrink-0 ${config.badgeColor}`}
                          >
                            {entry.code} v{entry.versionNumber}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState title="Aún no hay un diseño aprobado">
              Apruebe el plan de generación, el modelo conceptual y el diseño de interfaz, y
              congélelos aquí.
            </EmptyState>
          )}
        </QueryState>
      </section>

      <ConstructionFooter projectId={projectId} step={3} />
    </div>
  );
}

export default function DesignBaselinePage() {
  return (
    <RequireActiveProject>
      {(projectId) => <DesignBaselineContent projectId={projectId} />}
    </RequireActiveProject>
  );
}
