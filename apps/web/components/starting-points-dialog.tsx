'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { BookCopy, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
  Input,
} from '@caseflow-ai/ui';
import { api, ApiError } from '../lib/api';

// DEC-176: start from a similar project, or save this one for the next.
export function StartingPointsDialog({ projectId }: { projectId: string }) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const points = useQuery({
    queryKey: ['starting-points', projectId],
    queryFn: () => api.startingPoints.list(projectId),
    enabled: open,
  });

  async function run(id: string, action: () => Promise<string>) {
    setBusy(id);
    try {
      toast.success(await action());
      await queryClient.invalidateQueries({ queryKey: ['starting-points', projectId] });
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : 'No se pudo completar la acción.');
    } finally {
      setBusy(null);
    }
  }

  const apply = (id: string) =>
    run(id, async () => {
      const copied = await api.startingPoints.apply(projectId, id);
      await Promise.all(
        ['requirements', 'use-cases', 'data-models'].map((key) =>
          queryClient.invalidateQueries({ queryKey: [key] }),
        ),
      );
      setOpen(false);
      return `Se copiaron ${copied.requirements} requisitos, ${copied.useCases} casos de uso y ${copied.entities} entidades como borradores.`;
    });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-dashed p-3 text-xs">
        <p className="text-muted-foreground">
          ¿Se parece a otro proyecto? Parta de sus requisitos, casos de uso y entidades.
        </p>
        <DialogTrigger asChild>
          <Button type="button" size="sm" variant="outline" className="gap-1.5">
            <BookCopy className="size-3.5" aria-hidden="true" />
            Partir de un proyecto parecido
          </Button>
        </DialogTrigger>
      </div>
      <DialogContent className="max-h-[85vh] overflow-auto sm:max-w-2xl">
        <DialogTitle>Puntos de partida</DialogTitle>
        <DialogDescription>
          Se copian a este proyecto como borradores, enlazados como estaban, para que los adapte y
          los apruebe.
        </DialogDescription>
        {points.isLoading ? <p className="text-sm text-muted-foreground">Cargando…</p> : null}
        <ul className="flex flex-col gap-2">
          {(points.data?.items ?? []).map((point) => (
            <li key={point.id} className="flex flex-col gap-1.5 rounded-lg border p-3 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-semibold">
                  {point.name}
                  {point.builtIn ? (
                    <span className="ml-2 rounded-full border px-2 py-0.5 text-[11px] font-normal text-muted-foreground">
                      Incluido
                    </span>
                  ) : null}
                </p>
                <div className="flex gap-1.5">
                  {!point.builtIn ? (
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      aria-label={`Eliminar ${point.name}`}
                      disabled={busy !== null}
                      onClick={() =>
                        run(`delete-${point.id}`, async () => {
                          await api.startingPoints.remove(projectId, point.id);
                          return 'Punto de partida eliminado.';
                        })
                      }
                    >
                      <Trash2 className="size-3.5" aria-hidden="true" />
                    </Button>
                  ) : null}
                  <Button
                    type="button"
                    size="sm"
                    disabled={busy !== null}
                    onClick={() => apply(point.id)}
                  >
                    Usar en este proyecto
                  </Button>
                </div>
              </div>
              {point.description ? (
                <p className="text-xs text-muted-foreground">{point.description}</p>
              ) : null}
              <p className="text-xs text-muted-foreground">
                {point.counts.requirements} requisitos · {point.counts.useCases} casos de uso ·{' '}
                {point.counts.entities} entidades
              </p>
            </li>
          ))}
        </ul>
        <form
          className="flex flex-col gap-2 border-t pt-3"
          onSubmit={(event) => {
            event.preventDefault();
            void run('save', async () => {
              await api.startingPoints.save(projectId, { name, description });
              setName('');
              setDescription('');
              return 'Punto de partida guardado.';
            });
          }}
        >
          <p className="text-sm font-semibold">Guardar este proyecto como punto de partida</p>
          <p className="text-xs text-muted-foreground">
            Guarda sus requisitos y casos de uso aprobados y su modelo de datos aprobado, para
            usarlos en otros proyectos de este espacio de trabajo.
          </p>
          <Input
            aria-label="Nombre del punto de partida"
            placeholder="Nombre, por ejemplo «Ventas con caja»"
            value={name}
            maxLength={120}
            onChange={(event) => setName(event.target.value)}
          />
          <Input
            aria-label="Descripción del punto de partida"
            placeholder="Descripción (opcional)"
            value={description}
            maxLength={1000}
            onChange={(event) => setDescription(event.target.value)}
          />
          <Button
            type="submit"
            size="sm"
            className="self-start"
            disabled={busy !== null || !name.trim()}
          >
            Guardar
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
