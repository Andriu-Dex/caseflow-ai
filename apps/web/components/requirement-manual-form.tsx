'use client';

import { useId, useRef, useState, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Check, Plus, Search, Target, UserCheck, X } from 'lucide-react';
import type {
  ContextItemRef,
  RequirementInput,
  RequirementPriority,
  RequirementResponse,
  RequirementType,
} from '@caseflow-ai/contracts';
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
import { ContextCode, KIND_NAMES } from './context-coverage';

// Manual requirement creation, and editing when `initial` is given: an edit
// never mutates the existing version, it submits a complete new version
// (which starts again as a draft needing approval). The form asks why the
// requirement exists (DEC-126): the context items it answers, or the user's
// own decision with its justification.

type OriginKind = 'CONTEXT' | 'USER_DECISION';

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

// One choice among a few, as buttons (a radio group for assistive tech).
function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: { value: T; label: string; icon?: ReactNode }[];
  onChange: (value: T) => void;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-sm font-medium text-foreground">{label}</span>
      <div
        role="radiogroup"
        aria-label={label}
        className="inline-flex w-fit flex-wrap gap-1 rounded-lg border border-border bg-muted/40 p-1"
      >
        {options.map((option) => {
          const active = option.value === value;
          return (
            <button
              key={option.value}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => onChange(option.value)}
              className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                active
                  ? 'bg-background text-foreground shadow-sm ring-1 ring-border'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {option.icon}
              {option.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// An ordered list edited one row per item: no separator can split a
// condition that contains commas.
function RowList({
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
  const container = useRef<HTMLDivElement>(null);
  function add() {
    onChange([...values, '']);
    // Focus the new row once it renders.
    requestAnimationFrame(() =>
      container.current?.querySelector<HTMLInputElement>('li:last-child input')?.focus(),
    );
  }
  return (
    <div ref={container} className="flex flex-col gap-1.5">
      <span className="text-sm font-medium text-foreground">{label}</span>
      {values.length ? (
        <ol className="flex flex-col gap-1.5">
          {values.map((value, i) => (
            <li key={i} className="flex items-center gap-2">
              <span className="w-5 shrink-0 text-right text-xs text-muted-foreground">
                {i + 1}.
              </span>
              <Input
                aria-label={`${label} ${i + 1}`}
                value={value}
                onChange={(e) => onChange(values.map((v, j) => (j === i ? e.target.value : v)))}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    add();
                  }
                }}
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
            </li>
          ))}
        </ol>
      ) : null}
      <Button type="button" variant="ghost" size="sm" className="w-fit text-primary" onClick={add}>
        <Plus className="size-4" aria-hidden="true" />
        {addLabel}
      </Button>
    </div>
  );
}

function ActorsField({
  actors,
  suggestions,
  onChange,
}: {
  actors: string[];
  suggestions: string[];
  onChange: (actors: string[]) => void;
}) {
  const [draft, setDraft] = useState('');
  const has = (name: string) =>
    actors.some((a) => a.toLocaleLowerCase('es') === name.toLocaleLowerCase('es'));
  function add(name: string) {
    const clean = name.trim();
    if (clean && !has(clean)) onChange([...actors, clean]);
    setDraft('');
  }
  const pending = suggestions.filter((s) => !has(s));
  return (
    <div className="flex flex-col gap-2">
      {actors.length ? (
        <ul className="flex flex-wrap gap-1.5" aria-label="Actores del requisito">
          {actors.map((actor) => (
            <li
              key={actor}
              className="inline-flex items-center gap-1 rounded-full border border-border bg-muted/50 py-0.5 pr-1 pl-2.5 text-sm"
            >
              {actor}
              <button
                type="button"
                aria-label={`Quitar ${actor}`}
                onClick={() => onChange(actors.filter((a) => a !== actor))}
                className="rounded-full p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                <X className="size-3.5" aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      <Input
        aria-label="Agregar actor"
        placeholder="Escriba un actor y pulse Enter"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            add(draft);
          }
        }}
        onBlur={() => add(draft)}
      />
      {pending.length ? (
        <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
          Del contexto:
          {pending.map((name) => (
            <button
              key={name}
              type="button"
              onClick={() => add(name)}
              className="inline-flex items-center gap-1 rounded-full border border-dashed border-primary/50 px-2 py-0.5 text-primary hover:bg-primary/5"
            >
              <Plus className="size-3" aria-hidden="true" />
              {name}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function ContextItemPicker({
  items,
  selected,
  coveredBy,
  onChange,
}: {
  items: ContextItemRef[];
  selected: string[];
  coveredBy: Map<string, string[]>;
  onChange: (ids: string[]) => void;
}) {
  const [query, setQuery] = useState('');
  const q = query.trim().toLocaleLowerCase('es');
  const visible = items.filter(
    (i) => !q || `${i.code} ${i.description}`.toLocaleLowerCase('es').includes(q),
  );
  const toggle = (id: string) =>
    onChange(selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id]);
  return (
    <div className="flex flex-col gap-2">
      {items.length > 6 ? (
        <div className="relative">
          <Search
            className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <Input
            type="search"
            aria-label="Buscar en el contexto"
            placeholder="Buscar necesidad, regla o restricción"
            className="pl-8"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
      ) : null}
      <ul
        aria-label="Elementos del contexto"
        className="flex max-h-64 flex-col divide-y divide-border overflow-y-auto rounded-md border border-border"
      >
        {visible.map((item) => {
          const checked = selected.includes(item.id);
          const others = coveredBy.get(item.id) ?? [];
          return (
            <li key={item.id}>
              <label
                className={`flex cursor-pointer items-start gap-3 px-3 py-2 text-sm hover:bg-muted/40 ${checked ? 'bg-primary/5' : ''}`}
              >
                <input
                  type="checkbox"
                  className="mt-0.5 size-4 shrink-0 accent-primary"
                  checked={checked}
                  onChange={() => toggle(item.id)}
                  aria-label={`${item.code} ${item.description}`}
                />
                <ContextCode code={item.code} kind={item.kind} />
                <span className="min-w-0 flex-1 text-foreground/90">
                  {item.description}
                  <span className="block text-xs text-muted-foreground">
                    {KIND_NAMES[item.kind].one}
                    {others.length
                      ? ` · ya lo atiende ${others.join(', ')}`
                      : checked
                        ? ' · lo atiende este requisito'
                        : ' · sin cubrir'}
                  </span>
                </span>
              </label>
            </li>
          );
        })}
        {visible.length === 0 ? (
          <li className="px-3 py-4 text-center text-sm text-muted-foreground">
            Nada coincide con la búsqueda.
          </li>
        ) : null}
      </ul>
      <p className="text-xs text-muted-foreground" aria-live="polite">
        {selected.length === 0
          ? 'Seleccione al menos un elemento.'
          : `${selected.length} ${selected.length === 1 ? 'elemento seleccionado' : 'elementos seleccionados'}.`}
      </p>
    </div>
  );
}

function DependencyPicker({
  options,
  selected,
  onChange,
}: {
  options: RequirementResponse[];
  selected: string[];
  onChange: (ids: string[]) => void;
}) {
  const [query, setQuery] = useState('');
  const listId = useId();
  const q = query.trim().toLocaleLowerCase('es');
  const byId = new Map(options.map((r) => [r.id, r]));
  const matches = options
    .filter((r) => !selected.includes(r.id))
    .filter((r) => !q || `${r.code} ${r.requirement.name}`.toLocaleLowerCase('es').includes(q))
    .slice(0, 8);
  return (
    <div className="flex flex-col gap-2">
      {selected.length ? (
        <ul className="flex flex-wrap gap-1.5" aria-label="Dependencias seleccionadas">
          {selected.map((id) => {
            const r = byId.get(id);
            return (
              <li
                key={id}
                className="inline-flex items-center gap-1.5 rounded-full border border-border bg-muted/50 py-0.5 pr-1 pl-2.5 text-sm"
              >
                <span className="font-mono text-xs text-muted-foreground">{r?.code}</span>
                {r?.requirement.name ?? 'Requisito archivado'}
                <button
                  type="button"
                  aria-label={`Quitar dependencia ${r?.code ?? ''}`}
                  onClick={() => onChange(selected.filter((x) => x !== id))}
                  className="rounded-full p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                >
                  <X className="size-3.5" aria-hidden="true" />
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}
      <div className="relative">
        <Search
          className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden="true"
        />
        <Input
          type="search"
          aria-label="Buscar requisito del que depende"
          aria-controls={listId}
          placeholder="Buscar por código o nombre"
          className="pl-8"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>
      {matches.length ? (
        <ul
          id={listId}
          aria-label="Requisitos disponibles"
          className="flex max-h-48 flex-col divide-y divide-border overflow-y-auto rounded-md border border-border"
        >
          {matches.map((r) => (
            <li key={r.id}>
              <button
                type="button"
                onClick={() => {
                  onChange([...selected, r.id]);
                  setQuery('');
                }}
                className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm hover:bg-muted/40"
              >
                <Plus className="size-3.5 shrink-0 text-primary" aria-hidden="true" />
                <span className="font-mono text-xs text-muted-foreground">{r.code}</span>
                <span className="truncate">{r.requirement.name}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : q ? (
        <p className="text-xs text-muted-foreground">Ningún requisito coincide.</p>
      ) : null}
    </div>
  );
}

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
  const coverage = useQuery({
    queryKey: ['requirements-coverage', projectId],
    queryFn: () => api.requirements.contextCoverage(projectId),
  });
  const context = useQuery({
    queryKey: ['context', projectId],
    queryFn: () => api.context.getCurrent(projectId),
    retry: false,
  });

  const [requirementType, setRequirementType] = useState<RequirementType>(
    r0?.requirementType ?? 'FUNCTIONAL',
  );
  const [name, setName] = useState(r0?.name ?? '');
  const [description, setDescription] = useState(r0?.description ?? '');
  const [priority, setPriority] = useState<RequirementPriority>(r0?.priority ?? 'MEDIUM');
  const [originKind, setOriginKind] = useState<OriginKind>(r0?.origin?.kind ?? 'CONTEXT');
  const [contextItemIds, setContextItemIds] = useState<string[]>(
    r0?.origin?.contextItems.map((i) => i.id) ?? [],
  );
  const [justification, setJustification] = useState(r0?.origin?.justification ?? '');
  const [actors, setActors] = useState<string[]>(r0?.actors ?? []);
  const [preconditions, setPreconditions] = useState<string[]>(r0?.preconditions ?? []);
  const [postconditions, setPostconditions] = useState<string[]>(r0?.postconditions ?? []);
  // Dependencies point at the Requirement Artifact's stable id, never a
  // version id.
  const [dependencyArtifactIds, setDependencyArtifactIds] = useState<string[]>(
    r0?.dependencyArtifactIds ?? [],
  );
  const [submitting, setSubmitting] = useState(false);

  // The approved context's items, plus any older item this version cites.
  const currentItems = coverage.data?.items ?? [];
  const contextItems: ContextItemRef[] = [
    ...currentItems,
    ...(r0?.origin?.contextItems ?? []).filter((i) => !currentItems.some((c) => c.id === i.id)),
  ];
  const coveredBy = new Map(
    currentItems.map((i) => [i.id, i.coveredBy.filter((code) => code !== initial?.code)]),
  );
  const contextActors = context.data?.actors.map((a) => a.name) ?? [];
  const hasContext = contextItems.length > 0;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (originKind === 'CONTEXT' && contextItemIds.length === 0) {
      toast.error('Seleccione qué elementos del contexto atiende este requisito.');
      return;
    }
    if (originKind === 'USER_DECISION' && !justification.trim()) {
      toast.error('Explique por qué se incluye este requisito.');
      return;
    }
    setSubmitting(true);
    const clean = (values: string[]) => values.map((v) => v.trim()).filter(Boolean);
    const input: RequirementInput = {
      requirementType,
      name,
      description,
      priority,
      actors,
      preconditions: clean(preconditions),
      postconditions: clean(postconditions),
      dependencyArtifactIds,
      origin:
        originKind === 'CONTEXT'
          ? { kind: 'CONTEXT', contextItemIds }
          : { kind: 'USER_DECISION', justification: justification.trim() },
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
    <Dialog open onOpenChange={(open) => (open ? null : onCancel())}>
      <DialogContent className="max-h-[92vh] gap-0 overflow-hidden p-0 sm:max-w-3xl">
        <form onSubmit={handleSubmit} className="flex max-h-[92vh] flex-col">
          <DialogHeader className="border-b border-border px-6 py-4">
            <DialogTitle>{initial ? `Editar ${initial.code}` : 'Nuevo requisito'}</DialogTitle>
            <DialogDescription>
              {initial
                ? `Al guardar se crea la versión ${initial.version.versionNumber + 1}, que necesitará aprobarse de nuevo. La versión actual no cambia.`
                : 'Describa qué debe hacer el sistema y por qué. Podrá aprobarlo después.'}
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-5 overflow-y-auto px-6 py-5">
            <Section title="Qué debe cumplir">
              <div className="flex flex-wrap gap-x-8 gap-y-3">
                <Segmented
                  label="Tipo"
                  value={requirementType}
                  onChange={setRequirementType}
                  options={[
                    { value: 'FUNCTIONAL', label: 'Funcional (RF)' },
                    { value: 'NON_FUNCTIONAL', label: 'No funcional (RNF)' },
                  ]}
                />
                <Segmented
                  label="Prioridad"
                  value={priority}
                  onChange={setPriority}
                  options={[
                    { value: 'HIGH', label: 'Alta' },
                    { value: 'MEDIUM', label: 'Media' },
                    { value: 'LOW', label: 'Baja' },
                  ]}
                />
              </div>
              <label className="flex flex-col gap-1.5 text-sm font-medium">
                Nombre
                <Input
                  required
                  value={name}
                  maxLength={200}
                  placeholder="Por ejemplo: Registrar un pedido"
                  onChange={(e) => setName(e.target.value)}
                />
              </label>
              <label className="flex flex-col gap-1.5 text-sm font-medium">
                Descripción
                <Textarea
                  required
                  rows={4}
                  value={description}
                  placeholder="El sistema debe permitir…"
                  onChange={(e) => setDescription(e.target.value)}
                />
              </label>
            </Section>

            <Section
              title="Por qué existe"
              description="Todo requisito responde al contexto aprobado o a una decisión justificada."
            >
              <Segmented
                label="Origen"
                value={originKind}
                onChange={setOriginKind}
                options={[
                  {
                    value: 'CONTEXT',
                    label: 'Atiende el contexto',
                    icon: <Target className="size-4" aria-hidden="true" />,
                  },
                  {
                    value: 'USER_DECISION',
                    label: 'Decisión propia',
                    icon: <UserCheck className="size-4" aria-hidden="true" />,
                  },
                ]}
              />
              {originKind === 'CONTEXT' ? (
                hasContext ? (
                  <ContextItemPicker
                    items={contextItems}
                    selected={contextItemIds}
                    coveredBy={coveredBy}
                    onChange={setContextItemIds}
                  />
                ) : (
                  <p className="rounded-md border border-dashed border-border px-3 py-3 text-sm text-muted-foreground">
                    {coverage.isLoading
                      ? 'Cargando el contexto…'
                      : 'El contexto aprobado no tiene necesidades, reglas ni restricciones que citar. Elija «Decisión propia» y explique por qué se incluye.'}
                  </p>
                )
              ) : (
                <label className="flex flex-col gap-1.5 text-sm font-medium">
                  Justificación
                  <Textarea
                    rows={3}
                    maxLength={1000}
                    value={justification}
                    placeholder="Por ejemplo: lo pidió el cliente en la reunión del 3 de octubre."
                    onChange={(e) => setJustification(e.target.value)}
                  />
                </label>
              )}
            </Section>

            <Section title="Actores" description="Quiénes intervienen en este requisito.">
              <ActorsField actors={actors} suggestions={contextActors} onChange={setActors} />
            </Section>

            <Section title="Condiciones">
              <div className="flex flex-col gap-4">
                <RowList
                  label="Precondiciones"
                  addLabel="Agregar precondición"
                  values={preconditions}
                  onChange={setPreconditions}
                />
                <RowList
                  label="Postcondiciones"
                  addLabel="Agregar postcondición"
                  values={postconditions}
                  onChange={setPostconditions}
                />
              </div>
            </Section>

            {existingRequirements.some((r) => r.id !== initial?.id) ? (
              <Section
                title="Dependencias"
                description="Requisitos que deben cumplirse antes que este (opcional)."
              >
                <DependencyPicker
                  options={existingRequirements.filter((r) => r.id !== initial?.id)}
                  selected={dependencyArtifactIds}
                  onChange={setDependencyArtifactIds}
                />
              </Section>
            ) : null}
          </div>

          <DialogFooter className="border-t border-border px-6 py-4">
            <Button type="button" variant="ghost" onClick={onCancel}>
              Cancelar
            </Button>
            <Button type="submit" disabled={submitting}>
              <Check className="size-4" aria-hidden="true" />
              {submitting ? 'Guardando…' : initial ? 'Guardar cambios' : 'Crear requisito'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
