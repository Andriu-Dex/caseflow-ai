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
      className="flex flex-col gap-4 rounded-lg border border-gray-200 bg-white p-4"
    >
      <h2 className="text-sm font-semibold text-gray-900">{title}</h2>
      {children}
      {error ? <p className="text-sm text-red-600">{error}</p> : null}
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={submitting}
          className="rounded-md bg-gray-900 px-3 py-1.5 text-sm text-white disabled:opacity-50"
        >
          {submitting ? 'Creando…' : 'Crear'}
        </button>
        <button type="button" onClick={onCancel} className="text-sm text-gray-600 underline">
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
        className="rounded-md border border-gray-300 px-2 py-1 text-sm"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
      />
      {nodes.map((n, i) => (
        <div
          key={i}
          className="flex flex-wrap items-center gap-2 rounded-md border border-gray-100 p-2 text-sm"
        >
          <input
            required
            placeholder="Etiqueta"
            className="w-32 rounded-md border border-gray-300 px-2 py-1"
            value={n.label}
            onChange={(e) => update(i, { label: e.target.value })}
          />
          <input
            required
            placeholder="Nombre de pantalla"
            className="w-40 rounded-md border border-gray-300 px-2 py-1"
            value={n.viewName}
            onChange={(e) => update(i, { viewName: e.target.value })}
          />
          <select
            className="rounded-md border border-gray-300 px-2 py-1"
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
            className="rounded-md border border-gray-300 px-2 py-1"
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
            className="w-28 rounded-md border border-gray-300 px-2 py-1"
            value={n.route}
            onChange={(e) => update(i, { route: e.target.value })}
          />
          <button
            type="button"
            onClick={() => setNodes((prev) => prev.filter((_, idx) => idx !== i))}
            className="text-red-600"
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
              relatedUseCaseCodes: '',
            },
          ])
        }
        className="self-start text-sm text-gray-600 underline"
      >
        + Agregar nodo
      </button>
    </ManualFormShell>
  );
}

