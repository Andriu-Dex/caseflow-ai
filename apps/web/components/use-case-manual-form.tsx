'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import type { RequirementResponse, UseCaseResponse } from '@caseflow-ai/contracts';
import { api, ApiError } from '../lib/api';
import { csv, useRows } from '../lib/use-rows';
import { TagInput } from './tag-input';

// Manual (non-AI) Use Case creation (spec: "CASEflow remains functional
// without an AI provider"). Mirrors the AI candidate's field set exactly,
// but the user fills it in directly; no ArtifactVersion UUID typing —
// Requirements are offered as selectable cards.
export function UseCaseManualForm({
  projectId,
  approvedRequirements,
  initial,
  onCreated,
  onCancel,
}: {
  projectId: string;
  approvedRequirements: RequirementResponse[];
  initial?: UseCaseResponse;
  onCreated: () => void;
  onCancel: () => void;
}) {
  const u0 = initial?.useCase;
  const [name, setName] = useState(u0?.name ?? '');
  const [objective, setObjective] = useState(u0?.objective ?? '');
  const [primaryActor, setPrimaryActor] = useState(u0?.primaryActor ?? '');
  const [secondaryActors, setSecondaryActors] = useState(u0?.secondaryActors.join(', ') ?? '');
  const [preconditions, setPreconditions] = useState(u0?.preconditions.join(', ') ?? '');
  const [postconditions, setPostconditions] = useState(u0?.postconditions.join(', ') ?? '');
  const [relatedRequirementVersionIds, setRelatedRequirementVersionIds] = useState<string[]>(
    u0?.relatedRequirementVersionIds ?? [],
  );
  const mainFlow = useRows<{ actor: string; action: string }>(
    u0?.mainFlow.map((s) => ({ actor: s.actor, action: s.action })) ?? [{ actor: '', action: '' }],
  );
  const alternativeFlows = useRows<{
    name: string;
    condition: string;
    stepsText: string;
  }>(
    u0?.alternativeFlows.map((f) => ({
      name: f.name,
      condition: f.condition,
      stepsText: f.steps.map((s) => `${s.actor}: ${s.action}`).join('\n'),
    })) ?? [],
  );
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
    const steps = mainFlow.rows.filter((s) => s.actor.trim() && s.action.trim());
    if (!steps.length) {
      toast.error('Agregue al menos un paso del flujo principal.');
      return;
    }
    if (!relatedRequirementVersionIds.length) {
      toast.error('Seleccione al menos un requisito relacionado.');
      return;
    }
    const parsedAlternativeFlows = alternativeFlows.rows
      .filter((f) => f.name.trim() && f.condition.trim() && f.stepsText.trim())
      .map((f) => ({ name: f.name, condition: f.condition, steps: parseSteps(f.stepsText) }));
    setSubmitting(true);
    try {
      const input = {
        name,
        objective,
        primaryActor,
        secondaryActors: csv(secondaryActors),
        preconditions: csv(preconditions),
        postconditions: csv(postconditions),
        mainFlow: steps,
        alternativeFlows: parsedAlternativeFlows,
        relatedRequirementVersionIds,
      };
      if (initial) {
        await api.useCases.createVersion(projectId, initial.id, input);
        toast.success(
          `${initial.code} actualizado. La nueva versión queda pendiente de aprobación.`,
        );
      } else {
        await api.useCases.create(projectId, input);
        toast.success('Caso de uso creado.');
      }
      onCreated();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'No se pudo guardar el caso de uso.');
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
        {initial ? `Editar ${initial.code}` : 'Nuevo caso de uso'}
      </h2>
      <div className="grid gap-3 sm:grid-cols-2">
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
          Actor primario
          <input
            required
            className="rounded-md border border-input px-2 py-1"
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
          className="rounded-md border border-input px-2 py-1"
          value={objective}
          onChange={(e) => setObjective(e.target.value)}
        />
      </label>
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="flex flex-col gap-1 text-sm">
          Actores secundarios (separados por coma)
          <TagInput value={secondaryActors} onChange={setSecondaryActors} />
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

      <fieldset className="rounded-md border border-border p-2">
        <legend className="px-1 text-sm font-medium text-foreground/80">Flujo principal</legend>
        {mainFlow.rows.map((step, i) => (
          <div key={i} className="mb-1 flex gap-2">
            <input
              aria-label={`Actor del paso ${i + 1}`}
              placeholder="Actor"
              className="w-1/3 rounded-md border border-input px-2 py-1 text-sm"
              value={step.actor}
              onChange={(e) => mainFlow.update(i, { actor: e.target.value })}
            />
            <input
              aria-label={`Acción del paso ${i + 1}`}
              placeholder="Acción"
              className="flex-1 rounded-md border border-input px-2 py-1 text-sm"
              value={step.action}
              onChange={(e) => mainFlow.update(i, { action: e.target.value })}
            />
            <button
              type="button"
              onClick={() => mainFlow.remove(i)}
              className="text-sm text-destructive"
              aria-label={`Eliminar paso ${i + 1}`}
            >
              ✕
            </button>
          </div>
        ))}
        <button
          type="button"
          onClick={() => mainFlow.add({ actor: '', action: '' })}
          className="text-sm text-muted-foreground underline"
        >
          + Agregar paso
        </button>
      </fieldset>

      <fieldset className="rounded-md border border-border p-2">
        <legend className="px-1 text-sm font-medium text-foreground/80">
          Flujos alternativos (opcional)
        </legend>
        {alternativeFlows.rows.map((flow, i) => (
          <div key={i} className="mb-2 flex flex-col gap-1 rounded-md border border-border p-2">
            <div className="flex gap-2">
              <input
                aria-label={`Nombre del flujo alternativo ${i + 1}`}
                placeholder="Nombre"
                className="w-1/3 rounded-md border border-input px-2 py-1 text-sm"
                value={flow.name}
                onChange={(e) => alternativeFlows.update(i, { name: e.target.value })}
              />
              <input
                aria-label={`Condición del flujo alternativo ${i + 1}`}
                placeholder="Condición"
                className="flex-1 rounded-md border border-input px-2 py-1 text-sm"
                value={flow.condition}
                onChange={(e) => alternativeFlows.update(i, { condition: e.target.value })}
              />
              <button
                type="button"
                onClick={() => alternativeFlows.remove(i)}
                className="text-sm text-destructive"
                aria-label={`Eliminar flujo alternativo ${i + 1}`}
              >
                ✕
              </button>
            </div>
            <textarea
              aria-label={`Pasos del flujo alternativo ${i + 1}`}
              placeholder={'Un paso por línea: Actor: acción'}
              rows={2}
              className="rounded-md border border-input px-2 py-1 text-sm"
              value={flow.stepsText}
              onChange={(e) => alternativeFlows.update(i, { stepsText: e.target.value })}
            />
          </div>
        ))}
        <button
          type="button"
          onClick={() => alternativeFlows.add({ name: '', condition: '', stepsText: '' })}
          className="text-sm text-muted-foreground underline"
        >
          + Agregar flujo alternativo
        </button>
      </fieldset>

      <fieldset className="rounded-md border border-border p-2">
        <legend className="px-1 text-sm font-medium text-foreground/80">
          Requisitos relacionados
        </legend>
        {approvedRequirements.length === 0 ? (
          <p className="text-sm text-muted-foreground">Aún no hay requisitos aprobados.</p>
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

      <div className="flex gap-2">
        <button
          type="submit"
          disabled={submitting}
          className="rounded-md bg-primary px-3 py-1.5 text-sm text-white disabled:opacity-50"
        >
          {submitting ? 'Guardando…' : initial ? 'Guardar cambios' : 'Crear caso de uso'}
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
