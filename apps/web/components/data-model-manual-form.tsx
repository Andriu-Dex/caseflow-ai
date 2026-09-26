'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@caseflow-ai/ui';
import { Trash2, Plus } from 'lucide-react';
import {
  CONCEPTUAL_ATTRIBUTE_TYPES,
  DATA_MODEL_CARDINALITIES,
  type ConceptualAttributeType,
  type DataModelCardinality,
  type DataModelResponse,
} from '@caseflow-ai/contracts';
import { api, ApiError } from '../lib/api';

type AttributeType = ConceptualAttributeType;
type Cardinality = DataModelCardinality;
const ATTRIBUTE_TYPES = CONCEPTUAL_ATTRIBUTE_TYPES;
const CARDINALITIES = DATA_MODEL_CARDINALITIES;

interface Attribute {
  name: string;
  type: AttributeType;
  required: boolean;
  primaryKey: boolean;
  unique: boolean;
  description: string;
}
interface Entity {
  localId: string;
  name: string;
  description: string;
  attributes: Attribute[];
}
interface Relationship {
  sourceEntityId: string;
  targetEntityId: string;
  name: string;
  sourceCardinality: Cardinality;
  targetCardinality: Cardinality;
  description: string;
}

const blankAttribute = (): Attribute => ({
  name: '',
  type: 'STRING',
  required: false,
  primaryKey: false,
  unique: false,
  description: '',
});
const blankEntity = (n: number): Entity => ({
  localId: `e${n}`,
  name: '',
  description: '',
  attributes: [blankAttribute()],
});

