'use client';

import { useState, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Plus, Trash2 } from 'lucide-react';
import {
  IMPLEMENTATION_CRUD_OPERATIONS,
  IMPLEMENTATION_FIELD_TYPES,
  IMPLEMENTATION_HTTP_METHODS,
  IMPLEMENTATION_RELATION_KINDS,
  IMPLEMENTATION_ROUTE_KINDS,
  IMPLEMENTATION_TEST_KINDS,
  type ClassDiagramContent,
  type ImplementationPlanContent,
  type UiBlueprintContent,
} from '@caseflow-ai/contracts';
import { Button } from '@caseflow-ai/ui';
import { api, ApiError } from '../lib/api';
import { csv, useRows } from '../lib/use-rows';
import { TagInput } from './tag-input';
import { ManualFormShell, rowId, save, type FormProps } from './structured-manual-forms';

// Manual editor for the Implementation Plan (AGENTS.md §4.6): the whole plan —
// including the typed physical model — is editable as structured rows.

type Plan = ImplementationPlanContent;
type FieldType = (typeof IMPLEMENTATION_FIELD_TYPES)[number];

const input = 'rounded-md border border-input bg-background px-2 py-1 text-sm';
const FIELD_TYPE_LABELS: Record<FieldType, string> = {
  STRING: 'Texto',
  TEXT: 'Texto largo',
  INT: 'Entero',
  DECIMAL: 'Decimal',
  BOOLEAN: 'Sí/No',
  DATE: 'Fecha',
  DATETIME: 'Fecha y hora',
  ENUM: 'Lista de valores',
};
const RELATION_LABELS: Record<(typeof IMPLEMENTATION_RELATION_KINDS)[number], string> = {
  MANY_TO_ONE: 'Pertenece a (muchos a uno)',
  ONE_TO_ONE: 'Uno a uno',
  MANY_TO_MANY: 'Muchos a muchos',
};
const OPERATION_LABELS: Record<(typeof IMPLEMENTATION_CRUD_OPERATIONS)[number], string> = {
  LIST: 'Listar',
  GET: 'Consultar',
  CREATE: 'Crear',
  UPDATE: 'Editar',
  DELETE: 'Eliminar',
};

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
  id,
  title,
  hint,
  onAdd,
  addLabel,
  children,
}: {
  id?: string;
  title: string;
  hint?: string;
  onAdd?: () => void;
  addLabel?: string;
  children: ReactNode;
}) {
  return (
    <fieldset id={id} className="flex flex-col gap-2 scroll-mt-20">
      <legend className="mb-1 text-sm font-medium text-foreground">{title}</legend>
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
      {children}
      {onAdd ? (
        <Button type="button" variant="outline" size="sm" className="self-start" onClick={onAdd}>
          <Plus className="size-3.5" aria-hidden="true" /> {addLabel}
        </Button>
      ) : null}
    </fieldset>
  );
}

type FieldRow = {
  name: string;
  type: FieldType;
  required: boolean;
  unique: boolean;
  enumValues: string;
};
type RelationRow = Plan['entities'][number]['relations'][number];
type EntityRow = {
  localId?: string;
  name: string;
  moduleLocalId: string;
  classLocalId: string;
  description: string;
  fields: FieldRow[];
  relations: RelationRow[];
  operations: Plan['entities'][number]['operations'];
  readRoles: string;
  writeRoles: string;
  sourceCodes: string;
};

// A route action as edited: "op:CREATE" or "ep:POST /orders/:orderId/confirm".
type ActionRow = { label: string; target: string };
type RouteRow = Omit<Plan['routes'][number], 'actions' | 'entityLocalId' | 'screenLocalId'> & {
  entityLocalId: string;
  screenLocalId: string;
  actions: ActionRow[];
};
const toActionRow = (action: Plan['routes'][number]['actions'][number]): ActionRow => ({
  label: action.label,
  target: action.operation ? `op:${action.operation}` : `ep:${action.endpoint ?? ''}`,
});
const fromActionRow = (row: ActionRow): Plan['routes'][number]['actions'][number] =>
  row.target.startsWith('op:')
    ? {
        label: row.label,
        operation: row.target.slice(3) as (typeof IMPLEMENTATION_CRUD_OPERATIONS)[number],
      }
    : { label: row.label, endpoint: row.target.slice(3) };

