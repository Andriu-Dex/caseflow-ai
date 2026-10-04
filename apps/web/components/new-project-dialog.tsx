'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import type { WorkflowRoute } from '@caseflow-ai/contracts';
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
import { WORKFLOW_ROUTE_DESCRIPTIONS, WORKFLOW_ROUTE_LABELS } from './workflow-route';

// The route is chosen once, when the project is created (DEC-116); it can
// later move up, never down.
const ROUTE_CHOICES: { route: WorkflowRoute; available: boolean }[] = [
  { route: 'FULL', available: true },
  { route: 'EXPRESS', available: true },
  { route: 'BUILD_ONLY', available: true },
];

export function NewProjectDialog({
  open,
  onOpenChange,
  workspaceId,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workspaceId: string;
  onCreated: (projectId: string) => Promise<unknown>;
}) {
  const router = useRouter();
  const [name, setName] = useState('');
  const [route, setRoute] = useState<WorkflowRoute>('FULL');
  const [prompt, setPrompt] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const needsPrompt = route !== 'FULL';

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const project = await api.projects.create({
        workspaceId,
        name: name.trim(),
        workflowRoute: route,
      });
      // The project exists either way: if the build cannot be queued now,
      // the progress page lets the user start it again.
      if (needsPrompt)
        await api.workflowRuns.start(project.id, prompt.trim()).catch((err: unknown) => {
          toast.error(
            err instanceof ApiError
              ? err.message
              : 'No se pudo iniciar la construcción automática.',
          );
        });
      await onCreated(project.id);
      setName('');
      setPrompt('');
      setRoute('FULL');
      onOpenChange(false);
      if (needsPrompt) router.push(route === 'EXPRESS' ? '/express' : '/build');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo crear el proyecto.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <form onSubmit={create} className="flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle>Nuevo proyecto</DialogTitle>
            <DialogDescription>
              Elija cuánta revisión humana tendrá. Podrá subir de ruta más adelante, nunca bajar.
            </DialogDescription>
          </DialogHeader>
          <Input
            autoFocus
            required
            aria-label="Nombre del nuevo proyecto"
            placeholder="Nombre del proyecto"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-1 text-sm font-medium">Ruta de trabajo</legend>
            {ROUTE_CHOICES.map(({ route: option, available }) => (
              <label
                key={option}
                className={`flex items-start gap-2 rounded-md border border-border p-2 text-sm ${
                  available ? 'cursor-pointer' : 'opacity-60'
                }`}
              >
                <input
                  type="radio"
                  name="new-project-route"
                  className="mt-1 accent-primary"
                  disabled={!available}
                  checked={route === option}
                  onChange={() => setRoute(option)}
                />
                <span>
                  <span className="font-medium">{WORKFLOW_ROUTE_LABELS[option]}</span>
                  {available ? null : (
                    <span className="ml-2 text-xs text-muted-foreground">Próximamente</span>
                  )}
                  <span className="block text-xs text-muted-foreground">
                    {WORKFLOW_ROUTE_DESCRIPTIONS[option]}
                  </span>
                </span>
              </label>
            ))}
          </fieldset>
          {needsPrompt ? (
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium">¿Qué aplicación quiere construir?</span>
              <Textarea
                required
                rows={5}
                maxLength={4000}
                placeholder="Por ejemplo: una aplicación para que una tienda registre pedidos, clientes y entregas."
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
              />
              <span className="text-xs text-muted-foreground">
                Se guarda como la primera fuente del proyecto: todo lo que se genere quedará trazado
                a esta descripción.
              </span>
            </label>
          ) : null}
          {error ? (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          ) : null}
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button
              type="submit"
              disabled={saving || !name.trim() || (needsPrompt && !prompt.trim())}
            >
              {saving ? 'Creando…' : needsPrompt ? 'Crear y generar' : 'Crear proyecto'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
