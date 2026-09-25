'use client';

import { useState } from 'react';
import type {
  RequirementPriority,
  RequirementResponse,
  RequirementType,
} from '@caseflow-ai/contracts';
import { REQUIREMENT_PRIORITIES, REQUIREMENT_TYPES } from '@caseflow-ai/contracts';
import { api, ApiError } from '../lib/api';
import { csv } from '../lib/use-rows';

// Manual (non-AI) Requirement creation (spec: CASEflow remains functional
// without a configured AI provider) — this was the missing manual path for
// the first artifact type downstream of an approved Project Context.
export function RequirementManualForm({
  projectId,
  existingRequirements,
  onCreated,
  onCancel,
}: {
  projectId: string;
  existingRequirements: RequirementResponse[];
  onCreated: () => void;
  onCancel: () => void;
}) {
  const [requirementType, setRequirementType] = useState<RequirementType>('FUNCTIONAL');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState<RequirementPriority>('MEDIUM');
  const [actors, setActors] = useState('');
  const [preconditions, setPreconditions] = useState('');
  const [postconditions, setPostconditions] = useState('');
  // The backend's dependency check validates against the Requirement
  // Artifact's stable id (never a version id, and never an ArtifactVersion
  // UUID the user has to type) and does not filter by lifecycle status.
  const [dependencyArtifactIds, setDependencyArtifactIds] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await api.requirements.create(projectId, {
        requirementType,
        name,
        description,
        priority,
        actors: csv(actors),
        preconditions: csv(preconditions),
        postconditions: csv(postconditions),
        dependencyArtifactIds,
      });
      onCreated();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo crear el Requisito.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="flex flex-col gap-3 rounded-lg border border-border bg-card p-4"
    >
      <h2 className="text-sm font-semibold text-foreground">Crear Requisito manualmente</h2>
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
                {p}
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
          <input
            className="rounded-md border border-input px-2 py-1"
            value={actors}
            onChange={(e) => setActors(e.target.value)}
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Precondiciones (separadas por coma)
          <input
            className="rounded-md border border-input px-2 py-1"
            value={preconditions}
            onChange={(e) => setPreconditions(e.target.value)}
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Postcondiciones (separadas por coma)
          <input
            className="rounded-md border border-input px-2 py-1"
            value={postconditions}
            onChange={(e) => setPostconditions(e.target.value)}
          />
        </label>
      </div>
      {existingRequirements.length > 0 ? (
        <fieldset className="rounded-md border border-border p-2">
          <legend className="px-1 text-sm font-medium text-foreground/80">
            Depende de (opcional)
          </legend>
          <ul className="flex flex-col gap-1 text-sm">
            {existingRequirements.map((r) => (
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
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={submitting}
          className="rounded-md bg-gray-900 px-3 py-1.5 text-sm text-white disabled:opacity-50"
        >
          {submitting ? 'Creando…' : 'Crear Requisito'}
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
