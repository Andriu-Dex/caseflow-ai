'use client';

import { useState, type ReactNode } from 'react';
import { toast } from 'sonner';
import { Plus, Trash2 } from 'lucide-react';
import {
  CONCEPTUAL_CARDINALITIES,
  type ConceptualDomainModelContent,
  type GenerationPlanContent,
} from '@caseflow-ai/contracts';
import { Button } from '@caseflow-ai/ui';
import { ApiError } from '../lib/api';
import { csv, useRows } from '../lib/use-rows';
import { TagInput } from './tag-input';
import { ManualFormShell, rowId, save, type FormProps } from './structured-manual-forms';

// Manual, non-AI editors for the construction design artifacts (AGENTS.md §4.6):
// every field of the Generation Plan and Conceptual Domain Model is editable as
// structured rows, never as raw JSON.

const input = 'rounded-md border border-input px-2 py-1 text-sm';
const lines = (value: string) =>
  value
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

function Row({ children, onRemove }: { children: ReactNode; onRemove: () => void }) {
  return (
    <div className="flex flex-wrap items-start gap-2 rounded-md border border-border p-2 text-sm">
      {children}
      <Button
        variant="ghost"
        size="icon-xs"
        type="button"
        aria-label="Quitar fila"
        onClick={onRemove}
        className="ml-auto text-muted-foreground hover:text-destructive"
      >
        <Trash2 className="size-3.5" aria-hidden="true" />
      </Button>
    </div>
  );
}

function Section({
  title,
  onAdd,
  addLabel,
  children,
}: {
  title: string;
  onAdd?: () => void;
  addLabel?: string;
  children: ReactNode;
}) {
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-1 text-sm font-medium text-foreground">{title}</legend>
      {children}
      {onAdd ? (
        <Button type="button" variant="outline" size="sm" className="self-start" onClick={onAdd}>
          <Plus className="size-3.5" aria-hidden="true" /> {addLabel}
        </Button>
      ) : null}
    </fieldset>
  );
}

type ModuleRow = {
  localId?: string;
  name: string;
  purpose: string;
  entityNames: string;
  requirementCodes: string;
  useCaseCodes: string;
  sourceCodes: string;
};
type WorkflowRow = {
  localId?: string;
  name: string;
  steps: string;
  useCaseCodes: string;
  sourceCodes: string;
};