export function SoftwareArchitectureManualForm({ projectId, onCreated, onCancel }: FormProps) {
  const [title, setTitle] = useState('');
  const [style, setStyle] = useState('');
  const [components, setComponents] = useState([{ name: '', responsibilities: '' }]);
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
          responsibilities: csv(c.responsibilities),
        })),
        dependencies: [],
        decisions: [],
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
        className="rounded-md border border-gray-300 px-2 py-1 text-sm"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
      />
      <input
        required
        placeholder="Estilo/patrón arquitectónico"
        className="rounded-md border border-gray-300 px-2 py-1 text-sm"
        value={style}
        onChange={(e) => setStyle(e.target.value)}
      />
      {components.map((c, i) => (
        <div
          key={i}
          className="flex flex-wrap items-center gap-2 rounded-md border border-gray-100 p-2 text-sm"
        >
          <input
            required
            placeholder="Nombre del componente"
            className="w-40 rounded-md border border-gray-300 px-2 py-1"
            value={c.name}
            onChange={(e) =>
              setComponents((prev) =>
                prev.map((x, idx) => (idx === i ? { ...x, name: e.target.value } : x)),
              )
            }
          />
          <input
            placeholder="Responsabilidades (separadas por coma)"
            className="flex-1 rounded-md border border-gray-300 px-2 py-1"
            value={c.responsibilities}
            onChange={(e) =>
              setComponents((prev) =>
                prev.map((x, idx) => (idx === i ? { ...x, responsibilities: e.target.value } : x)),
              )
            }
          />
          <button
            type="button"
            onClick={() => setComponents((prev) => prev.filter((_, idx) => idx !== i))}
            className="text-red-600"
            aria-label={`Eliminar componente ${i + 1}`}
          >
            ✕
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={() => setComponents((prev) => [...prev, { name: '', responsibilities: '' }])}
        className="self-start text-sm text-gray-600 underline"
      >
        + Agregar componente
      </button>
    </ManualFormShell>
  );
}

export function SystemArchitectureManualForm({ projectId, onCreated, onCancel }: FormProps) {
  const [title, setTitle] = useState('');
  const [boundary, setBoundary] = useState('');
  const [nodes, setNodes] = useState([
    { name: '', kind: 'RUNTIME' as (typeof SYSTEM_NODE_KINDS)[number], responsibilities: '' },
  ]);
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
        links: [],
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
        className="rounded-md border border-gray-300 px-2 py-1 text-sm"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
      />
      <textarea
        required
        placeholder="Límite del sistema (boundary)"
        rows={2}
        className="rounded-md border border-gray-300 px-2 py-1 text-sm"
        value={boundary}
        onChange={(e) => setBoundary(e.target.value)}
      />
      {nodes.map((n, i) => (
        <div
          key={i}
          className="flex flex-wrap items-center gap-2 rounded-md border border-gray-100 p-2 text-sm"
        >
          <input
            required
            placeholder="Nombre"
            className="w-40 rounded-md border border-gray-300 px-2 py-1"
            value={n.name}
            onChange={(e) =>
              setNodes((prev) =>
                prev.map((x, idx) => (idx === i ? { ...x, name: e.target.value } : x)),
              )
            }
          />
          <select
            className="rounded-md border border-gray-300 px-2 py-1"
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
            className="flex-1 rounded-md border border-gray-300 px-2 py-1"
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
            className="text-red-600"
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
        className="self-start text-sm text-gray-600 underline"
      >
        + Agregar nodo
      </button>
    </ManualFormShell>
  );
}

export function UiBlueprintManualForm({ projectId, onCreated, onCancel }: FormProps) {
  const [title, setTitle] = useState('');
  const [screens, setScreens] = useState([
    { name: '', purpose: '', targetActors: '', primaryActions: '' },
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
          relatedUseCaseCodes: [],
          sections: [],
          primaryActions: csv(s.primaryActions),
          secondaryActions: [],
          principalData: [],
          forms: [],
          states: [],
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
        className="rounded-md border border-gray-300 px-2 py-1 text-sm"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
      />
      {screens.map((s, i) => (
        <div key={i} className="flex flex-col gap-2 rounded-md border border-gray-100 p-2 text-sm">
          <div className="flex flex-wrap gap-2">
            <input
              required
              placeholder="Nombre de pantalla"
              className="w-40 rounded-md border border-gray-300 px-2 py-1"
              value={s.name}
              onChange={(e) =>
                setScreens((prev) =>
                  prev.map((x, idx) => (idx === i ? { ...x, name: e.target.value } : x)),
                )
              }
            />
            <input
              placeholder="Actores objetivo (coma)"
              className="w-48 rounded-md border border-gray-300 px-2 py-1"
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
              className="text-red-600"
              aria-label={`Eliminar pantalla ${i + 1}`}
            >
              ✕
            </button>
          </div>
          <textarea
            required
            placeholder="Propósito de la pantalla"
            rows={2}
            className="rounded-md border border-gray-300 px-2 py-1"
            value={s.purpose}
            onChange={(e) =>
              setScreens((prev) =>
                prev.map((x, idx) => (idx === i ? { ...x, purpose: e.target.value } : x)),
              )
            }
          />
          <input
            placeholder="Acciones principales (coma)"
            className="rounded-md border border-gray-300 px-2 py-1"
            value={s.primaryActions}
            onChange={(e) =>
              setScreens((prev) =>
                prev.map((x, idx) => (idx === i ? { ...x, primaryActions: e.target.value } : x)),
              )
            }
          />
        </div>
      ))}
      <button
        type="button"
        onClick={() =>
          setScreens((prev) => [
            ...prev,
            { name: '', purpose: '', targetActors: '', primaryActions: '' },
          ])
        }
        className="self-start text-sm text-gray-600 underline"
      >
        + Agregar pantalla
      </button>
    </ManualFormShell>
  );
}
