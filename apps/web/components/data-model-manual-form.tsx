'use client';

import { useState } from 'react';
import {
  CONCEPTUAL_ATTRIBUTE_TYPES,
  DATA_MODEL_CARDINALITIES,
  type ConceptualAttributeType,
  type DataModelCardinality,
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
}

const blankAttribute = (): Attribute => ({
  name: '',
  type: 'STRING',
  required: false,
  primaryKey: false,
  unique: false,
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
  onCreated,
  onCancel,
}: {
  projectId: string;
  onCreated: () => void;
  onCancel: () => void;
}) {
  const [title, setTitle] = useState('');
  const [entities, setEntities] = useState<Entity[]>([blankEntity(1)]);
  const [relationships, setRelationships] = useState<Relationship[]>([]);
  const [error, setError] = useState<string | null>(null);
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
    setError(null);
    setSubmitting(true);
    try {
      await api.dataModels.create(projectId, {
        title,
        modelKind: 'ER',
        entities: entities.map((entity) => ({
          localId: entity.localId,
          name: entity.name,
          description: entity.description || undefined,
          attributes: entity.attributes
            .filter((a) => a.name.trim())
            .map((a) => ({ ...a, description: undefined })),
        })),
        relationships: relationships
          .filter((r) => r.sourceEntityId && r.targetEntityId)
          .map((r) => ({ ...r, name: r.name || undefined, description: undefined })),
      });
      onCreated();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo crear el Modelo de Datos.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="flex flex-col gap-4 rounded-lg border border-gray-200 bg-white p-4"
    >
      <h2 className="text-sm font-semibold text-gray-900">Crear Modelo de Datos manualmente</h2>
      <label className="flex flex-col gap-1 text-sm">
        Título
        <input
          required
          className="rounded-md border border-gray-300 px-2 py-1"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
      </label>

      {entities.map((entity, ei) => (
        <fieldset key={entity.localId} className="rounded-md border border-gray-200 p-3">
          <legend className="px-1 text-sm font-medium text-gray-700">Entidad {ei + 1}</legend>
          <div className="grid gap-2 sm:grid-cols-2">
            <input
              required
              placeholder="Nombre de la entidad"
              className="rounded-md border border-gray-300 px-2 py-1 text-sm"
              value={entity.name}
              onChange={(e) => updateEntity(ei, { name: e.target.value })}
            />
            <input
              placeholder="Descripción (opcional)"
              className="rounded-md border border-gray-300 px-2 py-1 text-sm"
              value={entity.description}
              onChange={(e) => updateEntity(ei, { description: e.target.value })}
            />
          </div>
          <div className="mt-2 flex flex-col gap-1">
            <span className="text-xs font-medium text-gray-500">Atributos</span>
            {entity.attributes.map((attr, ai) => (
              <div key={ai} className="flex flex-wrap items-center gap-2 text-sm">
                <input
                  placeholder="nombre"
                  className="w-32 rounded-md border border-gray-300 px-2 py-1"
                  value={attr.name}
                  onChange={(e) => updateAttribute(ei, ai, { name: e.target.value })}
                />
                <select
                  className="rounded-md border border-gray-300 px-2 py-1"
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
                <button
                  type="button"
                  onClick={() =>
                    updateEntity(ei, { attributes: entity.attributes.filter((_, j) => j !== ai) })
                  }
                  className="text-red-600"
                  aria-label={`Eliminar atributo ${ai + 1} de la entidad ${ei + 1}`}
                >
                  ✕
                </button>
              </div>
            ))}
            <button
              type="button"
              onClick={() =>
                updateEntity(ei, { attributes: [...entity.attributes, blankAttribute()] })
              }
              className="self-start text-sm text-gray-600 underline"
            >
              + Agregar atributo
            </button>
          </div>
          <button
            type="button"
            onClick={() => setEntities((prev) => prev.filter((_, i) => i !== ei))}
            className="mt-2 text-sm text-red-600"
          >
            Eliminar entidad
          </button>
        </fieldset>
      ))}
      <button
        type="button"
        onClick={() => setEntities((prev) => [...prev, blankEntity(prev.length + 1)])}
        className="self-start rounded-md border border-gray-300 px-3 py-1 text-sm hover:bg-gray-50"
      >
        + Agregar entidad
      </button>

      <fieldset className="rounded-md border border-gray-200 p-3">
        <legend className="px-1 text-sm font-medium text-gray-700">Relaciones (opcional)</legend>
        {relationships.map((rel, ri) => (
          <div key={ri} className="mb-1 flex flex-wrap items-center gap-2 text-sm">
            <select
              className="rounded-md border border-gray-300 px-2 py-1"
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
              className="rounded-md border border-gray-300 px-2 py-1"
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
              className="rounded-md border border-gray-300 px-2 py-1"
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
              className="rounded-md border border-gray-300 px-2 py-1"
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
            <button
              type="button"
              onClick={() => setRelationships((prev) => prev.filter((_, i) => i !== ri))}
              className="text-red-600"
              aria-label={`Eliminar relación ${ri + 1}`}
            >
              ✕
            </button>
          </div>
        ))}
        <button
          type="button"
          onClick={() =>
            setRelationships((prev) => [
              ...prev,
              {
                sourceEntityId: '',
                targetEntityId: '',
                name: '',
                sourceCardinality: 'ONE',
                targetCardinality: 'ONE_OR_MORE',
              },
            ])
          }
          className="text-sm text-gray-600 underline"
        >
          + Agregar relación
        </button>
      </fieldset>

      {error ? <p className="text-sm text-red-600">{error}</p> : null}
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={submitting}
          className="rounded-md bg-gray-900 px-3 py-1.5 text-sm text-white disabled:opacity-50"
        >
          {submitting ? 'Creando…' : 'Crear Modelo de Datos'}
        </button>
        <button type="button" onClick={onCancel} className="text-sm text-gray-600 underline">
          Cancelar
        </button>
      </div>
    </form>
  );
}
