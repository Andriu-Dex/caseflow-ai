'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { FolderPlus, Loader2, Sparkles } from 'lucide-react';
import type { WorkflowRoute } from '@caseflow-ai/contracts';
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogTitle,
  Input,
  Textarea,
} from '@caseflow-ai/ui';
import { api, ApiError } from '../lib/api';
import { WORKFLOW_ROUTE_DESCRIPTIONS, WORKFLOW_ROUTE_LABELS } from './workflow-route';

// The route is chosen once, when the project is created (DEC-116); it can
// later move up, never down.
// EXPRESS and BUILD_ONLY generate everything with AI from a prompt: without
// a configured provider they would stop at the first AI stage, so they are
// offered only when AI is available (FULL also works manually).
const ROUTES: WorkflowRoute[] = ['FULL', 'EXPRESS', 'BUILD_ONLY'];

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
  const aiStatus = useQuery({
    queryKey: ['ai-status'],
    queryFn: () => api.ai.status(),
    enabled: open,
  });
  const aiAvailable = aiStatus.data?.available === true;

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
      <DialogContent className="relative sm:max-w-lg p-6 gap-5 overflow-hidden">
        {/* Top accent gradient strip */}
        <div className="absolute inset-x-0 top-0 h-1.5 bg-gradient-to-r from-primary via-primary/70 to-indigo-500" />

        <form onSubmit={create} className="flex flex-col gap-5">
          <div className="flex items-start gap-4">
            <div className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary border border-primary/25 shadow-xs ring-4 ring-primary/5 dark:bg-primary/15 dark:ring-primary/10">
              <FolderPlus className="size-5" aria-hidden="true" />
            </div>
            <div className="flex flex-col gap-1 min-w-0 flex-1">
              <DialogTitle className="text-lg font-bold tracking-tight text-foreground">
                Nuevo proyecto
              </DialogTitle>
              <DialogDescription className="text-xs sm:text-sm text-muted-foreground leading-relaxed">
                Elija cuánta revisión humana tendrá. Podrá subir de ruta más adelante, nunca bajar.
              </DialogDescription>
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <Input
              autoFocus
              required
              aria-label="Nombre del nuevo proyecto"
              placeholder="Nombre del proyecto"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="h-9.5 text-sm bg-background border-border/80"
            />
          </div>

          <fieldset className="flex flex-col gap-2">
            <legend className="mb-1 text-xs font-semibold text-foreground uppercase tracking-wider">
              Ruta de trabajo
            </legend>
            {ROUTES.map((option) => {
              const available = option === 'FULL' || aiAvailable;
              return (
                <label
                  key={option}
                  className={`flex items-start gap-3 rounded-xl border p-3 text-sm transition-all ${
                    available ? 'cursor-pointer' : 'opacity-60 cursor-not-allowed'
                  } ${
                    route === option
                      ? 'border-primary bg-primary/5 shadow-2xs ring-1 ring-primary/20'
                      : 'border-border/60 bg-card hover:border-border hover:bg-muted/30'
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
                  <span className="flex flex-col gap-0.5">
                    <span className="flex items-center gap-2">
                      <span className="font-semibold text-foreground">
                        {WORKFLOW_ROUTE_LABELS[option]}
                      </span>
                      {available ? null : (
                        <span className="rounded-md bg-amber-500/10 px-1.5 py-0.5 text-xs font-semibold text-amber-700 dark:text-amber-400 border border-amber-500/20">
                          Requiere IA
                        </span>
                      )}
                    </span>
                    <span className="text-xs text-muted-foreground leading-relaxed">
                      {WORKFLOW_ROUTE_DESCRIPTIONS[option]}
                    </span>
                  </span>
                </label>
              );
            })}
            {aiStatus.data && !aiAvailable ? (
              <p className="text-xs text-muted-foreground">
                Exprés y Solo construcción generan todo con IA a partir de un prompt. Conecte
                ChatGPT o configure un proveedor en{' '}
                <Link
                  href="/settings/ai"
                  className="font-medium underline text-primary"
                  onClick={() => onOpenChange(false)}
                >
                  Ajustes de IA
                </Link>
                .
              </p>
            ) : null}
          </fieldset>

          {needsPrompt ? (
            <label className="flex flex-col gap-1.5 text-sm">
              <span className="font-semibold text-foreground text-xs">
                ¿Qué aplicación quiere construir?
              </span>
              <Textarea
                required
                rows={4}
                maxLength={4000}
                placeholder="Por ejemplo: una aplicación para que una tienda registre pedidos, clientes y entregas."
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                className="text-sm bg-background border-border/80 resize-none"
              />
              <span className="text-xs text-muted-foreground">
                Se guarda como la primera fuente del proyecto: todo lo que se genere quedará trazado
                a esta descripción.
              </span>
            </label>
          ) : null}

          {error ? (
            <p role="alert" className="text-sm font-medium text-destructive">
              {error}
            </p>
          ) : null}

          <DialogFooter className="-mx-6 -mb-6 mt-1 flex items-center justify-between border-t border-border/50 bg-muted/25 px-6 py-4 rounded-b-2xl dark:bg-muted/10">
            <p className="text-[11px] text-muted-foreground/70 hidden sm:block">
              Presione Esc para cancelar
            </p>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                className="border-border/80 hover:bg-muted font-medium"
                onClick={() => onOpenChange(false)}
              >
                Cancelar
              </Button>
              <Button
                type="submit"
                disabled={saving || !name.trim() || (needsPrompt && !prompt.trim())}
                className="gap-2 font-medium shadow-xs"
              >
                {saving ? (
                  <>
                    <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                    Creando…
                  </>
                ) : needsPrompt ? (
                  <>
                    <Sparkles className="size-4" aria-hidden="true" />
                    Crear y generar
                  </>
                ) : (
                  'Crear proyecto'
                )}
              </Button>
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
