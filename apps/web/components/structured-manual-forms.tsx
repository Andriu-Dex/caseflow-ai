'use client';

import { useState } from 'react';
import { NAVIGATION_NODE_KINDS, SYSTEM_NODE_KINDS } from '@caseflow-ai/contracts';
import { api, ApiError } from '../lib/api';
import { csv } from '../lib/use-rows';

function ManualFormShell({
  title,
  onSubmit,
  submitting,
  error,
  onCancel,
  children,
}: {
  title: string;
  onSubmit: (e: React.FormEvent) => void;
  submitting: boolean;
  error: string | null;
  onCancel: () => void;
  children: React.ReactNode;
}) {
  return (
    <form
      onSubmit={onSubmit}
      className="flex flex-col gap-4 rounded-lg border border-border bg-card p-4"
    >
      <h2 className="text-sm font-semibold text-foreground">{title}</h2>
      {children}
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={submitting}
          className="rounded-md bg-primary px-3 py-1.5 text-sm text-white disabled:opacity-50"
        >
          {submitting ? 'Creando…' : 'Crear'}
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

interface FormProps {
  projectId: string;
  onCreated: () => void;
  onCancel: () => void;
}

export function NavigationManualForm({ projectId, onCreated, onCancel }: FormProps) {
  const [title, setTitle] = useState('');
  const [nodes, setNodes] = useState([
    {
      label: '',
      viewName: '',
      kind: 'VIEW' as (typeof NAVIGATION_NODE_KINDS)[number],
      parentLocalId: '',
      route: '',
      description: '',
      relatedUseCaseCodes: '',
    },
  ]);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const ids = nodes.map((_, i) => `n${i + 1}`);

  function update(i: number, patch: Partial<(typeof nodes)[number]>) {
    setNodes((prev) => prev.map((n, idx) => (idx === i ? { ...n, ...patch } : n)));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await api.structuredAnalysis.create(projectId, 'NAVIGATION_TREE', title, {
        nodes: nodes.map((n, i) => ({
          localId: ids[i],
          label: n.label,
          viewName: n.viewName,
          kind: n.kind,
          parentLocalId: n.parentLocalId || undefined,
          route: n.route || undefined,
          description: n.description || undefined,
          relatedUseCaseCodes: csv(n.relatedUseCaseCodes),
        })),
      });
      onCreated();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo crear la Navegación.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <ManualFormShell
      title="Crear Navegación manualmente"
      onSubmit={handleSubmit}
      submitting={submitting}
      error={error}
      onCancel={onCancel}
    >
      <input
        required
        placeholder="Título"
        className="rounded-md border border-input px-2 py-1 text-sm"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
      />
      {nodes.map((n, i) => (
        <div
          key={i}
          className="flex flex-wrap items-center gap-2 rounded-md border border-border p-2 text-sm"
        >
          <input
            required
            placeholder="Etiqueta"
            className="w-32 rounded-md border border-input px-2 py-1"
            value={n.label}
            onChange={(e) => update(i, { label: e.target.value })}
          />
          <input
            required
            placeholder="Nombre de pantalla"
            className="w-40 rounded-md border border-input px-2 py-1"
            value={n.viewName}
            onChange={(e) => update(i, { viewName: e.target.value })}
          />
          <select
            className="rounded-md border border-input px-2 py-1"
            value={n.kind}
            onChange={(e) =>
              update(i, { kind: e.target.value as (typeof NAVIGATION_NODE_KINDS)[number] })
            }
          >
            {NAVIGATION_NODE_KINDS.map((k) => (
              <option key={k} value={k}>
                {k}
              </option>
            ))}
          </select>
          <select
            className="rounded-md border border-input px-2 py-1"
            value={n.parentLocalId}
            onChange={(e) => update(i, { parentLocalId: e.target.value })}
          >
            <option value="">(sin padre)</option>
            {ids
              .filter((id) => id !== ids[i])
              .map((id, idx) => (
                <option key={id} value={id}>
                  {nodes[idx]?.label || id}
                </option>
              ))}
          </select>
          <input
            placeholder="Ruta (opcional)"
            className="w-28 rounded-md border border-input px-2 py-1"
            value={n.route}
            onChange={(e) => update(i, { route: e.target.value })}
          />
          <input
            placeholder="Descripción (opcional)"
            className="w-40 rounded-md border border-input px-2 py-1"
            value={n.description}
            onChange={(e) => update(i, { description: e.target.value })}
          />
          <input
            placeholder="Casos de uso relacionados (códigos, coma)"
            className="w-56 rounded-md border border-input px-2 py-1"
            value={n.relatedUseCaseCodes}
            onChange={(e) => update(i, { relatedUseCaseCodes: e.target.value })}
          />
          <button
            type="button"
            onClick={() => setNodes((prev) => prev.filter((_, idx) => idx !== i))}
            className="text-destructive"
            aria-label={`Eliminar nodo ${i + 1}`}
          >
            ✕
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={() =>
          setNodes((prev) => [
            ...prev,
            {
              label: '',
              viewName: '',
              kind: 'VIEW',
              parentLocalId: '',
              route: '',
              description: '',
              relatedUseCaseCodes: '',
            },
          ])
        }
        className="self-start text-sm text-muted-foreground underline"
      >
        + Agregar nodo
      </button>
    </ManualFormShell>
  );
}

export function SoftwareArchitectureManualForm({ projectId, onCreated, onCancel }: FormProps) {
  const [title, setTitle] = useState('');
  const [style, setStyle] = useState('');
  const [components, setComponents] = useState([{ name: '', responsibilities: '', layer: '' }]);
  const [dependencies, setDependencies] = useState<
    { fromLocalId: string; toLocalId: string; description: string }[]
  >([]);
  const [decisionsText, setDecisionsText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const ids = components.map((_, i) => `c${i + 1}`);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await api.structuredAnalysis.create(projectId, 'SOFTWARE_ARCHITECTURE', title, {
        style,
        components: components.map((c, i) => ({
          localId: ids[i],
          name: c.name,
          layerLocalId: c.layer.trim() || undefined,
          responsibilities: csv(c.responsibilities),
        })),
        dependencies: dependencies
          .filter((d) => d.fromLocalId && d.toLocalId)
          .map((d) => ({ ...d, description: d.description || undefined })),
        decisions: decisionsText
          .split('\n')
          .map((l) => l.trim())
          .filter(Boolean),
      });
      onCreated();
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : 'No se pudo crear la Arquitectura de Software.',
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <ManualFormShell
      title="Crear Arquitectura de Software manualmente"
      onSubmit={handleSubmit}
      submitting={submitting}
      error={error}
      onCancel={onCancel}
    >
      <input
        required
        placeholder="Título"
        className="rounded-md border border-input px-2 py-1 text-sm"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
      />
      <input
        required
        placeholder="Estilo/patrón arquitectónico"
        className="rounded-md border border-input px-2 py-1 text-sm"
        value={style}
        onChange={(e) => setStyle(e.target.value)}
      />
      {components.map((c, i) => (
        <div
          key={i}
          className="flex flex-wrap items-center gap-2 rounded-md border border-border p-2 text-sm"
        >
          <input
            required
            placeholder="Nombre del componente"
            className="w-40 rounded-md border border-input px-2 py-1"
            value={c.name}
            onChange={(e) =>
              setComponents((prev) =>
                prev.map((x, idx) => (idx === i ? { ...x, name: e.target.value } : x)),
              )
            }
          />
          <input
            placeholder="Responsabilidades (separadas por coma)"
            className="flex-1 rounded-md border border-input px-2 py-1"
            value={c.responsibilities}
            onChange={(e) =>
              setComponents((prev) =>
                prev.map((x, idx) => (idx === i ? { ...x, responsibilities: e.target.value } : x)),
              )
            }
          />
          <input
            list="software-architecture-layers"
            placeholder="Capa (opcional)"
            className="w-40 rounded-md border border-input px-2 py-1"
            value={c.layer}
            onChange={(e) =>
              setComponents((prev) =>
                prev.map((x, idx) => (idx === i ? { ...x, layer: e.target.value } : x)),
              )
            }
          />
          <button
            type="button"
            onClick={() => setComponents((prev) => prev.filter((_, idx) => idx !== i))}
            className="text-destructive"
            aria-label={`Eliminar componente ${i + 1}`}
          >
            ✕
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={() =>
          setComponents((prev) => [...prev, { name: '', responsibilities: '', layer: '' }])
        }
        className="self-start text-sm text-muted-foreground underline"
      >
        + Agregar componente
      </button>
      {/* Populated from layers already typed on other components in this
          form — layerLocalId is the only Component→Layer mechanism in the
          Software Architecture contract (no separate Layer entity exists),
          so the layer's own name is used directly as its localId; this
          datalist lets later components reuse an existing layer by
          selecting it instead of retyping it. */}
      <datalist id="software-architecture-layers">
        {[...new Set(components.map((c) => c.layer.trim()).filter(Boolean))].map((layer) => (
          <option key={layer} value={layer} />
        ))}
      </datalist>

      <fieldset className="rounded-md border border-border p-2">
        <legend className="px-1 text-sm font-medium text-foreground/80">
          Dependencias entre componentes (opcional)
        </legend>
        {dependencies.map((dep, di) => (
          <div key={di} className="mb-1 flex flex-wrap items-center gap-2 text-sm">
            <select
              aria-label={`Componente origen de la dependencia ${di + 1}`}
              className="rounded-md border border-input px-2 py-1"
              value={dep.fromLocalId}
              onChange={(e) =>
                setDependencies((prev) =>
                  prev.map((d, i) => (i === di ? { ...d, fromLocalId: e.target.value } : d)),
                )
              }
            >
              <option value="">Componente origen…</option>
              {components.map((c, i) => (
                <option key={ids[i]} value={ids[i]}>
                  {c.name || ids[i]}
                </option>
              ))}
            </select>
            <span>→</span>
            <select
              aria-label={`Componente destino de la dependencia ${di + 1}`}
              className="rounded-md border border-input px-2 py-1"
              value={dep.toLocalId}
              onChange={(e) =>
                setDependencies((prev) =>
                  prev.map((d, i) => (i === di ? { ...d, toLocalId: e.target.value } : d)),
                )
              }
            >
              <option value="">Componente destino…</option>
              {components.map((c, i) => (
                <option key={ids[i]} value={ids[i]}>
                  {c.name || ids[i]}
                </option>
              ))}
            </select>
            <input
              placeholder="descripción (opcional)"
              className="flex-1 rounded-md border border-input px-2 py-1"
              value={dep.description}
              onChange={(e) =>
                setDependencies((prev) =>
                  prev.map((d, i) => (i === di ? { ...d, description: e.target.value } : d)),
                )
              }
            />
            <button
              type="button"
              onClick={() => setDependencies((prev) => prev.filter((_, i) => i !== di))}
              className="text-destructive"
              aria-label={`Eliminar dependencia ${di + 1}`}
            >
              ✕
            </button>
          </div>
        ))}
        <button
          type="button"
          onClick={() =>
            setDependencies((prev) => [
              ...prev,
              { fromLocalId: '', toLocalId: '', description: '' },
            ])
          }
          className="text-sm text-muted-foreground underline"
        >
          + Agregar dependencia
        </button>
      </fieldset>

      <label className="flex flex-col gap-1 text-sm">
        Decisiones de arquitectura (una por línea, opcional)
        <textarea
          rows={2}
          className="rounded-md border border-input px-2 py-1"
          value={decisionsText}
          onChange={(e) => setDecisionsText(e.target.value)}
        />
      </label>
    </ManualFormShell>
  );
}

export function SystemArchitectureManualForm({ projectId, onCreated, onCancel }: FormProps) {
  const [title, setTitle] = useState('');
  const [boundary, setBoundary] = useState('');
  const [nodes, setNodes] = useState([
    { name: '', kind: 'RUNTIME' as (typeof SYSTEM_NODE_KINDS)[number], responsibilities: '' },
  ]);
  const [links, setLinks] = useState<
    { fromLocalId: string; toLocalId: string; protocol: string; description: string }[]
  >([]);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const ids = nodes.map((_, i) => `n${i + 1}`);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await api.structuredAnalysis.create(projectId, 'SYSTEM_ARCHITECTURE', title, {
        boundary,
        nodes: nodes.map((n, i) => ({
          localId: ids[i],
          name: n.name,
          kind: n.kind,
          responsibilities: csv(n.responsibilities),
        })),
        links: links
          .filter((l) => l.fromLocalId && l.toLocalId)
          .map((l) => ({
            ...l,
            protocol: l.protocol || undefined,
            description: l.description || undefined,
          })),
      });
      onCreated();
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : 'No se pudo crear la Arquitectura de Sistema.',
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <ManualFormShell
      title="Crear Arquitectura de Sistema manualmente"
      onSubmit={handleSubmit}
      submitting={submitting}
      error={error}
      onCancel={onCancel}
    >
      <input
        required
        placeholder="Título"
        className="rounded-md border border-input px-2 py-1 text-sm"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
      />
      <textarea
        required
        placeholder="Límite del sistema (boundary)"
        rows={2}
        className="rounded-md border border-input px-2 py-1 text-sm"
        value={boundary}
        onChange={(e) => setBoundary(e.target.value)}
      />
      {nodes.map((n, i) => (
        <div
          key={i}
          className="flex flex-wrap items-center gap-2 rounded-md border border-border p-2 text-sm"
        >
          <input
            required
            placeholder="Nombre"
            className="w-40 rounded-md border border-input px-2 py-1"
            value={n.name}
            onChange={(e) =>
              setNodes((prev) =>
                prev.map((x, idx) => (idx === i ? { ...x, name: e.target.value } : x)),
              )
            }
          />
          <select
            className="rounded-md border border-input px-2 py-1"
            value={n.kind}
            onChange={(e) =>
              setNodes((prev) =>
                prev.map((x, idx) =>
                  idx === i
                    ? { ...x, kind: e.target.value as (typeof SYSTEM_NODE_KINDS)[number] }
                    : x,
                ),
              )
            }
          >
            {SYSTEM_NODE_KINDS.map((k) => (
              <option key={k} value={k}>
                {k}
              </option>
            ))}
          </select>
          <input
            placeholder="Responsabilidades (coma)"
            className="flex-1 rounded-md border border-input px-2 py-1"
            value={n.responsibilities}
            onChange={(e) =>
              setNodes((prev) =>
                prev.map((x, idx) => (idx === i ? { ...x, responsibilities: e.target.value } : x)),
              )
            }
          />
          <button
            type="button"
            onClick={() => setNodes((prev) => prev.filter((_, idx) => idx !== i))}
            className="text-destructive"
            aria-label={`Eliminar nodo ${i + 1}`}
          >
            ✕
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={() =>
          setNodes((prev) => [...prev, { name: '', kind: 'RUNTIME', responsibilities: '' }])
        }
        className="self-start text-sm text-muted-foreground underline"
      >
        + Agregar nodo
      </button>

      <fieldset className="rounded-md border border-border p-2">
        <legend className="px-1 text-sm font-medium text-foreground/80">
          Enlaces de comunicación (opcional)
        </legend>
        {links.map((link, li) => (
          <div key={li} className="mb-1 flex flex-wrap items-center gap-2 text-sm">
            <select
              aria-label={`Nodo origen del enlace ${li + 1}`}
              className="rounded-md border border-input px-2 py-1"
              value={link.fromLocalId}
              onChange={(e) =>
                setLinks((prev) =>
                  prev.map((l, i) => (i === li ? { ...l, fromLocalId: e.target.value } : l)),
                )
              }
            >
              <option value="">Nodo origen…</option>
              {nodes.map((n, i) => (
                <option key={ids[i]} value={ids[i]}>
                  {n.name || ids[i]}
                </option>
              ))}
            </select>
            <span>→</span>
            <select
              aria-label={`Nodo destino del enlace ${li + 1}`}
              className="rounded-md border border-input px-2 py-1"
              value={link.toLocalId}
              onChange={(e) =>
                setLinks((prev) =>
                  prev.map((l, i) => (i === li ? { ...l, toLocalId: e.target.value } : l)),
                )
              }
            >
              <option value="">Nodo destino…</option>
              {nodes.map((n, i) => (
                <option key={ids[i]} value={ids[i]}>
                  {n.name || ids[i]}
                </option>
              ))}
            </select>
            <input
              placeholder="protocolo (opcional)"
              className="w-32 rounded-md border border-input px-2 py-1"
              value={link.protocol}
              onChange={(e) =>
                setLinks((prev) =>
                  prev.map((l, i) => (i === li ? { ...l, protocol: e.target.value } : l)),
                )
              }
            />
            <input
              placeholder="descripción (opcional)"
              className="flex-1 rounded-md border border-input px-2 py-1"
              value={link.description}
              onChange={(e) =>
                setLinks((prev) =>
                  prev.map((l, i) => (i === li ? { ...l, description: e.target.value } : l)),
                )
              }
            />
            <button
              type="button"
              onClick={() => setLinks((prev) => prev.filter((_, i) => i !== li))}
              className="text-destructive"
              aria-label={`Eliminar enlace ${li + 1}`}
            >
              ✕
            </button>
          </div>
        ))}
        <button
          type="button"
          onClick={() =>
            setLinks((prev) => [
              ...prev,
              { fromLocalId: '', toLocalId: '', protocol: '', description: '' },
            ])
          }
          className="text-sm text-muted-foreground underline"
        >
          + Agregar enlace
        </button>
      </fieldset>
    </ManualFormShell>
  );
}

export function UiBlueprintManualForm({ projectId, onCreated, onCancel }: FormProps) {
  const [title, setTitle] = useState('');
  const [screens, setScreens] = useState([
    {
      name: '',
      purpose: '',
      targetActors: '',
      relatedUseCaseCodes: '',
      navigationNodeLocalId: '',
      sections: '',
      primaryActions: '',
      secondaryActions: '',
      principalData: '',
      forms: '',
      states: '',
    },
  ]);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const ids = screens.map((_, i) => `s${i + 1}`);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await api.structuredAnalysis.create(projectId, 'UI_BLUEPRINT', title, {
        screens: screens.map((s, i) => ({
          localId: ids[i],
          name: s.name,
          purpose: s.purpose,
          targetActors: csv(s.targetActors),
          relatedUseCaseCodes: csv(s.relatedUseCaseCodes),
          navigationNodeLocalId: s.navigationNodeLocalId || undefined,
          sections: csv(s.sections),
          primaryActions: csv(s.primaryActions),
          secondaryActions: csv(s.secondaryActions),
          principalData: csv(s.principalData),
          forms: csv(s.forms),
          states: csv(s.states),
        })),
      });
      onCreated();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo crear el UI Blueprint.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <ManualFormShell
      title="Crear UI Blueprint manualmente"
      onSubmit={handleSubmit}
      submitting={submitting}
      error={error}
      onCancel={onCancel}
    >
      <input
        required
        placeholder="Título"
        className="rounded-md border border-input px-2 py-1 text-sm"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
      />
      {screens.map((s, i) => (
        <div key={i} className="flex flex-col gap-2 rounded-md border border-border p-2 text-sm">
          <div className="flex flex-wrap gap-2">
            <input
              required
              placeholder="Nombre de pantalla"
              className="w-40 rounded-md border border-input px-2 py-1"
              value={s.name}
              onChange={(e) =>
                setScreens((prev) =>
                  prev.map((x, idx) => (idx === i ? { ...x, name: e.target.value } : x)),
                )
              }
            />
            <input
              placeholder="Actores objetivo (coma)"
              className="w-48 rounded-md border border-input px-2 py-1"
              value={s.targetActors}
              onChange={(e) =>
                setScreens((prev) =>
                  prev.map((x, idx) => (idx === i ? { ...x, targetActors: e.target.value } : x)),
                )
              }
            />
            <button
              type="button"
              onClick={() => setScreens((prev) => prev.filter((_, idx) => idx !== i))}
              className="text-destructive"
              aria-label={`Eliminar pantalla ${i + 1}`}
            >
              ✕
            </button>
          </div>
          <textarea
            required
            placeholder="Propósito de la pantalla"
            rows={2}
            className="rounded-md border border-input px-2 py-1"
            value={s.purpose}
            onChange={(e) =>
              setScreens((prev) =>
                prev.map((x, idx) => (idx === i ? { ...x, purpose: e.target.value } : x)),
              )
            }
          />
          <div className="flex flex-wrap gap-2">
            <input
              placeholder="Casos de uso relacionados (códigos, coma)"
              className="flex-1 rounded-md border border-input px-2 py-1"
              value={s.relatedUseCaseCodes}
              onChange={(e) =>
                setScreens((prev) =>
                  prev.map((x, idx) =>
                    idx === i ? { ...x, relatedUseCaseCodes: e.target.value } : x,
                  ),
                )
              }
            />
            <input
              placeholder="Nodo de navegación relacionado (opcional)"
              className="flex-1 rounded-md border border-input px-2 py-1"
              value={s.navigationNodeLocalId}
              onChange={(e) =>
                setScreens((prev) =>
                  prev.map((x, idx) =>
                    idx === i ? { ...x, navigationNodeLocalId: e.target.value } : x,
                  ),
                )
              }
            />
          </div>
          <input
            placeholder="Secciones (separadas por coma)"
            className="rounded-md border border-input px-2 py-1"
            value={s.sections}
            onChange={(e) =>
              setScreens((prev) =>
                prev.map((x, idx) => (idx === i ? { ...x, sections: e.target.value } : x)),
              )
            }
          />
          <div className="flex flex-wrap gap-2">
            <input
              placeholder="Acciones principales (coma)"
              className="flex-1 rounded-md border border-input px-2 py-1"
              value={s.primaryActions}
              onChange={(e) =>
                setScreens((prev) =>
                  prev.map((x, idx) => (idx === i ? { ...x, primaryActions: e.target.value } : x)),
                )
              }
            />
            <input
              placeholder="Acciones secundarias (coma)"
              className="flex-1 rounded-md border border-input px-2 py-1"
              value={s.secondaryActions}
              onChange={(e) =>
                setScreens((prev) =>
                  prev.map((x, idx) =>
                    idx === i ? { ...x, secondaryActions: e.target.value } : x,
                  ),
                )
              }
            />
          </div>
          <input
            placeholder="Datos mostrados (separados por coma)"
            className="rounded-md border border-input px-2 py-1"
            value={s.principalData}
            onChange={(e) =>
              setScreens((prev) =>
                prev.map((x, idx) => (idx === i ? { ...x, principalData: e.target.value } : x)),
              )
            }
          />
          <div className="flex flex-wrap gap-2">
            <input
              placeholder="Formularios/entradas (coma)"
              className="flex-1 rounded-md border border-input px-2 py-1"
              value={s.forms}
              onChange={(e) =>
                setScreens((prev) =>
                  prev.map((x, idx) => (idx === i ? { ...x, forms: e.target.value } : x)),
                )
              }
            />
            <input
              placeholder="Estados relevantes (coma)"
              className="flex-1 rounded-md border border-input px-2 py-1"
              value={s.states}
              onChange={(e) =>
                setScreens((prev) =>
                  prev.map((x, idx) => (idx === i ? { ...x, states: e.target.value } : x)),
                )
              }
            />
          </div>
        </div>
      ))}
      <button
        type="button"
        onClick={() =>
          setScreens((prev) => [
            ...prev,
            {
              name: '',
              purpose: '',
              targetActors: '',
              relatedUseCaseCodes: '',
              navigationNodeLocalId: '',
              sections: '',
              primaryActions: '',
              secondaryActions: '',
              principalData: '',
              forms: '',
              states: '',
            },
          ])
        }
        className="self-start text-sm text-muted-foreground underline"
      >
        + Agregar pantalla
      </button>
    </ManualFormShell>
  );
}
