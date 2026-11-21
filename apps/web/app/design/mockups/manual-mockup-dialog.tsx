'use client';

import { useRef, useState } from 'react';
import { Upload } from 'lucide-react';
import { toast } from 'sonner';
import type { MockupDeviceType } from '@caseflow-ai/contracts';
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogTitle,
} from '@caseflow-ai/ui';
import { ApiError, api } from '../../../lib/api';

type ManualMockupDialogProps = {
  projectId: string;
  uiBlueprintVersionId: string;
  deviceType: MockupDeviceType;
  // Existing mockups the import can become the next version of.
  mockups: { id: string; code: string }[];
  disabled?: boolean;
  onImported: () => void;
};

// DEC-166: a mockup written by people as HTML and CSS instead of generated.
export function ManualMockupDialog({
  projectId,
  uiBlueprintVersionId,
  deviceType,
  mockups,
  disabled = false,
  onImported,
}: ManualMockupDialogProps) {
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File>();
  const [target, setTarget] = useState(mockups[0]?.id ?? '');
  const [uploading, setUploading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  function close() {
    setOpen(false);
    setFile(undefined);
    if (inputRef.current) inputRef.current.value = '';
  }

  async function submit() {
    if (!file) return;
    setUploading(true);
    try {
      const mockup = await api.mockups.importManual(
        projectId,
        { uiBlueprintVersionId, deviceType, mockupId: target || undefined },
        file,
      );
      toast.success(`${mockup.code} importado. Revíselo y apruébelo.`);
      close();
      onImported();
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : 'No se pudo importar el boceto.');
    } finally {
      setUploading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => (nextOpen ? setOpen(true) : close())}>
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={disabled}
        onClick={() => setOpen(true)}
      >
        <Upload className="size-3.5" aria-hidden="true" />
        Importar boceto hecho a mano
      </Button>
      <DialogContent className="sm:max-w-lg">
        <DialogTitle>Importar boceto hecho a mano</DialogTitle>
        <DialogDescription>
          Un ZIP con, por cada pantalla del plano, su página <code>id.html</code> y su imagen{' '}
          <code>id.png</code>. Un <code>styles.css</code> común es opcional. No se usa IA.
        </DialogDescription>
        <div className="flex flex-col gap-4 text-sm">
          {mockups.length ? (
            <label className="flex flex-col gap-1.5">
              <span className="font-medium">Guardar como</span>
              <select
                className="h-9 rounded-md border border-input bg-background px-2.5"
                value={target}
                onChange={(event) => setTarget(event.target.value)}
              >
                {mockups.map((mockup) => (
                  <option key={mockup.id} value={mockup.id}>
                    Nueva versión de {mockup.code}
                  </option>
                ))}
                <option value="">Boceto nuevo</option>
              </select>
            </label>
          ) : null}
          <div className="flex flex-col gap-1.5">
            <label htmlFor="manual-mockup-file" className="font-medium">
              Archivo ZIP
            </label>
            <input
              ref={inputRef}
              id="manual-mockup-file"
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
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" disabled={uploading} onClick={close}>
            Cancelar
          </Button>
          <Button type="button" disabled={!file || uploading} onClick={() => void submit()}>
            {uploading ? 'Importando…' : 'Importar boceto'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
