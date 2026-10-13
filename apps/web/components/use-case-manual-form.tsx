'use client';

import { useState, type ReactNode } from 'react';
import { toast } from 'sonner';
import { Check, GitBranch, Plus, Search, Trash2, X } from 'lucide-react';
import type { RequirementResponse, UseCaseResponse } from '@caseflow-ai/contracts';
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Textarea,
} from '@caseflow-ai/ui';
import { api, ApiError } from '../lib/api';

// Manual (non-AI) Use Case creation, and editing when `initial` is given (an
// edit opens a new version). A dialog in sections; every list (conditions,
// flow steps, alternative flows) is edited one row per item, so no separator
// can split an entry.

type Step = { actor: string; action: string };
type Flow = { name: string; condition: string; steps: Step[] };
type Relation = UseCaseResponse['useCase']['relations'][number];

const selectClass = 'h-9 rounded-md border border-input bg-background px-2 text-sm';
const RELATION_LABELS: Record<Relation['kind'], string> = {
  INCLUDE: 'Incluye siempre a',
  EXTEND: 'Extiende a (opcional)',
};

// «include» and «extend» towards other use cases of the project.
function RelationRows({
  relations,
  options,
  onChange,
}: {
  relations: Relation[];
  options: UseCaseResponse[];
  onChange: (relations: Relation[]) => void;
}) {
  const update = (i: number, patch: Partial<Relation>) =>
    onChange(relations.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const free = options.filter((o) => !relations.some((r) => r.targetUseCaseId === o.id));
  return (
    <div className="flex flex-col gap-1.5">
      {relations.map((relation, i) => (
        <div key={i} className="flex flex-wrap items-center gap-2 sm:flex-nowrap">
          <select
            aria-label={`Tipo de la relación ${i + 1}`}
            className={`${selectClass} w-48 shrink-0`}
            value={relation.kind}
            onChange={(e) => update(i, { kind: e.target.value as Relation['kind'] })}
          >
            {(Object.keys(RELATION_LABELS) as Relation['kind'][]).map((kind) => (
              <option key={kind} value={kind}>
                {RELATION_LABELS[kind]}
              </option>
            ))}
          </select>
          <select
            aria-label={`Caso de uso de la relación ${i + 1}`}
            className={`${selectClass} min-w-0 flex-1`}
            value={relation.targetUseCaseId}
            onChange={(e) => update(i, { targetUseCaseId: e.target.value })}
          >
            {options
              .filter((o) => o.id === relation.targetUseCaseId || free.includes(o))
              .map((o) => (
                <option key={o.id} value={o.id}>
                  {o.code} {o.useCase.name}
                </option>
              ))}
          </select>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="size-8 shrink-0 p-0 text-muted-foreground"
            aria-label={`Quitar la relación ${i + 1}`}
            onClick={() => onChange(relations.filter((_, j) => j !== i))}
          >
            <X className="size-4" aria-hidden="true" />
          </Button>
        </div>
      ))}
      {free.length ? (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="w-fit text-primary"
          onClick={() =>
            onChange([...relations, { kind: 'INCLUDE', targetUseCaseId: free[0]!.id }])
          }
        >
          <Plus className="size-4" aria-hidden="true" />
          Agregar relación
        </Button>
      ) : relations.length ? null : (
        <p className="text-xs text-muted-foreground">Aún no hay otros casos de uso.</p>
      )}
    </div>
  );
}

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <fieldset className="flex flex-col gap-3 rounded-lg border border-border p-4">
      <legend className="px-1 text-sm font-semibold text-foreground">{title}</legend>
      {description ? <p className="-mt-1 text-xs text-muted-foreground">{description}</p> : null}
      {children}
    </fieldset>
  );
}

