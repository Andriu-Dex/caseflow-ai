'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import type {
  RequirementPriority,
  RequirementResponse,
  RequirementType,
} from '@caseflow-ai/contracts';
import { REQUIREMENT_PRIORITIES, REQUIREMENT_TYPES } from '@caseflow-ai/contracts';
import { api, ApiError } from '../lib/api';
import { csv } from '../lib/use-rows';
import { TagInput } from './tag-input';

const PRIORITY_LABELS: Record<RequirementPriority, string> = {
  HIGH: 'Alta',
  MEDIUM: 'Media',
  LOW: 'Baja',
};

// Manual (non-AI) Requirement creation, and editing when `initial` is given:
// an edit never mutates the existing version, it submits a complete new
// version (which starts again as a draft needing approval).
export function RequirementManualForm({
  projectId,
  existingRequirements,
  initial,
  onCreated,
  onCancel,
}: {
  projectId: string;
  existingRequirements: RequirementResponse[];
  initial?: RequirementResponse;
  onCreated: () => void;
  onCancel: () => void;
}) {
  const r0 = initial?.requirement;
  const [requirementType, setRequirementType] = useState<RequirementType>(
    r0?.requirementType ?? 'FUNCTIONAL',
  );
  const [name, setName] = useState(r0?.name ?? '');
  const [description, setDescription] = useState(r0?.description ?? '');
  const [priority, setPriority] = useState<RequirementPriority>(r0?.priority ?? 'MEDIUM');
  const [actors, setActors] = useState(r0?.actors.join(', ') ?? '');
  const [preconditions, setPreconditions] = useState(r0?.preconditions.join(', ') ?? '');
  const [postconditions, setPostconditions] = useState(r0?.postconditions.join(', ') ?? '');
  // The backend's dependency check validates against the Requirement
  // Artifact's stable id (never a version id, and never an ArtifactVersion
  // UUID the user has to type) and does not filter by lifecycle status.
  const [dependencyArtifactIds, setDependencyArtifactIds] = useState<string[]>(
    r0?.dependencyArtifactIds ?? [],
  );
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    const input = {
      requirementType,
      name,
      description,
      priority,
      actors: csv(actors),
      preconditions: csv(preconditions),
      postconditions: csv(postconditions),
      dependencyArtifactIds,
    };
    try {
      if (initial) {
        await api.requirements.createVersion(projectId, initial.id, input);
        toast.success(
          `${initial.code} actualizado. La nueva versión queda pendiente de aprobación.`,
        );
      } else {
        await api.requirements.create(projectId, input);
        toast.success('Requisito creado.');
      }
      onCreated();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'No se pudo guardar el requisito.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="flex flex-col gap-3 rounded-lg border border-border bg-card p-4"
    >
      <h2 className="text-sm font-semibold text-foreground">
        {initial ? `Editar ${initial.code}` : 'Nuevo requisito'}
      </h2>
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="flex flex-col gap-1 text-sm">
          Tipo
          <select
            className="rounded-md border border-input px-2 py-1"
            value={requirementType}
            onChange={(e) => setRequirementType(e.target.value as RequirementType)}
          >
            {REQUIREMENT_TYPES.map((t) => (
              <option key={t} value={t}>
                {t === 'FUNCTIONAL' ? 'Funcional (RF)' : 'No funcional (RNF)'}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Nombre
          <input
            required
            className="rounded-md border border-input px-2 py-1"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Prioridad
          <select
            className="rounded-md border border-input px-2 py-1"
            value={priority}
            onChange={(e) => setPriority(e.target.value as RequirementPriority)}
          >
            {REQUIREMENT_PRIORITIES.map((p) => (
              <option key={p} value={p}>
                {PRIORITY_LABELS[p]}
              </option>
            ))}
          </select>
        </label>
      </div>
      <label className="flex flex-col gap-1 text-sm">
        Descripción
        <textarea
          required
          rows={2}
          className="rounded-md border border-input px-2 py-1"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </label>
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="flex flex-col gap-1 text-sm">
          Actores (separados por coma)
          <TagInput value={actors} onChange={setActors} />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Precondiciones (separadas por coma)
          <TagInput value={preconditions} onChange={setPreconditions} />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Postcondiciones (separadas por coma)
          <TagInput value={postconditions} onChange={setPostconditions} />
        </label>
      </div>
      {existingRequirements.length > 0 ? (
        <fieldset className="rounded-md border border-border p-2">
          <legend className="px-1 text-sm font-medium text-foreground/80">
            Depende de (opcional)
          </legend>
          <ul className="flex flex-col gap-1 text-sm">
            {existingRequirements
              .filter((r) => r.id !== initial?.id)
              .map((r) => (
                <li key={r.id} className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id={`reqdep-${r.id}`}
                    checked={dependencyArtifactIds.includes(r.id)}
                    onChange={() =>
                      setDependencyArtifactIds((prev) =>
                        prev.includes(r.id) ? prev.filter((id) => id !== r.id) : [...prev, r.id],
                      )
                    }
                  />
                  <label htmlFor={`reqdep-${r.id}`}>
                    {r.code} — {r.requirement.name}
                  </label>
                </li>
              ))}
          </ul>
        </fieldset>
      ) : null}
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={submitting}
          className="rounded-md bg-primary px-3 py-1.5 text-sm text-white disabled:opacity-50"
        >
          {submitting ? 'Guardando…' : initial ? 'Guardar cambios' : 'Crear requisito'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="text-sm text-muted-foreground underline"
        >
          Cancelar
        </button>
      </div>
    </form>
  );
}
