'use client';

import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { MessageSquare, RotateCcw, Send } from 'lucide-react';
import { toast } from 'sonner';
import { SCREEN_DESIGN_REQUEST_MAX_LENGTH } from '@caseflow-ai/contracts';
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  Textarea,
} from '@caseflow-ai/ui';
import { api, ApiError } from '../../../lib/api';

// ADR-030: what a person asked to change in one generated screen. Requests
// apply in the next construction, which recomposes only this screen.
export function ScreenConversation({
  projectId,
  routePath,
  title,
}: {
  projectId: string;
  routePath: string;
  title: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="mt-2 h-7 gap-1.5 text-[11px]"
        onClick={() => setOpen(true)}
      >
        <MessageSquare aria-hidden="true" className="size-3.5" />
        Pedir cambios
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Cambios de la pantalla {title}</DialogTitle>
            <DialogDescription>
              Pida cambios de presentación: orden, agrupación, énfasis o textos de apoyo. Se aplican
              en la próxima construcción de la entrega y solo esta pantalla se vuelve a componer,
              con una solicitud a la IA. Volver a una versión ya compuesta no la gasta.
            </DialogDescription>
          </DialogHeader>
          {open ? <Conversation projectId={projectId} routePath={routePath} /> : null}
        </DialogContent>
      </Dialog>
    </>
  );
}

function Conversation({ projectId, routePath }: { projectId: string; routePath: string }) {
  const queryClient = useQueryClient();
  const key = ['screen-conversation', projectId, routePath];
  const conversation = useQuery({
    queryKey: key,
    queryFn: () => api.designBaselines.screenConversation(projectId, routePath),
  });
  const [instruction, setInstruction] = useState('');
  const [busy, setBusy] = useState(false);
  const items = conversation.data?.items ?? [];
  const current = items.at(-1);

  async function run(action: () => Promise<unknown>, done: string) {
    setBusy(true);
    try {
      queryClient.setQueryData(key, await action());
      toast.success(done);
      return true;
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : 'No se pudo guardar el cambio.');
      return false;
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      {conversation.isLoading ? (
        <p className="text-xs text-muted-foreground">Cargando la conversación…</p>
      ) : items.length ? (
        <ol className="flex max-h-60 flex-col gap-1.5 overflow-y-auto">
          {items.map((item, index) => (
            <li
              key={item.id}
              className="flex items-start justify-between gap-3 rounded-lg border border-border/60 bg-muted/30 px-3 py-2 text-xs"
            >
              <span className="min-w-0">
                <span className="font-semibold text-foreground">Versión {index + 1}</span>
                <span className="text-muted-foreground"> · {item.authorName}</span>
                <span className="block text-foreground/90">{item.note}</span>
                {item.instructions.length > 1 ? (
                  <span className="block text-muted-foreground">
                    En vigor: {item.instructions.length} peticiones
                  </span>
                ) : null}
              </span>
              {item.current ? (
                <span className="shrink-0 rounded-md bg-primary/10 px-1.5 py-0.5 font-medium text-primary">
                  Actual
                </span>
              ) : (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-7 shrink-0 gap-1 text-xs"
                  disabled={busy}
                  onClick={() =>
                    void run(
                      () => api.designBaselines.restoreScreenRequest(projectId, routePath, item.id),
                      `La pantalla volverá a la versión ${index + 1} en la próxima construcción.`,
                    )
                  }
                >
                  <RotateCcw aria-hidden="true" className="size-3.5" />
                  Volver
                </Button>
              )}
            </li>
          ))}
        </ol>
      ) : (
        <p className="text-xs text-muted-foreground">
          Esta pantalla sigue el diseño del boceto, sin peticiones.
        </p>
      )}
      {current?.instructions.length ? (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="self-start gap-1.5 text-xs"
          disabled={busy}
          onClick={() =>
            void run(
              () => api.designBaselines.restoreScreenRequest(projectId, routePath, null),
              'La pantalla volverá al diseño del boceto en la próxima construcción.',
            )
          }
        >
          <RotateCcw aria-hidden="true" className="size-3.5" />
          Volver al diseño del boceto
        </Button>
      ) : null}
      <form
        className="flex flex-col gap-2"
        onSubmit={async (event) => {
          event.preventDefault();
          const text = instruction.trim();
          if (
            await run(
              () => api.designBaselines.addScreenRequest(projectId, routePath, text),
              'Petición guardada. Se aplicará en la próxima construcción de la entrega.',
            )
          )
            setInstruction('');
        }}
      >
        <label htmlFor={`request-${routePath}`} className="text-sm font-medium">
          Nueva petición
        </label>
        <Textarea
          id={`request-${routePath}`}
          value={instruction}
          maxLength={SCREEN_DESIGN_REQUEST_MAX_LENGTH}
          rows={3}
          placeholder="Ej.: muestra el resumen arriba y agrupa los datos del cliente en una tarjeta."
          onChange={(event) => setInstruction(event.target.value)}
        />
        <Button
          type="submit"
          size="sm"
          className="self-end gap-1.5"
          disabled={busy || instruction.trim().length < 3}
        >
          <Send aria-hidden="true" className="size-3.5" />
          Enviar petición
        </Button>
      </form>
    </div>
  );
}
