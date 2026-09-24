'use client';

import { useState } from 'react';
import type { RequirementResponse } from '@caseflow-ai/contracts';
import { api, ApiError } from '../lib/api';
import { csv, useRows } from '../lib/use-rows';

// Manual (non-AI) Use Case creation (spec: "CASEflow remains functional
// without an AI provider"). Mirrors the AI candidate's field set exactly,
// but the user fills it in directly; no ArtifactVersion UUID typing —
// Requirements are offered as selectable cards.
export function UseCaseManualForm({
  projectId,
  approvedRequirements,
  onCreated,
  onCancel,
}: {
  projectId: string;
  approvedRequirements: RequirementResponse[];
  onCreated: () => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState('');
  const [objective, setObjective] = useState('');
  const [primaryActor, setPrimaryActor] = useState('');
  const [secondaryActors, setSecondaryActors] = useState('');
  const [preconditions, setPreconditions] = useState('');
  const [postconditions, setPostconditions] = useState('');
  const [relatedRequirementVersionIds, setRelatedRequirementVersionIds] = useState<string[]>([]);
  const mainFlow = useRows<{ actor: string; action: string }>([{ actor: '', action: '' }]);
  const alternativeFlows = useRows<{
    name: string;
    condition: string;
    stepsText: string;
  }>([]);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Each alternative flow's steps are entered as "actor: acción" per line —
  // a lighter editor than a fully nested step-by-step table, while still
  // representing every backend-required field (name/condition/steps).
  function parseSteps(text: string) {
    return text
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const [actor, ...rest] = line.split(':');
        return {
          actor: (actor ?? '').trim(),
          action: rest.join(':').trim() || (actor ?? '').trim(),
        };
      });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const steps = mainFlow.rows.filter((s) => s.actor.trim() && s.action.trim());
    if (!steps.length) {
      setError('Agregue al menos un paso del flujo principal.');
      return;
    }
    if (!relatedRequirementVersionIds.length) {
      setError('Seleccione al menos un Requisito relacionado.');
      return;
    }
    const parsedAlternativeFlows = alternativeFlows.rows
      .filter((f) => f.name.trim() && f.condition.trim() && f.stepsText.trim())
      .map((f) => ({ name: f.name, condition: f.condition, steps: parseSteps(f.stepsText) }));
    setSubmitting(true);
    try {
      await api.useCases.create(projectId, {
        name,
        objective,
        primaryActor,
        secondaryActors: csv(secondaryActors),
        preconditions: csv(preconditions),
        postconditions: csv(postconditions),
        mainFlow: steps,
        alternativeFlows: parsedAlternativeFlows,
        relatedRequirementVersionIds,
      });
      onCreated();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo crear el Caso de Uso.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="flex flex-col gap-3 rounded-lg border border-gray-200 bg-white p-4"
    >
      <h2 className="text-sm font-semibold text-gray-900">Crear Caso de Uso manualmente</h2>
      <div className="grid gap-3 sm:grid-cols-2">
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
          Actor primario
          <input
            required
            className="rounded-md border border-gray-300 px-2 py-1"
            value={primaryActor}
            onChange={(e) => setPrimaryActor(e.target.value)}
          />
        </label>
      </div>
      <label className="flex flex-col gap-1 text-sm">
        Objetivo
        <textarea
          required
          rows={2}
          className="rounded-md border border-gray-300 px-2 py-1"
          value={objective}
          onChange={(e) => setObjective(e.target.value)}
        />
      </label>
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="flex flex-col gap-1 text-sm">
          Actores secundarios (separados por coma)
          <input
            className="rounded-md border border-gray-300 px-2 py-1"
            value={secondaryActors}
            onChange={(e) => setSecondaryActors(e.target.value)}
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

      <fieldset className="rounded-md border border-gray-200 p-2">
        <legend className="px-1 text-sm font-medium text-gray-700">Flujo principal</legend>
        {mainFlow.rows.map((step, i) => (
          <div key={i} className="mb-1 flex gap-2">
            <input
              aria-label={`Actor del paso ${i + 1}`}
              placeholder="Actor"
              className="w-1/3 rounded-md border border-gray-300 px-2 py-1 text-sm"
              value={step.actor}
              onChange={(e) => mainFlow.update(i, { actor: e.target.value })}
            />
            <input
              aria-label={`Acción del paso ${i + 1}`}
              placeholder="Acción"
              className="flex-1 rounded-md border border-gray-300 px-2 py-1 text-sm"
              value={step.action}
              onChange={(e) => mainFlow.update(i, { action: e.target.value })}
            />
            <button
              type="button"
              onClick={() => mainFlow.remove(i)}
              className="text-sm text-red-600"
              aria-label={`Eliminar paso ${i + 1}`}
            >
              ✕
            </button>
          </div>
        ))}
        <button
          type="button"
          onClick={() => mainFlow.add({ actor: '', action: '' })}
          className="text-sm text-gray-600 underline"
        >
          + Agregar paso
        </button>
      </fieldset>

      <fieldset className="rounded-md border border-gray-200 p-2">
        <legend className="px-1 text-sm font-medium text-gray-700">
          Flujos alternativos (opcional)
        </legend>
        {alternativeFlows.rows.map((flow, i) => (
          <div key={i} className="mb-2 flex flex-col gap-1 rounded-md border border-gray-100 p-2">
            <div className="flex gap-2">
              <input
                aria-label={`Nombre del flujo alternativo ${i + 1}`}
                placeholder="Nombre"
                className="w-1/3 rounded-md border border-gray-300 px-2 py-1 text-sm"
                value={flow.name}
                onChange={(e) => alternativeFlows.update(i, { name: e.target.value })}
              />
              <input
                aria-label={`Condición del flujo alternativo ${i + 1}`}
                placeholder="Condición"
                className="flex-1 rounded-md border border-gray-300 px-2 py-1 text-sm"
                value={flow.condition}
                onChange={(e) => alternativeFlows.update(i, { condition: e.target.value })}
              />
              <button
                type="button"
                onClick={() => alternativeFlows.remove(i)}
                className="text-sm text-red-600"
                aria-label={`Eliminar flujo alternativo ${i + 1}`}
              >
                ✕
              </button>
            </div>
            <textarea
              aria-label={`Pasos del flujo alternativo ${i + 1}`}
              placeholder={'Un paso por línea: Actor: acción'}
              rows={2}
              className="rounded-md border border-gray-300 px-2 py-1 text-sm"
              value={flow.stepsText}
              onChange={(e) => alternativeFlows.update(i, { stepsText: e.target.value })}
            />
          </div>
        ))}
        <button
          type="button"
          onClick={() => alternativeFlows.add({ name: '', condition: '', stepsText: '' })}
          className="text-sm text-gray-600 underline"
        >
          + Agregar flujo alternativo
        </button>
      </fieldset>

      <fieldset className="rounded-md border border-gray-200 p-2">
        <legend className="px-1 text-sm font-medium text-gray-700">Requisitos relacionados</legend>
        {approvedRequirements.length === 0 ? (
          <p className="text-sm text-gray-500">No hay Requisitos APPROVED todavía.</p>
        ) : (
          <ul className="flex flex-col gap-1 text-sm">
            {approvedRequirements.map((r) => (
              <li key={r.id} className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id={`ucreq-${r.id}`}
                  checked={relatedRequirementVersionIds.includes(r.version.id)}
                  onChange={() =>
                    setRelatedRequirementVersionIds((prev) =>
                      prev.includes(r.version.id)
                        ? prev.filter((id) => id !== r.version.id)
                        : [...prev, r.version.id],
                    )
                  }
                />
                <label htmlFor={`ucreq-${r.id}`}>
                  {r.code} — {r.requirement.name}
                </label>
              </li>
            ))}
          </ul>
        )}
      </fieldset>

      {error ? <p className="text-sm text-red-600">{error}</p> : null}
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={submitting}
          className="rounded-md bg-gray-900 px-3 py-1.5 text-sm text-white disabled:opacity-50"
        >
          {submitting ? 'Creando…' : 'Crear Caso de Uso'}
        </button>
        <button type="button" onClick={onCancel} className="text-sm text-gray-600 underline">
          Cancelar
        </button>
      </div>
    </form>
  );
}
