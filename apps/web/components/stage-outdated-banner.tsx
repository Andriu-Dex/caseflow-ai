'use client';

import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import {
  Button,
  Dialog,
  DialogContent,
  DialogHeader,
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
        className="mb-4 rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-200"
      >
        <p className="flex items-start gap-2">
          <RefreshCw className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          Cambió {source} el {new Date(item.outdatedSince.approvedAt).toLocaleString('es')}. Revise{' '}
          {item.label}: regenérelo o edítelo y apruébelo, o confirme que sigue vigente.
        </p>
        <Button type="button" variant="outline" className="mt-3" onClick={() => setOpen(true)}>
          Confirmar que sigue vigente
        </Button>
      </section>
      <Dialog
        open={open}
        onOpenChange={(value) => {
          if (!busy) setOpen(value);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirmar vigencia de {item.label}</DialogTitle>
            <DialogDescription>
              Revise las fuentes y los vínculos de este paso antes de confirmar. La confirmación
              registra su revisión y conserva el historial.
            </DialogDescription>
          </DialogHeader>
          <Label htmlFor={`stage-note-${stage}`}>Nota de revisión (opcional)</Label>
          <Textarea
            id={`stage-note-${stage}`}
            maxLength={500}
            value={note}
            onChange={(event) => setNote(event.target.value)}
          />
          <DialogFooter>
            <Button variant="outline" disabled={busy} onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button disabled={busy} onClick={confirm}>
              {busy ? 'Guardando…' : 'Confirmar vigencia'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
