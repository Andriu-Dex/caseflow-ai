'use client';

import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, Loader2, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import {
  Button,
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  Textarea,
  Label,
} from '@caseflow-ai/ui';
import { api, ApiError } from '../lib/api';

export function StageOutdatedBanner({ stage, projectId }: { stage: string; projectId: string }) {
  const queryClient = useQueryClient();
  const readiness = useQuery({
    queryKey: ['readiness', projectId],
    queryFn: () => api.readiness.get(projectId),
  });
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const item = readiness.data?.stages.find((item) => item.key === stage);
  if (item?.currency !== 'OUTDATED' || !item.outdatedSince) return null;
  const source =
    readiness.data?.stages.find((s) => s.key === item.outdatedSince?.stage)?.label ??
    item.outdatedSince.stage;
  async function confirm() {
    setBusy(true);
    try {
      await api.readiness.confirm(projectId, stage, note.trim() || undefined);
      await queryClient.invalidateQueries({ queryKey: ['readiness', projectId] });
      toast.success('Se registró que este paso sigue vigente.');
      setOpen(false);
      setNote('');
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : 'No se pudo confirmar el paso.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <section
        role="status"
        className="mb-4 rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-900 shadow-2xs backdrop-blur-xs dark:border-amber-500/20 dark:bg-amber-950/20 dark:text-amber-200"
      >
        <p className="flex items-start gap-2.5 font-medium leading-relaxed">
          <RefreshCw
            className="mt-0.5 size-4 shrink-0 text-amber-600 dark:text-amber-400"
            aria-hidden="true"
          />
          <span>
            Cambió <strong className="text-foreground">{source}</strong> el{' '}
            {new Date(item.outdatedSince.approvedAt).toLocaleString('es')}. Revise{' '}
            <strong className="text-foreground">{item.label}</strong>: regenérelo o edítelo y
            apruébelo, o confirme que sigue vigente.
          </span>
        </p>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="mt-3 gap-2 border-amber-500/40 bg-background/80 hover:bg-amber-500/15 font-medium text-xs shadow-2xs"
          onClick={() => setOpen(true)}
        >
          <CheckCircle2
            className="size-3.5 text-emerald-600 dark:text-emerald-400"
            aria-hidden="true"
          />
          Confirmar que sigue vigente
        </Button>
      </section>
      <Dialog
        open={open}
        onOpenChange={(value) => {
          if (!busy) setOpen(value);
        }}
      >
        <DialogContent className="relative sm:max-w-lg p-6 gap-5 overflow-hidden">
          {/* Top emerald accent gradient strip */}
          <div className="absolute inset-x-0 top-0 h-1.5 bg-gradient-to-r from-emerald-500 via-teal-500 to-green-600" />

          <div className="flex items-start gap-4 w-full min-w-0">
            <div className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/25 shadow-xs ring-4 ring-emerald-500/5 dark:ring-emerald-500/10">
              <CheckCircle2 className="size-5" aria-hidden="true" />
            </div>
            <div className="flex flex-col gap-1 min-w-0 flex-1">
              <DialogTitle className="text-lg font-bold tracking-tight text-foreground">
                Confirmar vigencia de {item.label}
              </DialogTitle>
              <DialogDescription className="text-xs sm:text-sm text-muted-foreground leading-relaxed">
                Revise las fuentes y los vínculos de este paso antes de confirmar. La confirmación
                registra su revisión y conserva el historial.
              </DialogDescription>
            </div>
          </div>

          <div className="rounded-xl border border-border/70 bg-muted/30 p-4 flex flex-col gap-2 w-full min-w-0">
            <Label
              htmlFor={`stage-note-${stage}`}
              className="text-xs font-semibold text-foreground"
            >
              Nota de revisión (opcional)
            </Label>
            <Textarea
              id={`stage-note-${stage}`}
              maxLength={500}
              value={note}
              onChange={(event) => setNote(event.target.value)}
              placeholder="Ej.: Se validaron los requisitos y no requieren cambios frente a las nuevas fuentes…"
              className="text-sm bg-background border-border/80 resize-none min-h-[90px]"
            />
            <p className="text-[11px] text-muted-foreground">
              Esta nota quedará vinculada permanentemente a la aprobación de la etapa.
            </p>
          </div>

          <DialogFooter className="-mx-6 -mb-6 mt-1 flex items-center justify-between gap-3 border-t border-border/50 bg-muted/25 px-6 py-4 rounded-b-2xl dark:bg-muted/10 w-[calc(100%+3rem)]">
            <p className="text-[11px] text-muted-foreground/70 hidden sm:block truncate">
              Presione Esc para cancelar
            </p>
            <div className="flex items-center gap-2 shrink-0 ml-auto">
              <Button
                type="button"
                variant="outline"
                disabled={busy}
                onClick={() => setOpen(false)}
                className="border-border/80 hover:bg-muted font-medium"
              >
                Cancelar
              </Button>
              <Button
                type="button"
                disabled={busy}
                onClick={confirm}
                className="gap-2 font-medium shadow-xs bg-emerald-600 hover:bg-emerald-700 text-white dark:bg-emerald-600 dark:hover:bg-emerald-500"
              >
                {busy ? (
                  <>
                    <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                    Guardando…
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="size-4" aria-hidden="true" />
                    Confirmar vigencia
                  </>
                )}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