function TextRows({
  label,
  addLabel,
  values,
  onChange,
}: {
  label: string;
  addLabel: string;
  values: string[];
  onChange: (values: string[]) => void;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-sm font-medium text-foreground">{label}</span>
      {values.map((value, i) => (
        <div key={i} className="flex items-center gap-2">
          <span className="w-5 shrink-0 text-right text-xs text-muted-foreground">{i + 1}.</span>
          <Input
            aria-label={`${label} ${i + 1}`}
            value={value}
            onChange={(e) => onChange(values.map((v, j) => (j === i ? e.target.value : v)))}
          />
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="size-8 shrink-0 p-0 text-muted-foreground"
            aria-label={`Quitar ${label.toLowerCase()} ${i + 1}`}
            onClick={() => onChange(values.filter((_, j) => j !== i))}
          >
            <X className="size-4" aria-hidden="true" />
          </Button>
        </div>
      ))}
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="w-fit text-primary"
        onClick={() => onChange([...values, ''])}
      >
        <Plus className="size-4" aria-hidden="true" />
        {addLabel}
      </Button>
    </div>
  );
}

// Numbered steps, each an actor and what it does.
function StepRows({
  steps,
  onChange,
  suffix = '',
}: {
  steps: Step[];
  onChange: (steps: Step[]) => void;
  suffix?: string;
}) {
  const update = (i: number, patch: Partial<Step>) =>
    onChange(steps.map((s, j) => (j === i ? { ...s, ...patch } : s)));
  return (
    <div className="flex flex-col gap-1.5">
      {steps.map((step, i) => (
        <div key={i} className="flex items-center gap-2">
          <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
            {i + 1}
          </span>
          <Input
            aria-label={`Actor del paso ${i + 1}${suffix}`}
            placeholder="Actor"
            className="w-36 shrink-0"
            value={step.actor}
            onChange={(e) => update(i, { actor: e.target.value })}
          />
          <Input
            aria-label={`Acción del paso ${i + 1}${suffix}`}
            placeholder="Qué hace"
            value={step.action}
            onChange={(e) => update(i, { action: e.target.value })}
          />
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="size-8 shrink-0 p-0 text-muted-foreground"
            aria-label={`Quitar el paso ${i + 1}${suffix}`}
            disabled={steps.length === 1}
            onClick={() => onChange(steps.filter((_, j) => j !== i))}
          >
            <X className="size-4" aria-hidden="true" />
          </Button>
        </div>
      ))}
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="w-fit text-primary"
        onClick={() => onChange([...steps, { actor: steps.at(-1)?.actor ?? '', action: '' }])}
      >
        <Plus className="size-4" aria-hidden="true" />
        Agregar paso
      </Button>
    </div>
  );
}

function RequirementPicker({
  options,
  selected,
  onChange,
}: {
  options: RequirementResponse[];
  selected: string[];
  onChange: (ids: string[]) => void;
}) {
  const [query, setQuery] = useState('');
  const q = query.trim().toLocaleLowerCase('es');
  const visible = options.filter(
    (r) => !q || `${r.code} ${r.requirement.name}`.toLocaleLowerCase('es').includes(q),
  );
  const toggle = (id: string) =>
    onChange(selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id]);
  return (
    <div className="flex flex-col gap-2">
      {options.length > 6 ? (
        <div className="relative">
          <Search
            className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <Input
            type="search"
            aria-label="Buscar requisito"
            placeholder="Buscar por código o nombre"
            className="pl-8"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
      ) : null}
      <ul className="flex max-h-56 flex-col divide-y divide-border overflow-y-auto rounded-md border border-border">
        {visible.map((r) => (
          <li key={r.id}>
            <label className="flex cursor-pointer items-center gap-3 px-3 py-2 text-sm hover:bg-muted/40">
              <input
                type="checkbox"
                className="size-4 shrink-0 accent-primary"
                checked={selected.includes(r.version.id)}
                onChange={() => toggle(r.version.id)}
                aria-label={`${r.code} ${r.requirement.name}`}
              />
              <span className="font-mono text-xs font-semibold text-muted-foreground">
                {r.code}
              </span>
              <span className="text-foreground/90">{r.requirement.name}</span>
            </label>
          </li>
        ))}
        {visible.length === 0 ? (
          <li className="px-3 py-4 text-center text-sm text-muted-foreground">
            {options.length ? 'Nada coincide con la búsqueda.' : 'Aún no hay requisitos aprobados.'}
          </li>
        ) : null}
      </ul>
      <p className="text-xs text-muted-foreground" aria-live="polite">
        {selected.length === 0
          ? 'Seleccione al menos un requisito.'
          : `${selected.length} ${selected.length === 1 ? 'requisito seleccionado' : 'requisitos seleccionados'}.`}
      </p>
    </div>
  );
}