// DEC-121: suggestions for the references to the approved class diagram and
// UI blueprint (the API checks them against the frozen design).
function useApproved(projectId: string, kind: 'CLASS_DIAGRAM' | 'UI_BLUEPRINT') {
  return useQuery({
    queryKey: ['structured-analysis', kind, projectId],
    queryFn: () => api.structuredAnalysis.list(projectId, kind),
    select: (data) => data.items.filter((item) => item.version.status === 'APPROVED'),
  });
}
function useDesignReferences(projectId: string) {
  const classes = useApproved(projectId, 'CLASS_DIAGRAM').data?.flatMap(
    (item) => (item.content as ClassDiagramContent).classes,
  );
  const screens = useApproved(projectId, 'UI_BLUEPRINT').data?.flatMap(
    (item) => (item.content as UiBlueprintContent).screens,
  );
  return { classes: classes ?? [], screens: screens ?? [] };
}

const emptyField = (): FieldRow => ({
  name: '',
  type: 'STRING',
  required: true,
  unique: false,
  enumValues: '',
});

function ModuleSelect({
  value,
  modules,
  onChange,
}: {
  value: string;
  modules: { id: string; name: string }[];
  onChange: (value: string) => void;
}) {
  return (
    <select
      required
      aria-label="Módulo"
      className={input}
      value={value}
      onChange={(e) => onChange(e.target.value)}
    >
      <option value="">Módulo…</option>
      {modules.map((m) => (
        <option key={m.id} value={m.id}>
          {m.name || m.id}
        </option>
      ))}
    </select>
  );
}

