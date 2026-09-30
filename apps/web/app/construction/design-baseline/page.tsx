'use client';

import { useMemo, useState } from 'react';
import { useQueries, useQuery, useQueryClient } from '@tanstack/react-query';
import { Lock, ShieldCheck } from 'lucide-react';
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
import { EmptyState } from '../../../components/artifact-actions';

type StructuredRole = Exclude<DesignBaselineRole, 'MOCKUP'>;

const ROLE_LABELS: Record<DesignBaselineRole, string> = {
  GENERATION_PLAN: 'Plan de generación',
  CONCEPTUAL_DOMAIN_MODEL: 'Modelo conceptual',
  NAVIGATION_TREE: 'Navegación',
  UI_BLUEPRINT: 'Plano de interfaz',
  MOCKUP: 'Boceto',
  SOFTWARE_ARCHITECTURE: 'Arquitectura de software',
  SYSTEM_ARCHITECTURE: 'Arquitectura de sistema',
};

const STRUCTURED_ROLES: StructuredRole[] = [
  'GENERATION_PLAN',
  'CONCEPTUAL_DOMAIN_MODEL',
  'NAVIGATION_TREE',
  'UI_BLUEPRINT',
  'SOFTWARE_ARCHITECTURE',
  'SYSTEM_ARCHITECTURE',
];

const REQUIRED = new Set<DesignBaselineRole>(REQUIRED_DESIGN_BASELINE_ROLES);

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

  const choice = (role: DesignBaselineRole) =>
    selected[role] ?? (REQUIRED.has(role) ? options[role]?.[0]?.versionId : undefined);
  const uiBlueprintVersionId = choice('UI_BLUEPRINT');
  // The frozen mockup must come from the frozen UI blueprint version.
  const mockupOptions: Option[] = (mockups.data?.items ?? [])
    .filter(
      (m) => m.version.status === 'APPROVED' && m.uiBlueprintVersionId === uiBlueprintVersionId,
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

  const select = (role: DesignBaselineRole, list: Option[], value: string | undefined) => (
    <label key={role} className="flex flex-col gap-1 text-sm">
      <span className="font-medium">
        {ROLE_LABELS[role]}
        {REQUIRED.has(role) ? '' : ' (opcional)'}
      </span>
      {list.length === 0 && REQUIRED.has(role) ? (
        <span className="text-xs text-amber-600 dark:text-amber-400">
          {role === 'MOCKUP'
            ? 'No hay un boceto aprobado generado desde el plano de interfaz seleccionado.'
            : `Aún no hay una versión aprobada de ${ROLE_LABELS[role].toLowerCase()}.`}
        </span>
      ) : (
        <select
          className="rounded-md border border-input bg-background px-2 py-1.5"
          value={value ?? ''}
          onChange={(e) =>
            setSelected((prev) => ({ ...prev, [role]: e.target.value || undefined }))
          }
        >
          {REQUIRED.has(role) ? null : <option value="">No incluir</option>}
          {list.map((option) => (
            <option key={option.versionId} value={option.versionId}>
              {option.label}
            </option>
          ))}
        </select>
      )}
    </label>
  );

  return (
    <div className="flex flex-col gap-6">
      <PageHeading title="Aprobación de diseño" projectId={projectId} />
      <p className="text-sm text-muted-foreground">
        Congele las versiones aprobadas exactas que definen el sistema. La generación de código solo
        puede partir de un diseño aprobado aquí, y una línea base aprobada no se modifica: si el
        diseño cambia, apruebe una nueva.
      </p>

      <section className="flex flex-col gap-4 rounded-lg border border-border bg-card p-4">
        <h2 className="flex items-center gap-2 text-sm font-semibold">
          <ShieldCheck className="size-4 text-primary" aria-hidden="true" /> Nueva línea base de
          diseño
        </h2>
        <QueryState isLoading={loading} error={null}>
          <div className="grid gap-3 sm:grid-cols-2">
            {STRUCTURED_ROLES.map((role) => select(role, options[role] ?? [], choice(role)))}
            {select('MOCKUP', mockupOptions, mockupVersionId)}
          </div>
        </QueryState>
        <input
          placeholder="Nombre (p. ej. Diseño aprobado v1)"
          className="rounded-md border border-input px-2 py-1.5 text-sm"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
        />
        <textarea
          rows={2}
          placeholder="Nota o excepciones justificadas (opcional)"
          className="rounded-md border border-input px-2 py-1.5 text-sm"
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
        {missing.length > 0 && !loading ? (
          <p className="text-xs text-muted-foreground">
            Falta: {missing.map((role) => ROLE_LABELS[role].toLowerCase()).join(', ')}.
          </p>
        ) : null}
        <Button
          type="button"
          className="self-start"
          disabled={submitting || missing.length > 0 || !label.trim()}
          onClick={approve}
        >
          <Lock className="size-4" aria-hidden="true" />
          {submitting ? 'Aprobando…' : 'Aprobar y congelar diseño'}
        </Button>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold">Líneas base de diseño aprobadas</h2>
        <QueryState isLoading={baselines.isLoading} error={baselines.error}>
          {baselines.data?.items.length ? (
            <ul className="flex flex-col gap-3">
              {baselines.data.items.map((baseline, index) => (
                <li key={baseline.id} className="rounded-lg border border-border bg-card p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <strong>{baseline.label}</strong>
                    <span className="text-xs text-muted-foreground">
                      {index === 0 ? 'Vigente · ' : ''}
                      {new Date(baseline.createdAt).toLocaleString('es-EC')}
                    </span>
                  </div>
                  {baseline.note ? (
                    <p className="mt-1 text-sm text-muted-foreground">{baseline.note}</p>
                  ) : null}
                  <ul className="mt-2 grid gap-1 text-sm sm:grid-cols-2">
                    {baseline.entries.map((entry) => (
                      <li key={entry.role}>
                        <span className="text-muted-foreground">{ROLE_LABELS[entry.role]}:</span>{' '}
                        <span className="font-mono text-xs">{entry.code}</span> v
                        {entry.versionNumber}
                      </li>
                    ))}
                  </ul>
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
