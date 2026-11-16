'use client';

import { useRef, useState } from 'react';
import { Upload } from 'lucide-react';
import { toast } from 'sonner';
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogTitle,
} from '@caseflow-ai/ui';
import { ApiError, api } from '../../../lib/api';

type ManualImplementationDialogProps = {
  projectId: string;
  implementationPlanVersionId?: string;
  disabled?: boolean;
  onImported: (runId: string) => Promise<void> | void;
};

export function ManualImplementationDialog({
  projectId,
  implementationPlanVersionId,
  disabled = false,
  onImported,
}: ManualImplementationDialogProps) {
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File>();
  const [uploading, setUploading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  function close() {
    setOpen(false);
    setFile(undefined);
    if (inputRef.current) inputRef.current.value = '';
  }

  async function submit() {
    if (!file || !implementationPlanVersionId) return;
    setUploading(true);
    try {
      const run = await api.generationRuns.manual(projectId, implementationPlanVersionId, file);
      toast.success('Implementación manual importada. Valídela en el sandbox.');
      close();
      await onImported(run.id);
    } catch (error) {
      toast.error(
        error instanceof ApiError ? error.message : 'No se pudo importar la implementación manual.',
      );
    } finally {
      setUploading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => (nextOpen ? setOpen(true) : close())}>
      <Button
        type="button"
        variant="outline"
        className="h-8 shrink-0 gap-1.5 text-xs font-semibold"
        disabled={disabled || !implementationPlanVersionId}
        onClick={() => setOpen(true)}
      >
        <Upload className="size-3.5" aria-hidden="true" />
        Importar implementación manual
      </Button>
      <DialogContent className="sm:max-w-md">
        <DialogTitle>Importar implementación manual</DialogTitle>
        <DialogDescription>
          El proyecto se valida en el sandbox como uno generado, sin IA ni reparación automática.
        </DialogDescription>
        <div className="flex flex-col gap-1.5 text-sm">
          <label htmlFor="manual-implementation-file" className="font-medium">
            Archivo ZIP
          </label>
          <input
            ref={inputRef}
            id="manual-implementation-file"
            type="file"
            accept=".zip,application/zip,application/x-zip-compressed"
            className="sr-only"
            onChange={(event) => setFile(event.target.files?.[0])}
          />
          <Button
            type="button"
            variant="outline"
            className="justify-start overflow-hidden font-normal"
            onClick={() => inputRef.current?.click()}
          >
            <Upload className="size-4 shrink-0" aria-hidden="true" />
            <span className="truncate">{file?.name ?? 'Seleccionar archivo ZIP…'}</span>
          </Button>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" disabled={uploading} onClick={close}>
            Cancelar
          </Button>
          <Button type="button" disabled={!file || uploading} onClick={() => void submit()}>
            {uploading ? 'Importando…' : 'Importar implementación'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