export function ImplementationPlanManualForm({
  projectId,
  initial,
  onCreated,
  onCancel,
}: FormProps) {
  const p = initial?.content as Plan | undefined;
  const design = useDesignReferences(projectId);
  const baselines = useQuery({
    queryKey: ['design-baselines', projectId],
    queryFn: () => api.designBaselines.list(projectId),
  });
  const [title, setTitle] = useState(initial?.title ?? '');
  const [baselineId, setBaselineId] = useState(p?.designBaselineId ?? '');
  const [authRequired, setAuthRequired] = useState(p?.authentication.required ?? true);
  const [roles, setRoles] = useState(p?.authentication.roles.join(', ') ?? '');
  const modules = useRows<{ localId?: string; name: string; description: string }>(
    p?.modules.map((m) => ({ localId: m.localId, name: m.name, description: m.description })) ?? [
      { name: '', description: '' },
    ],
  );
  const entities = useRows<EntityRow>(
    p?.entities.map((e) => ({
      localId: e.localId,
      name: e.name,
      moduleLocalId: e.moduleLocalId,
      classLocalId: e.classLocalId ?? '',
      description: e.description ?? '',
      fields: e.fields.map((f) => ({ ...f, enumValues: f.enumValues.join(', ') })),
      relations: e.relations,
      operations: e.operations,
      readRoles: e.readRoles.join(', '),
      writeRoles: e.writeRoles.join(', '),
      sourceCodes: e.relatedSourceCodes?.join(', ') ?? '',
    })) ?? [],
  );
  const endpoints = useRows(
    p?.customEndpoints.map((e) => ({
      ...e,
      entityLocalId: e.entityLocalId ?? '',
      roles: e.roles.join(', '),
    })) ?? [],
  );
  const routes = useRows<RouteRow>(
    p?.routes.map((r) => ({
      ...r,
      entityLocalId: r.entityLocalId ?? '',
      screenLocalId: r.screenLocalId ?? '',
      actions: r.actions.map(toActionRow),
    })) ?? [],
  );
  const envVars = useRows(p?.envVars ?? []);
  const tests = useRows(p?.tests ?? []);
  const [submitting, setSubmitting] = useState(false);

  const moduleIds = modules.rows.map((m, i) => rowId(m, 'mod', i));
  const moduleOptions = modules.rows.map((m, i) => ({ id: moduleIds[i]!, name: m.name }));
  const entityIds = entities.rows.map((e, i) => rowId(e, 'ent', i));
  const entityOptions = entities.rows.map((e, i) => ({ id: entityIds[i]!, name: e.name }));
  const updateField = (i: number, j: number, patch: Partial<FieldRow>) =>
    entities.update(i, {
      fields: entities.rows[i]!.fields.map((f, idx) => (idx === j ? { ...f, ...patch } : f)),
    });
  const updateRelation = (i: number, j: number, patch: Partial<RelationRow>) =>
    entities.update(i, {
      relations: entities.rows[i]!.relations.map((r, idx) => (idx === j ? { ...r, ...patch } : r)),
    });

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      const content: Plan = {
        designBaselineId: baselineId,
        authentication: { required: authRequired, roles: csv(roles) },
        modules: modules.rows.map((m, i) => ({
          localId: moduleIds[i]!,
          name: m.name,
          description: m.description,
        })),
        entities: entities.rows.map((row, i) => ({
          localId: entityIds[i]!,
          name: row.name,
          moduleLocalId: row.moduleLocalId,
          classLocalId: row.classLocalId.trim() || undefined,
          description: row.description || undefined,
          fields: row.fields.map((f) => ({
            name: f.name,
            type: f.type,
            required: f.required,
            unique: f.unique,
            enumValues: f.type === 'ENUM' ? csv(f.enumValues) : [],
          })),
          relations: row.relations,
          operations: row.operations,
          readRoles: csv(row.readRoles),
          writeRoles: csv(row.writeRoles),
          relatedSourceCodes: csv(row.sourceCodes),
        })),
        customEndpoints: endpoints.rows.map((e) => ({
          moduleLocalId: e.moduleLocalId,
          method: e.method,
          path: e.path,
          summary: e.summary,
          entityLocalId: e.entityLocalId || undefined,
          roles: csv(e.roles),
        })),
        routes: routes.rows.map((r) => ({
          path: r.path,
          screenName: r.screenName,
          moduleLocalId: r.moduleLocalId,
          kind: r.kind,
          entityLocalId: r.entityLocalId || undefined,
          screenLocalId: r.screenLocalId.trim() || undefined,
          actions: r.actions.filter((a) => a.label.trim()).map(fromActionRow),
        })),
        envVars: envVars.rows,
        tests: tests.rows,
      };
      await save(projectId, 'IMPLEMENTATION_PLAN', initial, title, content);
      onCreated();
    } catch (err) {
      toast.error(
        err instanceof ApiError ? err.message : 'No se pudo guardar el plan de implementación.',
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <ManualFormShell
      title={initial ? `Editar ${initial.code}` : 'Nuevo plan de implementación'}
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
      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium">Diseño aprobado del que parte</span>
        <select
          required
          className={input}
          value={baselineId}
          onChange={(e) => setBaselineId(e.target.value)}
        >
          <option value="">Seleccione una línea base de diseño…</option>
          {baselines.data?.items.map((b) => (
            <option key={b.id} value={b.id}>
              {b.label}
            </option>
          ))}
        </select>
      </label>

      <nav
        aria-label="Secciones del plan de implementación"
        className="flex flex-wrap items-center gap-1.5 rounded-lg border border-border/70 bg-muted/40 p-2 text-xs"
      >
        <span className="font-medium text-muted-foreground mr-1">Secciones:</span>
        {[
          { id: 'section-auth', label: 'Autenticación' },
          { id: 'section-modules', label: 'Módulos' },
          { id: 'section-entities', label: 'Entidades' },
          { id: 'section-endpoints', label: 'Endpoints' },
          { id: 'section-screens', label: 'Pantallas' },
          { id: 'section-env', label: 'Variables' },
          { id: 'section-tests', label: 'Pruebas' },
        ].map((sec) => (
          <button
            key={sec.id}
            type="button"
            onClick={() => {
              const el = document.getElementById(sec.id);
              if (el) {
                el.scrollIntoView({ behavior: 'smooth', block: 'start' });
              }
            }}
            className="rounded-md border border-border/80 bg-background/90 px-2.5 py-1 font-medium text-foreground transition-colors hover:bg-accent hover:text-accent-foreground shadow-2xs cursor-pointer"
          >
            {sec.label}
          </button>
        ))}
      </nav>

      <Section id="section-auth" title="Autenticación y roles">
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={authRequired}
            onChange={(e) => setAuthRequired(e.target.checked)}
          />
          El sistema requiere inicio de sesión
        </label>
        <TagInput placeholder="Roles (p. ej. ADMIN, SELLER)" value={roles} onChange={setRoles} />
      </Section>

      <Section
        id="section-modules"
        title="Módulos backend"
        hint="Nombres en inglés PascalCase, p. ej. Orders."
        addLabel="Agregar módulo"
        onAdd={() => modules.add({ name: '', description: '' })}
      >
        {modules.rows.map((m, i) => (
          <Row
            key={moduleIds[i]}
            onRemove={() => (modules.rows.length > 1 ? modules.remove(i) : undefined)}
          >
            <input
              required
              placeholder="Nombre (Orders)"
              className={`${input} w-40`}
              value={m.name}
              onChange={(e) => modules.update(i, { name: e.target.value })}
            />
            <input
              required
              placeholder="Responsabilidad"
              className={`${input} flex-1`}
              value={m.description}
              onChange={(e) => modules.update(i, { description: e.target.value })}
            />
          </Row>
        ))}
      </Section>

      <Section
        id="section-entities"
        title="Entidades persistentes"
        hint="Nombres en inglés: entidad en PascalCase singular (Order), campos en camelCase (unitPrice). id, createdAt y updatedAt se agregan solos."
        addLabel="Agregar entidad"
        onAdd={() =>
          entities.add({
            name: '',
            moduleLocalId: '',
            classLocalId: '',
            description: '',
            fields: [emptyField()],
            relations: [],
            operations: ['LIST', 'GET', 'CREATE', 'UPDATE', 'DELETE'],
            readRoles: '',
            writeRoles: '',
            sourceCodes: '',
          })
        }
      >
        {entities.rows.map((entity, i) => (
          <Row key={entityIds[i]} onRemove={() => entities.remove(i)}>
            <div className="flex w-full flex-wrap gap-2">
              <input
                required
                placeholder="Entidad (Order)"
                className={`${input} w-40`}
                value={entity.name}
                onChange={(e) => entities.update(i, { name: e.target.value })}
              />
              <ModuleSelect
                value={entity.moduleLocalId}
                modules={moduleOptions}
                onChange={(value) => entities.update(i, { moduleLocalId: value })}
              />
              <input
                placeholder="Clase del diagrama"
                aria-label="Clase del diagrama de clases"
                list="plan-class-options"
                className={`${input} w-44`}
                value={entity.classLocalId}
                onChange={(e) => entities.update(i, { classLocalId: e.target.value })}
              />
              <input
                placeholder="Descripción (opcional)"
                className={`${input} flex-1`}
                value={entity.description}
                onChange={(e) => entities.update(i, { description: e.target.value })}
              />
            </div>
            <div className="flex w-full flex-col gap-1 pl-2">
              <span className="text-xs font-medium text-muted-foreground">Campos</span>
              {entity.fields.map((field, j) => (
                <div key={j} className="flex flex-wrap items-center gap-2">
                  <input
                    required
                    placeholder="campo"
                    className={`${input} w-36`}
                    value={field.name}
                    onChange={(e) => updateField(i, j, { name: e.target.value })}
                  />
                  <select
                    aria-label="Tipo"
                    className={input}
                    value={field.type}
                    onChange={(e) => updateField(i, j, { type: e.target.value as FieldType })}
                  >
                    {IMPLEMENTATION_FIELD_TYPES.map((t) => (
                      <option key={t} value={t}>
                        {FIELD_TYPE_LABELS[t]}
                      </option>
                    ))}
                  </select>
                  {field.type === 'ENUM' ? (
                    <TagInput
                      placeholder="Valores (PENDING, DONE)"
                      className="w-56"
                      value={field.enumValues}
                      onChange={(val) => updateField(i, j, { enumValues: val })}
                    />
                  ) : null}
                  <label className="flex items-center gap-1 text-xs">
                    <input
                      type="checkbox"
                      checked={field.required}
                      onChange={(e) => updateField(i, j, { required: e.target.checked })}
                    />
                    Obligatorio
                  </label>
                  <label className="flex items-center gap-1 text-xs">
                    <input
                      type="checkbox"
                      checked={field.unique}
                      onChange={(e) => updateField(i, j, { unique: e.target.checked })}
                    />
                    Único
                  </label>
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    type="button"
                    aria-label="Quitar campo"
                    onClick={() =>
                      entity.fields.length > 1
                        ? entities.update(i, { fields: entity.fields.filter((_, k) => k !== j) })
                        : undefined
                    }
                  >
                    <Trash2 className="size-3" aria-hidden="true" />
                  </Button>
                </div>
              ))}
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="self-start"
                onClick={() => entities.update(i, { fields: [...entity.fields, emptyField()] })}
              >
                <Plus className="size-3" aria-hidden="true" /> Campo
              </Button>
              <span className="text-xs font-medium text-muted-foreground">Relaciones</span>
              {entity.relations.map((relation, j) => (
                <div key={j} className="flex flex-wrap items-center gap-2">
                  <input
                    required
                    placeholder="nombre (customer)"
                    className={`${input} w-36`}
                    value={relation.name}
                    onChange={(e) => updateRelation(i, j, { name: e.target.value })}
                  />
                  <select
                    aria-label="Tipo de relación"
                    className={input}
                    value={relation.kind}
                    onChange={(e) =>
                      updateRelation(i, j, { kind: e.target.value as RelationRow['kind'] })
                    }
                  >
                    {IMPLEMENTATION_RELATION_KINDS.map((k) => (
                      <option key={k} value={k}>
                        {RELATION_LABELS[k]}
                      </option>
                    ))}
                  </select>
                  <select
                    required
                    aria-label="Entidad relacionada"
                    className={input}
                    value={relation.targetEntityLocalId}
                    onChange={(e) => updateRelation(i, j, { targetEntityLocalId: e.target.value })}
                  >
                    <option value="">Entidad…</option>
                    {entityOptions.map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.name || o.id}
                      </option>
                    ))}
                  </select>
                  <label className="flex items-center gap-1 text-xs">
                    <input
                      type="checkbox"
                      checked={relation.required}
                      onChange={(e) => updateRelation(i, j, { required: e.target.checked })}
                    />
                    Obligatoria
                  </label>
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    type="button"
                    aria-label="Quitar relación"
                    onClick={() =>
                      entities.update(i, {
                        relations: entity.relations.filter((_, k) => k !== j),
                      })
                    }
                  >
                    <Trash2 className="size-3" aria-hidden="true" />
                  </Button>
                </div>
              ))}
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="self-start"
                onClick={() =>
                  entities.update(i, {
                    relations: [
                      ...entity.relations,
                      { name: '', kind: 'MANY_TO_ONE', targetEntityLocalId: '', required: false },
                    ],
                  })
                }
              >
                <Plus className="size-3" aria-hidden="true" /> Relación
              </Button>
              <div className="flex flex-wrap items-center gap-3 text-xs">
                <span className="font-medium text-muted-foreground">Operaciones expuestas:</span>
                {IMPLEMENTATION_CRUD_OPERATIONS.map((op) => (
                  <label key={op} className="flex items-center gap-1">
                    <input
                      type="checkbox"
                      checked={entity.operations.includes(op)}
                      onChange={(e) =>
                        entities.update(i, {
                          operations: e.target.checked
                            ? IMPLEMENTATION_CRUD_OPERATIONS.filter(
                                (o) => o === op || entity.operations.includes(o),
                              )
                            : entity.operations.filter((o) => o !== op),
                        })
                      }
                    />
                    {OPERATION_LABELS[op]}
                  </label>
                ))}
              </div>
              <div className="flex flex-wrap gap-2">
                <TagInput
                  placeholder="Roles que leen (vacío = cualquiera)"
                  className="w-64"
                  value={entity.readRoles}
                  onChange={(val) => entities.update(i, { readRoles: val })}
                />
                <TagInput
                  placeholder="Roles que escriben (vacío = cualquiera)"
                  className="w-64"
                  value={entity.writeRoles}
                  onChange={(val) => entities.update(i, { writeRoles: val })}
                />
                <TagInput
                  placeholder="Fuentes (códigos)"
                  className="w-56"
                  value={entity.sourceCodes}
                  onChange={(val) => entities.update(i, { sourceCodes: val })}
                />
              </div>
            </div>
          </Row>
        ))}
      </Section>

      <Section
        id="section-endpoints"
        title="Endpoints de negocio (no CRUD)"
        hint="Solo acciones que no son crear/editar/eliminar, p. ej. POST /orders/:orderId/confirm."
        addLabel="Agregar endpoint"
        onAdd={() =>
          endpoints.add({
            moduleLocalId: '',
            method: 'POST',
            path: '',
            summary: '',
            entityLocalId: '',
            roles: '',
          })
        }
      >
        {endpoints.rows.map((endpoint, i) => (
          <Row key={i} onRemove={() => endpoints.remove(i)}>
            <ModuleSelect
              value={endpoint.moduleLocalId}
              modules={moduleOptions}
              onChange={(value) => endpoints.update(i, { moduleLocalId: value })}
            />
            <select
              aria-label="Método HTTP"
              className={input}
              value={endpoint.method}
              onChange={(e) =>
                endpoints.update(i, {
                  method: e.target.value as (typeof IMPLEMENTATION_HTTP_METHODS)[number],
                })
              }
            >
              {IMPLEMENTATION_HTTP_METHODS.map((m) => (
                <option key={m}>{m}</option>
              ))}
            </select>
            <input
              required
              placeholder="/orders/:orderId/confirm"
              className={`${input} w-56 font-mono`}
              value={endpoint.path}
              onChange={(e) => endpoints.update(i, { path: e.target.value })}
            />
            <input
              required
              placeholder="Qué hace"
              className={`${input} flex-1`}
              value={endpoint.summary}
              onChange={(e) => endpoints.update(i, { summary: e.target.value })}
            />
            <TagInput
              placeholder="Roles"
              className="w-48"
              value={endpoint.roles}
              onChange={(val) => endpoints.update(i, { roles: val })}
            />
          </Row>
        ))}
      </Section>

      <Section
        id="section-screens"
        title="Pantallas del frontend"
        hint="Rutas Next.js en minúsculas, p. ej. /orders/[orderId]."
        addLabel="Agregar pantalla"
        onAdd={() =>
          routes.add({
            path: '',
            screenName: '',
            moduleLocalId: '',
            kind: 'LIST',
            entityLocalId: '',
            screenLocalId: '',
            actions: [],
          })
        }
      >
        {routes.rows.map((route, i) => (
          <Row key={i} onRemove={() => routes.remove(i)}>
            <input
              required
              placeholder="/orders"
              className={`${input} w-48 font-mono`}
              value={route.path}
              onChange={(e) => routes.update(i, { path: e.target.value })}
            />
            <input
              required
              placeholder="Pantalla"
              className={`${input} flex-1`}
              value={route.screenName}
              onChange={(e) => routes.update(i, { screenName: e.target.value })}
            />
            <ModuleSelect
              value={route.moduleLocalId}
              modules={moduleOptions}
              onChange={(value) => routes.update(i, { moduleLocalId: value })}
            />
            <select
              aria-label="Tipo de pantalla"
              className={input}
              value={route.kind}
              onChange={(e) =>
                routes.update(i, {
                  kind: e.target.value as (typeof IMPLEMENTATION_ROUTE_KINDS)[number],
                })
              }
            >
              {IMPLEMENTATION_ROUTE_KINDS.map((k) => (
                <option key={k}>{k}</option>
              ))}
            </select>
            <select
              aria-label="Entidad"
              className={input}
              value={route.entityLocalId}
              onChange={(e) => routes.update(i, { entityLocalId: e.target.value })}
            >
              <option value="">Sin entidad</option>
              {entityOptions.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name || o.id}
                </option>
              ))}
            </select>
            <input
              placeholder="Pantalla del plano"
              aria-label="Pantalla del plano de interfaz"
              list="plan-screen-options"
              className={`${input} w-44`}
              value={route.screenLocalId}
              onChange={(e) => routes.update(i, { screenLocalId: e.target.value })}
            />
            <RouteActions
              route={route}
              operations={entities.rows[entityIds.indexOf(route.entityLocalId)]?.operations ?? []}
              endpoints={endpoints.rows.map((e) => `${e.method} ${e.path}`)}
              screenActions={
                design.screens.find((screen) => screen.localId === route.screenLocalId)
                  ?.primaryActions ?? []
              }
              onChange={(actions) => routes.update(i, { actions })}
            />
          </Row>
        ))}
      </Section>
      <datalist id="plan-class-options">
        {design.classes.map((cls) => (
          <option key={cls.localId} value={cls.localId}>
            {cls.name}
          </option>
        ))}
      </datalist>
      <datalist id="plan-screen-options">
        {design.screens.map((screen) => (
          <option key={screen.localId} value={screen.localId}>
            {screen.name}
          </option>
        ))}
      </datalist>

      <Section
        id="section-env"
        title="Variables de entorno"
        hint="Solo nombre y descripción; nunca valores reales."
        addLabel="Agregar variable"
        onAdd={() => envVars.add({ name: '', description: '', required: true })}
      >
        {envVars.rows.map((v, i) => (
          <Row key={i} onRemove={() => envVars.remove(i)}>
            <input
              required
              placeholder="NOMBRE_VARIABLE"
              className={`${input} w-52 font-mono`}
              value={v.name}
              onChange={(e) => envVars.update(i, { name: e.target.value })}
            />
            <input
              required
              placeholder="Para qué se usa"
              className={`${input} flex-1`}
              value={v.description}
              onChange={(e) => envVars.update(i, { description: e.target.value })}
            />
          </Row>
        ))}
      </Section>

      <Section
        id="section-tests"
        title="Pruebas planificadas"
        addLabel="Agregar prueba"
        onAdd={() => tests.add({ moduleLocalId: '', kind: 'UNIT', description: '' })}
      >
        {tests.rows.map((t, i) => (
          <Row key={i} onRemove={() => tests.remove(i)}>
            <ModuleSelect
              value={t.moduleLocalId}
              modules={moduleOptions}
              onChange={(value) => tests.update(i, { moduleLocalId: value })}
            />
            <select
              aria-label="Tipo de prueba"
              className={input}
              value={t.kind}
              onChange={(e) =>
                tests.update(i, {
                  kind: e.target.value as (typeof IMPLEMENTATION_TEST_KINDS)[number],
                })
              }
            >
              {IMPLEMENTATION_TEST_KINDS.map((k) => (
                <option key={k}>{k}</option>
              ))}
            </select>
            <input
              required
              placeholder="Qué verifica"
              className={`${input} flex-1`}
              value={t.description}
              onChange={(e) => tests.update(i, { description: e.target.value })}
            />
          </Row>
        ))}
      </Section>
    </ManualFormShell>
  );
}