export function GenerationPlanManualForm({ projectId, initial, onCreated, onCancel }: FormProps) {
  const p = initial?.content as GenerationPlanContent | undefined;
  const [title, setTitle] = useState(initial?.title ?? '');
  const [summary, setSummary] = useState(p?.summary ?? '');
  const modules = useRows<ModuleRow>(
    p?.modules.map((m) => ({
      localId: m.localId,
      name: m.name,
      purpose: m.purpose,
      entityNames: m.entityNames.join(', '),
      requirementCodes: m.relatedRequirementCodes.join(', '),
      useCaseCodes: m.relatedUseCaseCodes.join(', '),
      sourceCodes: m.relatedSourceCodes?.join(', ') ?? '',
    })) ?? [
      {
        name: '',
        purpose: '',
        entityNames: '',
        requirementCodes: '',
        useCaseCodes: '',
        sourceCodes: '',
      },
    ],
  );
  const actors = useRows(
    p?.actors.map((a) => ({
      name: a.name,
      description: a.description ?? '',
      permissions: a.permissions.join(', '),
    })) ?? [],
  );
  const workflows = useRows<WorkflowRow>(
    p?.workflows.map((w) => ({
      localId: w.localId,
      name: w.name,
      steps: w.steps.join('\n'),
      useCaseCodes: w.relatedUseCaseCodes.join(', '),
      sourceCodes: w.relatedSourceCodes?.join(', ') ?? '',
    })) ?? [],
  );
  const screens = useRows(
    p?.screens.map((s) => ({
      name: s.name,
      moduleLocalId: s.moduleLocalId ?? '',
      purpose: s.purpose,
      sourceCodes: s.relatedSourceCodes?.join(', ') ?? '',
    })) ?? [],
  );
  const integrations = useRows(p?.integrations ?? []);
  const risks = useRows(
    p?.risks.map((r) => ({ description: r.description, mitigation: r.mitigation ?? '' })) ?? [],
  );
  const [authRequired, setAuthRequired] = useState(p?.authentication.required ?? true);
  const [authStrategy, setAuthStrategy] = useState(p?.authentication.strategy ?? '');
  const [authRoles, setAuthRoles] = useState(p?.authentication.roles.join(', ') ?? '');
  const [constraints, setConstraints] = useState(p?.technicalConstraints.join('\n') ?? '');
  const [submitting, setSubmitting] = useState(false);
  const moduleIds = modules.rows.map((m, i) => rowId(m, 'mod', i));

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      const content: GenerationPlanContent = {
        summary,
        modules: modules.rows.map((m, i) => ({
          localId: moduleIds[i]!,
          name: m.name,
          purpose: m.purpose,
          entityNames: csv(m.entityNames),
          relatedRequirementCodes: csv(m.requirementCodes),
          relatedUseCaseCodes: csv(m.useCaseCodes),
          relatedSourceCodes: csv(m.sourceCodes),
        })),
        actors: actors.rows.map((a) => ({
          name: a.name,
          description: a.description || undefined,
          permissions: csv(a.permissions),
        })),
        workflows: workflows.rows.map((w, i) => ({
          localId: rowId(w, 'flow', i),
          name: w.name,
          steps: lines(w.steps),
          relatedUseCaseCodes: csv(w.useCaseCodes),
          relatedSourceCodes: csv(w.sourceCodes),
        })),
        screens: screens.rows.map((s) => ({
          name: s.name,
          moduleLocalId: s.moduleLocalId || undefined,
          purpose: s.purpose,
          relatedSourceCodes: csv(s.sourceCodes),
        })),
        integrations: integrations.rows,
        authentication: {
          required: authRequired,
          strategy: authStrategy.trim() || undefined,
          roles: csv(authRoles),
        },
        technicalConstraints: lines(constraints),
        risks: risks.rows.map((r) => ({
          description: r.description,
          mitigation: r.mitigation || undefined,
        })),
      };
      await save(projectId, 'GENERATION_PLAN', initial, title, content);
      onCreated();
    } catch (err) {
      toast.error(
        err instanceof ApiError ? err.message : 'No se pudo guardar el plan de generación.',
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <ManualFormShell
      title={initial ? `Editar ${initial.code}` : 'Nuevo plan de generación'}
      onSubmit={handleSubmit}
      submitting={submitting}
      editing={Boolean(initial)}
      onCancel={onCancel}
    >
      <input
        required
        placeholder="Título"
        className={input}
        value={title}
        onChange={(e) => setTitle(e.target.value)}
      />
      <textarea
        required
        rows={3}
        placeholder="Resumen: qué sistema se va a construir"
        className={input}
        value={summary}
        onChange={(e) => setSummary(e.target.value)}
      />

      <Section
        title="Módulos funcionales"
        addLabel="Agregar módulo"
        onAdd={() =>
          modules.add({
            name: '',
            purpose: '',
            entityNames: '',
            requirementCodes: '',
            useCaseCodes: '',
            sourceCodes: '',
          })
        }
      >
        {modules.rows.map((m, i) => (
          <Row
            key={moduleIds[i]}
            onRemove={() => (modules.rows.length > 1 ? modules.remove(i) : undefined)}
          >
            <input
              required
              placeholder="Nombre del módulo"
              className={`${input} w-44`}
              value={m.name}
              onChange={(e) => modules.update(i, { name: e.target.value })}
            />
            <input
              required
              placeholder="Propósito"
              className={`${input} flex-1`}
              value={m.purpose}
              onChange={(e) => modules.update(i, { purpose: e.target.value })}
            />
            <TagInput
              placeholder="Entidades (coma)"
              className="w-full"
              value={m.entityNames}
              onChange={(val) => modules.update(i, { entityNames: val })}
            />
            <TagInput
              placeholder="Requisitos (RF-…)"
              className="w-56"
              value={m.requirementCodes}
              onChange={(val) => modules.update(i, { requirementCodes: val })}
            />
            <TagInput
              placeholder="Casos de uso (CU-…)"
              className="w-56"
              value={m.useCaseCodes}
              onChange={(val) => modules.update(i, { useCaseCodes: val })}
            />
            <TagInput
              placeholder="Fuentes (códigos)"
              className="w-56"
              value={m.sourceCodes}
              onChange={(val) => modules.update(i, { sourceCodes: val })}
            />
          </Row>
        ))}
      </Section>

      <Section
        title="Actores y permisos"
        addLabel="Agregar actor"
        onAdd={() => actors.add({ name: '', description: '', permissions: '' })}
      >
        {actors.rows.map((a, i) => (
          <Row key={i} onRemove={() => actors.remove(i)}>
            <input
              required
              placeholder="Actor"
              className={`${input} w-40`}
              value={a.name}
              onChange={(e) => actors.update(i, { name: e.target.value })}
            />
            <input
              placeholder="Descripción (opcional)"
              className={`${input} flex-1`}
              value={a.description}
              onChange={(e) => actors.update(i, { description: e.target.value })}
            />
            <TagInput
              placeholder="Permisos (coma)"
              className="w-full"
              value={a.permissions}
              onChange={(val) => actors.update(i, { permissions: val })}
            />
          </Row>
        ))}
      </Section>

      <Section
        title="Flujos principales"
        addLabel="Agregar flujo"
        onAdd={() => workflows.add({ name: '', steps: '', useCaseCodes: '', sourceCodes: '' })}
      >
        {workflows.rows.map((w, i) => (
          <Row key={rowId(w, 'flow', i)} onRemove={() => workflows.remove(i)}>
            <input
              required
              placeholder="Nombre del flujo"
              className={`${input} w-52`}
              value={w.name}
              onChange={(e) => workflows.update(i, { name: e.target.value })}
            />
            <textarea
              required
              rows={3}
              placeholder="Pasos (uno por línea)"
              className={`${input} flex-1`}
              value={w.steps}
              onChange={(e) => workflows.update(i, { steps: e.target.value })}
            />
            <TagInput
              placeholder="Casos de uso (CU-…)"
              className="w-56"
              value={w.useCaseCodes}
              onChange={(val) => workflows.update(i, { useCaseCodes: val })}
            />
            <TagInput
              placeholder="Fuentes (códigos)"
              className="w-56"
              value={w.sourceCodes}
              onChange={(val) => workflows.update(i, { sourceCodes: val })}
            />
          </Row>
        ))}
      </Section>

      <Section
        title="Pantallas"
        addLabel="Agregar pantalla"
        onAdd={() => screens.add({ name: '', moduleLocalId: '', purpose: '', sourceCodes: '' })}
      >
        {screens.rows.map((s, i) => (
          <Row key={i} onRemove={() => screens.remove(i)}>
            <input
              required
              placeholder="Pantalla"
              className={`${input} w-44`}
              value={s.name}
              onChange={(e) => screens.update(i, { name: e.target.value })}
            />
            <select
              aria-label="Módulo de la pantalla"
              className={input}
              value={s.moduleLocalId}
              onChange={(e) => screens.update(i, { moduleLocalId: e.target.value })}
            >
              <option value="">Sin módulo</option>
              {modules.rows.map((m, index) => (
                <option key={moduleIds[index]} value={moduleIds[index]}>
                  {m.name || `Módulo ${index + 1}`}
                </option>
              ))}
            </select>
            <input
              required
              placeholder="Propósito"
              className={`${input} flex-1`}
              value={s.purpose}
              onChange={(e) => screens.update(i, { purpose: e.target.value })}
            />
            <TagInput
              placeholder="Fuentes (códigos)"
              className="w-56"
              value={s.sourceCodes}
              onChange={(val) => screens.update(i, { sourceCodes: val })}
            />
          </Row>
        ))}
      </Section>

      <Section title="Autenticación y autorización">
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={authRequired}
            onChange={(e) => setAuthRequired(e.target.checked)}
          />
          El sistema requiere inicio de sesión
        </label>
        {authRequired ? (
          <div className="flex flex-wrap gap-2">
            <input
              placeholder="Estrategia (p. ej. correo y contraseña)"
              className={`${input} flex-1`}
              value={authStrategy}
              onChange={(e) => setAuthStrategy(e.target.value)}
            />
            <TagInput
              placeholder="Roles (coma)"
              className="w-64"
              value={authRoles}
              onChange={setAuthRoles}
            />
          </div>
        ) : null}
      </Section>

      <Section
        title="Integraciones externas"
        addLabel="Agregar integración"
        onAdd={() => integrations.add({ name: '', purpose: '' })}
      >
        {integrations.rows.map((it, i) => (
          <Row key={i} onRemove={() => integrations.remove(i)}>
            <input
              required
              placeholder="Servicio"
              className={`${input} w-44`}
              value={it.name}
              onChange={(e) => integrations.update(i, { name: e.target.value })}
            />
            <input
              required
              placeholder="Para qué se usa"
              className={`${input} flex-1`}
              value={it.purpose}
              onChange={(e) => integrations.update(i, { purpose: e.target.value })}
            />
          </Row>
        ))}
      </Section>

      <Section title="Restricciones técnicas">
        <textarea
          rows={3}
          placeholder="Una por línea"
          className={input}
          value={constraints}
          onChange={(e) => setConstraints(e.target.value)}
        />
      </Section>

      <Section
        title="Riesgos"
        addLabel="Agregar riesgo"
        onAdd={() => risks.add({ description: '', mitigation: '' })}
      >
        {risks.rows.map((r, i) => (
          <Row key={i} onRemove={() => risks.remove(i)}>
            <input
              required
              placeholder="Riesgo"
              className={`${input} flex-1`}
              value={r.description}
              onChange={(e) => risks.update(i, { description: e.target.value })}
            />
            <input
              placeholder="Mitigación (opcional)"
              className={`${input} flex-1`}
              value={r.mitigation}
              onChange={(e) => risks.update(i, { mitigation: e.target.value })}
            />
          </Row>
        ))}
      </Section>
    </ManualFormShell>
  );
}

