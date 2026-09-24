'use client';

import { useState } from 'react';
import type { RequirementPriority, RequirementType } from '@caseflow-ai/contracts';
import { REQUIREMENT_PRIORITIES, REQUIREMENT_TYPES } from '@caseflow-ai/contracts';
import { api, ApiError } from '../lib/api';
import { csv } from '../lib/use-rows';

// Manual (non-AI) Requirement creation (spec: CASEflow remains functional
// without a configured AI provider) — this was the missing manual path for
// the first artifact type downstream of an approved Project Context.
export function RequirementManualForm({
  projectId,
  onCreated,
  onCancel,
}: {
  projectId: string;
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
        dependencyArtifactIds: [],
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
      className="flex flex-col gap-3 rounded-lg border border-gray-200 bg-white p-4"
    >
      <h2 className="text-sm font-semibold text-gray-900">Crear Requisito manualmente</h2>
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="flex flex-col gap-1 text-sm">
          Tipo
          <select
            className="rounded-md border border-gray-300 px-2 py-1"
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
            className="rounded-md border border-gray-300 px-2 py-1"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Prioridad
          <select
            className="rounded-md border border-gray-300 px-2 py-1"
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
          className="rounded-md border border-gray-300 px-2 py-1"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </label>
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="flex flex-col gap-1 text-sm">
          Actores (separados por coma)
          <input
            className="rounded-md border border-gray-300 px-2 py-1"
            value={actors}
            onChange={(e) => setActors(e.target.value)}
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Precondiciones (separadas por coma)
          <input
            className="rounded-md border border-gray-300 px-2 py-1"
            value={preconditions}
            onChange={(e) => setPreconditions(e.target.value)}
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Postcondiciones (separadas por coma)
          <input
            className="rounded-md border border-gray-300 px-2 py-1"
            value={postconditions}
            onChange={(e) => setPostconditions(e.target.value)}
          />
        </label>
      </div>
      {error ? <p className="text-sm text-red-600">{error}</p> : null}
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={submitting}
          className="rounded-md bg-gray-900 px-3 py-1.5 text-sm text-white disabled:opacity-50"
        >
          {submitting ? 'Creando…' : 'Crear Requisito'}
        </button>
        <button type="button" onClick={onCancel} className="text-sm text-gray-600 underline">
          Cancelar
        </button>
      </div>
    </form>
  );
}