function RouteActions({
  route,
  operations,
  endpoints,
  screenActions,
  onChange,
}: {
  route: RouteRow;
  operations: Plan['entities'][number]['operations'];
  endpoints: string[];
  screenActions: string[];
  onChange: (actions: ActionRow[]) => void;
}) {
  const update = (j: number, patch: Partial<ActionRow>) =>
    onChange(route.actions.map((a, idx) => (idx === j ? { ...a, ...patch } : a)));
  const listId = `route-actions-${route.path || 'new'}`;
  return (
    <div className="flex w-full flex-col gap-1 pl-2">
      <span className="text-xs font-medium text-muted-foreground">
        Acciones de la pantalla y qué las atiende
      </span>
      {route.actions.map((action, j) => (
        <div key={j} className="flex flex-wrap items-center gap-2">
          <input
            required
            placeholder="Acción (como en el plano)"
            list={listId}
            className={`${input} w-56`}
            value={action.label}
            onChange={(e) => update(j, { label: e.target.value })}
          />
          <select
            required
            aria-label="Operación o endpoint"
            className={input}
            value={action.target}
            onChange={(e) => update(j, { target: e.target.value })}
          >
            <option value="">Atendida por…</option>
            {operations.map((op) => (
              <option key={op} value={`op:${op}`}>
                {OPERATION_LABELS[op]}
              </option>
            ))}
            {endpoints.map((endpoint) => (
              <option key={endpoint} value={`ep:${endpoint}`}>
                {endpoint}
              </option>
            ))}
          </select>
          <Button
            variant="ghost"
            size="icon-xs"
            type="button"
            aria-label="Quitar acción"
            onClick={() => onChange(route.actions.filter((_, k) => k !== j))}
          >
            <Trash2 className="size-3" aria-hidden="true" />
          </Button>
        </div>
      ))}
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="self-start"
        onClick={() => onChange([...route.actions, { label: '', target: '' }])}
      >
        <Plus className="size-3" aria-hidden="true" /> Acción
      </Button>
      <datalist id={listId}>
        {screenActions.map((action) => (
          <option key={action} value={action} />
        ))}
      </datalist>
    </div>
  );
}