// Manual (non-AI) Data Model creation (spec: no Mermaid authoring — the
// canonical data stays structured; the existing deterministic DiagramEngine
// derives the ER diagram from it after creation, same as the AI path).
export function DataModelManualForm({
  projectId,
  initial,
  onCreated,
  onCancel,
}: {
  projectId: string;
  initial?: DataModelResponse;
  onCreated: () => void;
  onCancel: () => void;
}) {
  const m0 = initial?.dataModel;
  const [title, setTitle] = useState(m0?.title ?? '');
  const [entities, setEntities] = useState<Entity[]>(
    m0?.entities.map((e) => ({
      localId: e.localId,
      name: e.name,
      description: e.description ?? '',
      attributes: e.attributes.map((a) => ({ ...a, description: a.description ?? '' })),
    })) ?? [blankEntity(1)],
  );
  const [relationships, setRelationships] = useState<Relationship[]>(
    m0?.relationships.map((r) => ({
      ...r,
      name: r.name ?? '',
      description: r.description ?? '',
    })) ?? [],
  );
  const [submitting, setSubmitting] = useState(false);

  function updateEntity(index: number, patch: Partial<Entity>) {
    setEntities((prev) => prev.map((e, i) => (i === index ? { ...e, ...patch } : e)));
  }
  function updateAttribute(entityIndex: number, attrIndex: number, patch: Partial<Attribute>) {
    setEntities((prev) =>
      prev.map((e, i) =>
        i === entityIndex
          ? {
              ...e,
              attributes: e.attributes.map((a, j) => (j === attrIndex ? { ...a, ...patch } : a)),
            }
          : e,
      ),
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      const input = {
        title,
        modelKind: 'ER',
        entities: entities.map((entity) => ({
          localId: entity.localId,
          name: entity.name,
          description: entity.description || undefined,
          attributes: entity.attributes
            .filter((a) => a.name.trim())
            .map((a) => ({ ...a, description: a.description || undefined })),
        })),
        relationships: relationships
          .filter((r) => r.sourceEntityId && r.targetEntityId)
          .map((r) => ({
            ...r,
            name: r.name || undefined,
            description: r.description || undefined,
          })),
      } as const;
      if (initial) {
        await api.dataModels.createVersion(projectId, initial.id, input);
        toast.success(
          `${initial.code} actualizado. La nueva versión queda pendiente de aprobación.`,
        );
      } else {
        await api.dataModels.create(projectId, input);
        toast.success('Modelo de datos creado.');
      }
      onCreated();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'No se pudo guardar el modelo de datos.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="flex flex-col gap-4 rounded-lg border border-border bg-card p-4"
    >
      <h2 className="text-sm font-semibold text-foreground">
        {initial ? `Editar ${initial.code}` : 'Nuevo modelo de datos'}
      </h2>
      <label className="flex flex-col gap-1 text-sm">
        Título
        <input
          required
          className="rounded-md border border-input px-2 py-1"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
      </label>

      {entities.map((entity, ei) => (
        <fieldset key={entity.localId} className="rounded-md border border-border p-3">
          <legend className="px-1 text-sm font-medium text-foreground/80">Entidad {ei + 1}</legend>
          <div className="grid gap-2 sm:grid-cols-2">
            <input
              required
              placeholder="Nombre de la entidad"
              className="rounded-md border border-input px-2 py-1 text-sm"
              value={entity.name}
              onChange={(e) => updateEntity(ei, { name: e.target.value })}
            />
            <input
              placeholder="Descripción (opcional)"
              className="rounded-md border border-input px-2 py-1 text-sm"
              value={entity.description}
              onChange={(e) => updateEntity(ei, { description: e.target.value })}
            />
          </div>
          <div className="mt-2 flex flex-col gap-1">
            <span className="text-xs font-medium text-muted-foreground">Atributos</span>
            {entity.attributes.map((attr, ai) => (
              <div key={ai} className="flex flex-wrap items-center gap-2 text-sm">
                <input
                  placeholder="nombre"
                  className="w-32 rounded-md border border-input px-2 py-1"
                  value={attr.name}
                  onChange={(e) => updateAttribute(ei, ai, { name: e.target.value })}
                />
                <select
                  className="rounded-md border border-input px-2 py-1"
                  value={attr.type}
                  onChange={(e) =>
                    updateAttribute(ei, ai, { type: e.target.value as AttributeType })
                  }
                >
                  {ATTRIBUTE_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
                <label className="flex items-center gap-1">
                  <input
                    type="checkbox"
                    checked={attr.required}
                    onChange={(e) => updateAttribute(ei, ai, { required: e.target.checked })}
                  />
                  requerido
                </label>
                <label className="flex items-center gap-1">
                  <input
                    type="checkbox"
                    checked={attr.primaryKey}
                    onChange={(e) => updateAttribute(ei, ai, { primaryKey: e.target.checked })}
                  />
                  PK
                </label>
                <label className="flex items-center gap-1">
                  <input
                    type="checkbox"
                    checked={attr.unique}
                    onChange={(e) => updateAttribute(ei, ai, { unique: e.target.checked })}
                  />
                  único
                </label>
                <input
                  aria-label={`Descripción del atributo ${ai + 1} de la entidad ${ei + 1}`}
                  placeholder="descripción (opcional)"
                  className="w-40 rounded-md border border-input px-2 py-1"
                  value={attr.description}
                  onChange={(e) => updateAttribute(ei, ai, { description: e.target.value })}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  onClick={() =>
                    updateEntity(ei, { attributes: entity.attributes.filter((_, j) => j !== ai) })
                  }
                  className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                  aria-label={`Eliminar atributo ${ai + 1} de la entidad ${ei + 1}`}
                >
                  <Trash2 className="size-3.5" />
                </Button>
              </div>
            ))}
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() =>
                updateEntity(ei, { attributes: [...entity.attributes, blankAttribute()] })
              }
              className="self-start text-muted-foreground"
            >
              <Plus className="mr-1 size-4" /> Agregar atributo
            </Button>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setEntities((prev) => prev.filter((_, i) => i !== ei))}
            className="mt-2 self-start text-destructive hover:bg-destructive/10 hover:text-destructive"
          >
            <Trash2 className="mr-2 size-4" /> Eliminar entidad
          </Button>
        </fieldset>
      ))}
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => setEntities((prev) => [...prev, blankEntity(prev.length + 1)])}
        className="self-start"
      >
        <Plus className="mr-2 size-4" /> Agregar entidad
      </Button>

      <fieldset className="rounded-md border border-border p-3">
        <legend className="px-1 text-sm font-medium text-foreground/80">
          Relaciones (opcional)
        </legend>
        {relationships.map((rel, ri) => (
          <div key={ri} className="mb-1 flex flex-wrap items-center gap-2 text-sm">
            <select
              className="rounded-md border border-input px-2 py-1"
              value={rel.sourceEntityId}
              onChange={(e) =>
                setRelationships((prev) =>
                  prev.map((r, i) => (i === ri ? { ...r, sourceEntityId: e.target.value } : r)),
                )
              }
            >
              <option value="">Entidad origen…</option>
              {entities.map((en) => (
                <option key={en.localId} value={en.localId}>
                  {en.name || en.localId}
                </option>
              ))}
            </select>
            <select
              className="rounded-md border border-input px-2 py-1"
              value={rel.sourceCardinality}
              onChange={(e) =>
                setRelationships((prev) =>
                  prev.map((r, i) =>
                    i === ri ? { ...r, sourceCardinality: e.target.value as Cardinality } : r,
                  ),
                )
              }
            >
              {CARDINALITIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
            <span>→</span>
            <select
              className="rounded-md border border-input px-2 py-1"
              value={rel.targetEntityId}
              onChange={(e) =>
                setRelationships((prev) =>
                  prev.map((r, i) => (i === ri ? { ...r, targetEntityId: e.target.value } : r)),
                )
              }
            >
              <option value="">Entidad destino…</option>
              {entities.map((en) => (
                <option key={en.localId} value={en.localId}>
                  {en.name || en.localId}
                </option>
              ))}
            </select>
            <select
              className="rounded-md border border-input px-2 py-1"
              value={rel.targetCardinality}
              onChange={(e) =>
                setRelationships((prev) =>
                  prev.map((r, i) =>
                    i === ri ? { ...r, targetCardinality: e.target.value as Cardinality } : r,
                  ),
                )
              }
            >
              {CARDINALITIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
            <input
              aria-label={`Nombre de la relación ${ri + 1}`}
              placeholder="nombre (opcional)"
              className="w-32 rounded-md border border-input px-2 py-1"
              value={rel.name}
              onChange={(e) =>
                setRelationships((prev) =>
                  prev.map((r, i) => (i === ri ? { ...r, name: e.target.value } : r)),
                )
              }
            />
            <input
              aria-label={`Descripción de la relación ${ri + 1}`}
              placeholder="descripción (opcional)"
              className="w-40 rounded-md border border-input px-2 py-1"
              value={rel.description}
              onChange={(e) =>
                setRelationships((prev) =>
                  prev.map((r, i) => (i === ri ? { ...r, description: e.target.value } : r)),
                )
              }
            />
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              onClick={() => setRelationships((prev) => prev.filter((_, i) => i !== ri))}
              className="text-destructive hover:bg-destructive/10 hover:text-destructive"
              aria-label={`Eliminar relación ${ri + 1}`}
            >
              <Trash2 className="size-3.5" />
            </Button>
          </div>
        ))}
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() =>
            setRelationships((prev) => [
              ...prev,
              {
                sourceEntityId: '',
                targetEntityId: '',
                name: '',
                description: '',
                sourceCardinality: 'ONE',
                targetCardinality: 'ONE_OR_MORE',
              },
            ])
          }
          className="self-start text-muted-foreground"
        >
          <Plus className="mr-1 size-4" /> Agregar relación
        </Button>
      </fieldset>

      <div className="flex gap-2">
        <Button type="submit" disabled={submitting}>
          {submitting ? 'Guardando…' : initial ? 'Guardar cambios' : 'Crear modelo de datos'}
        </Button>
        <Button type="button" variant="ghost" onClick={onCancel}>
          Cancelar
        </Button>
      </div>
    </form>
  );
}