export function UseCaseManualForm({
  projectId,
  approvedRequirements,
  useCases = [],
  initial,
  onCreated,
  onCancel,
}: {
  projectId: string;
  approvedRequirements: RequirementResponse[];
  // The project's use cases, candidates for «include» / «extend».
  useCases?: UseCaseResponse[];
  initial?: UseCaseResponse;
  onCreated: () => void;
  onCancel: () => void;
}) {
  const u0 = initial?.useCase;
  const [name, setName] = useState(u0?.name ?? '');
  const [objective, setObjective] = useState(u0?.objective ?? '');
  const [primaryActor, setPrimaryActor] = useState(u0?.primaryActor ?? '');
  const [secondaryActors, setSecondaryActors] = useState<string[]>(u0?.secondaryActors ?? []);
  const [preconditions, setPreconditions] = useState<string[]>(u0?.preconditions ?? []);
  const [postconditions, setPostconditions] = useState<string[]>(u0?.postconditions ?? []);
  const [relatedRequirementVersionIds, setRelatedRequirementVersionIds] = useState<string[]>(
    u0?.relatedRequirementVersionIds ?? [],
  );
  const [mainFlow, setMainFlow] = useState<Step[]>(
    u0?.mainFlow.map(({ actor, action }) => ({ actor, action })) ?? [{ actor: '', action: '' }],
  );
  const [alternativeFlows, setAlternativeFlows] = useState<Flow[]>(
    u0?.alternativeFlows.map((f) => ({
      name: f.name,
      condition: f.condition,
      steps: f.steps.map(({ actor, action }) => ({ actor, action })),
    })) ?? [],
  );
  const [relations, setRelations] = useState<Relation[]>(u0?.relations ?? []);
  const [submitting, setSubmitting] = useState(false);

  const clean = (values: string[]) => values.map((v) => v.trim()).filter(Boolean);
  const cleanSteps = (steps: Step[]) =>
    steps
      .map((s) => ({ actor: s.actor.trim(), action: s.action.trim() }))
      .filter((s) => s.actor && s.action);
  const updateFlow = (i: number, patch: Partial<Flow>) =>
    setAlternativeFlows((flows) => flows.map((f, j) => (j === i ? { ...f, ...patch } : f)));

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const steps = cleanSteps(mainFlow);
    if (!steps.length) {
      toast.error('Agregue al menos un paso del flujo principal.');
      return;
    }
    if (!relatedRequirementVersionIds.length) {
      toast.error('Seleccione al menos un requisito relacionado.');
      return;
    }
    const flows = alternativeFlows
      .map((f) => ({
        name: f.name.trim(),
        condition: f.condition.trim(),
        steps: cleanSteps(f.steps),
      }))
      .filter((f) => f.name && f.condition && f.steps.length);
    setSubmitting(true);
    try {
      const input = {
        name,
        objective,
        primaryActor,
        secondaryActors: clean(secondaryActors),
        preconditions: clean(preconditions),
        postconditions: clean(postconditions),
        mainFlow: steps,
        alternativeFlows: flows,
        relatedRequirementVersionIds,
        relations,
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
    <Dialog open onOpenChange={(open) => (open ? null : onCancel())}>
      <DialogContent className="max-h-[92vh] gap-0 overflow-hidden p-0 sm:max-w-3xl">
        <form onSubmit={handleSubmit} className="flex max-h-[92vh] flex-col">
          <DialogHeader className="border-b border-border px-6 py-4">
            <DialogTitle>{initial ? `Editar ${initial.code}` : 'Nuevo caso de uso'}</DialogTitle>
            <DialogDescription>
              {initial
                ? `Al guardar se crea la versión ${initial.version.versionNumber + 1}, que necesitará aprobarse de nuevo. La versión actual no cambia.`
                : 'Describa un proceso que el sistema resuelve, paso a paso. Podrá aprobarlo después.'}
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-5 overflow-y-auto px-6 py-5">
            <Section title="Qué logra">
              <label className="flex flex-col gap-1.5 text-sm font-medium">
                Nombre
                <Input
                  required
                  maxLength={200}
                  value={name}
                  placeholder="Por ejemplo: Registrar un pedido"
                  onChange={(e) => setName(e.target.value)}
                />
              </label>
              <label className="flex flex-col gap-1.5 text-sm font-medium">
                Objetivo
                <Textarea
                  required
                  rows={3}
                  value={objective}
                  placeholder="Qué consigue el actor al terminar"
                  onChange={(e) => setObjective(e.target.value)}
                />
              </label>
            </Section>

            <Section title="Requisitos que realiza">
              <RequirementPicker
                options={approvedRequirements}
                selected={relatedRequirementVersionIds}
                onChange={setRelatedRequirementVersionIds}
              />
            </Section>

            <Section title="Actores">
              <label className="flex flex-col gap-1.5 text-sm font-medium">
                Actor primario
                <Input
                  required
                  value={primaryActor}
                  placeholder="Quién inicia el caso de uso"
                  onChange={(e) => setPrimaryActor(e.target.value)}
                />
              </label>
              <TextRows
                label="Actores secundarios"
                addLabel="Agregar actor secundario"
                values={secondaryActors}
                onChange={setSecondaryActors}
              />
            </Section>

            <Section title="Condiciones">
              <TextRows
                label="Precondiciones"
                addLabel="Agregar precondición"
                values={preconditions}
                onChange={setPreconditions}
              />
              <TextRows
                label="Postcondiciones"
                addLabel="Agregar postcondición"
                values={postconditions}
                onChange={setPostconditions}
              />
            </Section>

            <Section
              title="Relaciones con otros casos de uso"
              description="«Incluye» un comportamiento que siempre ocurre; «extiende» otro caso con un comportamiento opcional (opcional)."
            >
              <RelationRows
                relations={relations}
                options={useCases.filter((u) => u.id !== initial?.id)}
                onChange={setRelations}
              />
            </Section>

            <Section title="Flujo principal" description="Los pasos del camino habitual, en orden.">
              <StepRows steps={mainFlow} onChange={setMainFlow} />
            </Section>

            <Section
              title="Flujos alternativos"
              description="Qué ocurre cuando algo se desvía del camino habitual (opcional)."
            >
              {alternativeFlows.map((flow, i) => (
                <div
                  key={i}
                  className="flex flex-col gap-2 rounded-md border border-dashed border-border p-3"
                >
                  <div className="flex items-center gap-2">
                    <GitBranch
                      className="size-4 shrink-0 text-muted-foreground"
                      aria-hidden="true"
                    />
                    <Input
                      aria-label={`Nombre del flujo alternativo ${i + 1}`}
                      placeholder="Nombre del flujo"
                      value={flow.name}
                      onChange={(e) => updateFlow(i, { name: e.target.value })}
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="size-8 shrink-0 p-0 text-muted-foreground"
                      aria-label={`Quitar el flujo alternativo ${i + 1}`}
                      onClick={() =>
                        setAlternativeFlows((flows) => flows.filter((_, j) => j !== i))
                      }
                    >
                      <Trash2 className="size-4" aria-hidden="true" />
                    </Button>
                  </div>
                  <Input
                    aria-label={`Condición del flujo alternativo ${i + 1}`}
                    placeholder="Cuándo ocurre"
                    value={flow.condition}
                    onChange={(e) => updateFlow(i, { condition: e.target.value })}
                  />
                  <StepRows
                    steps={flow.steps}
                    suffix={` del flujo alternativo ${i + 1}`}
                    onChange={(steps) => updateFlow(i, { steps })}
                  />
                </div>
              ))}
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="w-fit text-primary"
                onClick={() =>
                  setAlternativeFlows((flows) => [
                    ...flows,
                    { name: '', condition: '', steps: [{ actor: '', action: '' }] },
                  ])
                }
              >
                <Plus className="size-4" aria-hidden="true" />
                Agregar flujo alternativo
              </Button>
            </Section>
          </div>

          <DialogFooter className="border-t border-border px-6 py-4">
            <Button type="button" variant="ghost" onClick={onCancel}>
              Cancelar
            </Button>
            <Button type="submit" disabled={submitting}>
              <Check className="size-4" aria-hidden="true" />
              {submitting ? 'Guardando…' : initial ? 'Guardar cambios' : 'Crear caso de uso'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
