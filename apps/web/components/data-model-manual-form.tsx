'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@caseflow-ai/ui';
import { Database, Link2, Plus, Trash2 } from 'lucide-react';
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
const CARDINALITY_LABELS: Record<Cardinality, string> = {
  ONE: '1 (exactamente uno)',
  ZERO_OR_ONE: '0..1 (cero o uno)',
  ONE_OR_MORE: '1..* (uno o más)',
  ZERO_OR_MORE: '0..* (cero o más)',
};

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
      className="flex flex-col gap-5 rounded-xl border border-border/80 bg-card p-5 shadow-xs"
    >
      <div className="flex items-center gap-2 border-b border-border/60 pb-3">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary border border-primary/20">
          <Database className="size-4" aria-hidden="true" />
        </span>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <h2 className="text-base font-semibold text-foreground">
              {initial ? `Editar ${initial.code}` : 'Nuevo modelo de datos'}
            </h2>
            <span
              className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${
                initial
                  ? 'border border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400'
                  : 'border border-primary/30 bg-primary/10 text-primary'
              }`}
            >
              {initial ? 'Modo edición' : 'Nueva versión'}
            </span>
          </div>
          <p className="text-xs text-muted-foreground">
            Defina las entidades, atributos y relaciones conceptuales del dominio.
          </p>
        </div>
      </div>

      <label className="flex flex-col gap-1.5 text-sm font-medium text-foreground">
        Título
        <input
          required
          placeholder="Ej. Modelo de dominio de pedidos e inventario"
          className="h-9 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-2xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
      </label>

      <div className="flex flex-col gap-4">
        {entities.map((entity, ei) => (
          <fieldset
            key={entity.localId}
            className="flex flex-col gap-3 rounded-lg border border-border/70 bg-muted/20 p-4 shadow-2xs"
          >
            <legend className="px-1 text-sm font-semibold text-foreground">Entidad {ei + 1}</legend>
            <div className="grid gap-2 sm:grid-cols-2">
              <input
                required
                placeholder="Nombre de la entidad"
                className="h-9 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-2xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                value={entity.name}
                onChange={(e) => updateEntity(ei, { name: e.target.value })}
              />
              <input
                placeholder="Descripción (opcional)"
                className="h-9 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-2xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                value={entity.description}
                onChange={(e) => updateEntity(ei, { description: e.target.value })}
              />
            </div>
            <div className="mt-1 flex flex-col gap-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Atributos
              </span>
              <div className="flex flex-col gap-1.5">
                {entity.attributes.map((attr, ai) => (
                  <div
                    key={ai}
                    className="flex flex-wrap items-center gap-2 rounded-md border border-border/40 bg-background/70 p-2 text-sm shadow-2xs"
                  >
                    <input
                      placeholder="nombre"
                      className="h-8 w-36 rounded-md border border-input bg-background px-2.5 font-mono text-xs shadow-2xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                      value={attr.name}
                      onChange={(e) => updateAttribute(ei, ai, { name: e.target.value })}
                    />
                    <select
                      className="h-8 rounded-md border border-input bg-background px-2 font-mono text-xs shadow-2xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
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
                    <div className="flex items-center gap-3 px-1 text-xs text-foreground">
                      <label className="flex cursor-pointer items-center gap-1.5 select-none">
                        <input
                          type="checkbox"
                          checked={attr.required}
                          onChange={(e) => updateAttribute(ei, ai, { required: e.target.checked })}
                          className="size-3.5 rounded border-input accent-primary"
                        />
                        <span>requerido</span>
                      </label>
                      <label className="flex cursor-pointer items-center gap-1.5 select-none">
                        <input
                          type="checkbox"
                          checked={attr.primaryKey}
                          onChange={(e) =>
                            updateAttribute(ei, ai, { primaryKey: e.target.checked })
                          }
                          className="size-3.5 rounded border-input accent-primary"
                        />
                        <span className="font-semibold text-amber-700 dark:text-amber-400">PK</span>
                      </label>
                      <label className="flex cursor-pointer items-center gap-1.5 select-none">
                        <input
                          type="checkbox"
                          checked={attr.unique}
                          onChange={(e) => updateAttribute(ei, ai, { unique: e.target.checked })}
                          className="size-3.5 rounded border-input accent-primary"
                        />
                        <span>único</span>
                      </label>
                    </div>
                    <input
                      aria-label={`Descripción del atributo ${ai + 1} de la entidad ${ei + 1}`}
                      placeholder="descripción (opcional)"
                      className="h-8 min-w-[140px] flex-1 rounded-md border border-input bg-background px-2.5 text-xs shadow-2xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                      value={attr.description}
                      onChange={(e) => updateAttribute(ei, ai, { description: e.target.value })}
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-xs"
                      onClick={() =>
                        updateEntity(ei, {
                          attributes: entity.attributes.filter((_, j) => j !== ai),
                        })
                      }
                      className="size-8 text-destructive hover:bg-destructive/10 hover:text-destructive"
                      aria-label={`Eliminar atributo ${ai + 1} de la entidad ${ei + 1}`}
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  </div>
                ))}
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() =>
                  updateEntity(ei, { attributes: [...entity.attributes, blankAttribute()] })
                }
                className="h-8 gap-1.5 self-start text-xs text-muted-foreground"
              >
                <Plus className="size-3.5" /> Agregar atributo
              </Button>
            </div>
            <div className="flex justify-end border-t border-border/40 pt-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setEntities((prev) => prev.filter((_, i) => i !== ei))}
                className="h-7 gap-1.5 text-xs text-destructive hover:bg-destructive/10 hover:text-destructive"
              >
                <Trash2 className="size-3.5" /> Eliminar entidad
              </Button>
            </div>
          </fieldset>
        ))}
      </div>

      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => setEntities((prev) => [...prev, blankEntity(prev.length + 1)])}
        className="h-9 gap-1.5 self-start text-xs font-medium"
      >
        <Plus className="size-4" /> Agregar entidad
      </Button>

      <fieldset className="flex flex-col gap-3 rounded-lg border border-border/70 bg-muted/20 p-4 shadow-2xs">
        <legend className="px-1 text-sm font-semibold text-foreground flex items-center gap-1.5">
          <Link2 className="size-3.5 text-primary" /> Relaciones (opcional)
        </legend>
        <div className="rounded-md border border-border/50 bg-background/60 p-2.5 text-xs text-muted-foreground">
          Cada cardinalidad indica cuántos de su lado corresponden a uno del otro lado. Por ejemplo,{' '}
          <strong className="text-foreground">Cliente 1 → Pedido 0..*</strong>: cada pedido es de un
          cliente y un cliente tiene cero o más pedidos.
        </div>
        <div className="flex flex-col gap-2">
          {relationships.map((rel, ri) => (
            <div
              key={ri}
              className="flex flex-wrap items-center gap-2 rounded-md border border-border/40 bg-background/70 p-2 text-sm shadow-2xs"
            >
              <select
                className="h-8 rounded-md border border-input bg-background px-2 text-xs shadow-2xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
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
                className="h-8 rounded-md border border-input bg-background px-2 font-mono text-xs shadow-2xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                aria-label={`Cardinalidad de origen de la relación ${ri + 1}`}
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
                    {CARDINALITY_LABELS[c]}
                  </option>
                ))}
              </select>
              <span className="font-bold text-primary">→</span>
              <select
                className="h-8 rounded-md border border-input bg-background px-2 text-xs shadow-2xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
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
                className="h-8 rounded-md border border-input bg-background px-2 font-mono text-xs shadow-2xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                aria-label={`Cardinalidad de destino de la relación ${ri + 1}`}
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
                    {CARDINALITY_LABELS[c]}
                  </option>
                ))}
              </select>
              <input
                aria-label={`Nombre de la relación ${ri + 1}`}
                placeholder="nombre (opcional)"
                className="h-8 w-32 rounded-md border border-input bg-background px-2.5 text-xs shadow-2xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
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
                className="h-8 min-w-[140px] flex-1 rounded-md border border-input bg-background px-2.5 text-xs shadow-2xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
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
                className="size-8 text-destructive hover:bg-destructive/10 hover:text-destructive"
                aria-label={`Eliminar relación ${ri + 1}`}
              >
                <Trash2 className="size-3.5" />
              </Button>
            </div>
          ))}
        </div>
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
          className="h-8 gap-1.5 self-start text-xs text-muted-foreground"
        >
          <Plus className="size-3.5" /> Agregar relación
        </Button>
      </fieldset>

      <div className="sticky bottom-4 z-30 mt-2 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border/90 bg-card/95 px-4 py-3 shadow-xl backdrop-blur-md ring-1 ring-black/5 dark:bg-slate-900/95 dark:ring-white/10">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Database className="size-3.5 text-primary" aria-hidden="true" />
          <span className="font-medium text-foreground">
            {entities.length} {entities.length === 1 ? 'entidad' : 'entidades'}
          </span>
          <span>•</span>
          <span>
            {relationships.length} {relationships.length === 1 ? 'relación' : 'relaciones'}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <Button type="button" variant="ghost" size="sm" onClick={onCancel} disabled={submitting}>
            Cancelar
          </Button>
          <Button type="submit" size="sm" disabled={submitting} className="shadow-xs font-medium">
            {submitting ? 'Guardando…' : initial ? 'Guardar cambios' : 'Crear modelo de datos'}
          </Button>
        </div>
      </div>
    </form>
  );
}