type EntityRow = {
  localId?: string;
  name: string;
  description: string;
  moduleName: string;
  // One attribute per line; a trailing "?" marks it optional (e.g. "nota?").
  attributes: string;
  sourceCodes: string;
};

const CARDINALITY_LABELS: Record<(typeof CONCEPTUAL_CARDINALITIES)[number], string> = {
  ONE_TO_ONE: '1 a 1',
  ONE_TO_MANY: '1 a muchos',
  MANY_TO_MANY: 'Muchos a muchos',
};

export function ConceptualDomainModelManualForm({
  projectId,
  initial,
  onCreated,
  onCancel,
}: FormProps) {
  const m = initial?.content as ConceptualDomainModelContent | undefined;
  const [title, setTitle] = useState(initial?.title ?? '');
  const entities = useRows<EntityRow>(
    m?.entities.map((e) => ({
      localId: e.localId,
      name: e.name,
      description: e.description,
      moduleName: e.moduleName ?? '',
      attributes: e.attributes.map((a) => `${a.name}${a.required ? '' : '?'}`).join('\n'),
      sourceCodes: e.relatedSourceCodes?.join(', ') ?? '',
    })) ?? [{ name: '', description: '', moduleName: '', attributes: '', sourceCodes: '' }],
  );
  const relationships = useRows(
    m?.relationships.map((r) => ({ ...r, description: r.description ?? '' })) ?? [],
  );
  const [submitting, setSubmitting] = useState(false);
  const entityIds = entities.rows.map((e, i) => rowId(e, 'ent', i));

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      const content: ConceptualDomainModelContent = {
        entities: entities.rows.map((row, i) => ({
          localId: entityIds[i]!,
          name: row.name,
          description: row.description,
          moduleName: row.moduleName.trim() || undefined,
          attributes: lines(row.attributes).map((line) => ({
            name: line.replace(/\?$/, '').trim(),
            required: !line.endsWith('?'),
          })),
          relatedSourceCodes: csv(row.sourceCodes),
        })),
        relationships: relationships.rows
          .filter((r) => r.fromLocalId && r.toLocalId)
          .map((r) => ({ ...r, description: r.description || undefined })),
      };
      await save(projectId, 'CONCEPTUAL_DOMAIN_MODEL', initial, title, content);
      onCreated();
    } catch (err) {
      toast.error(
        err instanceof ApiError ? err.message : 'No se pudo guardar el modelo conceptual.',
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <ManualFormShell
      title={initial ? `Editar ${initial.code}` : 'Nuevo modelo conceptual'}
      onSubmit={handleSubmit}
      submitting={submitting}
      editing={Boolean(initial)}
      onCancel={onCancel}
    >
      <input
        required
        placeholder="Título"
        className={input}
        value={title}
        onChange={(e) => setTitle(e.target.value)}
      />
      <Section
        title="Entidades"
        addLabel="Agregar entidad"
        onAdd={() =>
          entities.add({
            name: '',
            description: '',
            moduleName: '',
            attributes: '',
            sourceCodes: '',
          })
        }
      >
        {entities.rows.map((row, i) => (
          <Row
            key={entityIds[i]}
            onRemove={() => (entities.rows.length > 1 ? entities.remove(i) : undefined)}
          >
            <input
              required
              placeholder="Entidad"
              className={`${input} w-40`}
              value={row.name}
              onChange={(e) => entities.update(i, { name: e.target.value })}
            />
            <input
              placeholder="Módulo (opcional)"
              className={`${input} w-40`}
              value={row.moduleName}
              onChange={(e) => entities.update(i, { moduleName: e.target.value })}
            />
            <input
              required
              placeholder="Descripción"
              className={`${input} flex-1`}
              value={row.description}
              onChange={(e) => entities.update(i, { description: e.target.value })}
            />
            <textarea
              required
              rows={3}
              placeholder={'Atributos, uno por línea (termine con ? si es opcional)'}
              className={`${input} w-full`}
              value={row.attributes}
              onChange={(e) => entities.update(i, { attributes: e.target.value })}
            />
            <TagInput
              placeholder="Fuentes (códigos)"
              className="w-56"
              value={row.sourceCodes}
              onChange={(val) => entities.update(i, { sourceCodes: val })}
            />
          </Row>
        ))}
      </Section>
      <Section
        title="Relaciones"
        addLabel="Agregar relación"
        onAdd={() =>
          relationships.add({
            fromLocalId: '',
            toLocalId: '',
            name: '',
            cardinality: 'ONE_TO_MANY',
            description: '',
          })
        }
      >
        {relationships.rows.map((r, i) => (
          <Row key={i} onRemove={() => relationships.remove(i)}>
            {(['fromLocalId', 'toLocalId'] as const).map((side) => (
              <select
                key={side}
                required
                aria-label={side === 'fromLocalId' ? 'Entidad origen' : 'Entidad destino'}
                className={input}
                value={r[side]}
                onChange={(e) => relationships.update(i, { [side]: e.target.value })}
              >
                <option value="">{side === 'fromLocalId' ? 'Origen' : 'Destino'}</option>
                {entities.rows.map((entity, index) => (
                  <option key={entityIds[index]} value={entityIds[index]}>
                    {entity.name || `Entidad ${index + 1}`}
                  </option>
                ))}
              </select>
            ))}
            <input
              required
              placeholder="Relación (p. ej. realiza)"
              className={`${input} w-40`}
              value={r.name}
              onChange={(e) => relationships.update(i, { name: e.target.value })}
            />
            <select
              aria-label="Cardinalidad"
              className={input}
              value={r.cardinality}
              onChange={(e) =>
                relationships.update(i, {
                  cardinality: e.target.value as (typeof CONCEPTUAL_CARDINALITIES)[number],
                })
              }
            >
              {CONCEPTUAL_CARDINALITIES.map((c) => (
                <option key={c} value={c}>
                  {CARDINALITY_LABELS[c]}
                </option>
              ))}
            </select>
          </Row>
        ))}
      </Section>
    </ManualFormShell>
  );
}
