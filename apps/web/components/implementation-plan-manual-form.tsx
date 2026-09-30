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
  type ImplementationPlanContent,
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
  title,
  hint,
  onAdd,
  addLabel,
  children,
}: {
  title: string;
  hint?: string;
  onAdd?: () => void;
  addLabel?: string;
  children: ReactNode;
}) {
  return (
    <fieldset className="flex flex-col gap-2">
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
  description: string;
  fields: FieldRow[];
  relations: RelationRow[];
  operations: Plan['entities'][number]['operations'];
  readRoles: string;
  writeRoles: string;
  sourceCodes: string;
};

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
  const routes = useRows(
    p?.routes.map((r) => ({ ...r, entityLocalId: r.entityLocalId ?? '' })) ?? [],
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

      <Section title="Autenticación y roles">
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
        title="Entidades persistentes"
        hint="Nombres en inglés: entidad en PascalCase singular (Order), campos en camelCase (unitPrice). id, createdAt y updatedAt se agregan solos."
        addLabel="Agregar entidad"
        onAdd={() =>
          entities.add({
            name: '',
            moduleLocalId: '',
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
          </Row>
        ))}
      </Section>

      <Section
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
