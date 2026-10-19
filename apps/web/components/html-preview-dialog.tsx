'use client';

import { useQuery } from '@tanstack/react-query';
import { Download, Loader2 } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@caseflow-ai/ui';
import { ApiError, downloadFile, fetchBlob } from '../lib/api';

// Previews an exported HTML document before downloading it. The document is
// rendered in a fully sandboxed iframe (no scripts, no same-origin access):
// exports are static, and project content inside them is untrusted.
export function HtmlPreviewDialog({
  open,
  onOpenChange,
  url,
  filename,
  title,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  url: string;
  filename: string;
  title: string;
}) {
  const [downloading, setDownloading] = useState(false);
  const html = useQuery({
    queryKey: ['html-preview', url],
    queryFn: async () => (await fetchBlob(url)).text(),
    enabled: open,
    gcTime: 0,
    retry: false,
  });

  async function download() {
    setDownloading(true);
    try {
      await downloadFile(url, filename);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'No se pudo descargar el documento.');
    } finally {
      setDownloading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[90vh] flex-col sm:max-w-5xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>Vista previa del documento antes de descargarlo.</DialogDescription>
        </DialogHeader>
        <div className="min-h-0 flex-1 overflow-hidden rounded-md border border-border bg-white">
          {html.isLoading ? (
            <div className="flex h-full items-center justify-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" aria-hidden="true" />
              Generando vista previa…
            </div>
          ) : html.isError ? (
            <p role="alert" className="p-4 text-sm text-destructive">
              No se pudo generar la vista previa. Intente nuevamente.
            </p>
          ) : html.data ? (
            <iframe title={title} srcDoc={html.data} sandbox="" className="h-full w-full" />
          ) : null}
        </div>
        <DialogFooter>
          <Button type="button" onClick={download} disabled={downloading || !html.data}>
            {downloading ? (
              <Loader2 className="size-4 animate-spin" aria-hidden="true" />
            ) : (
              <Download className="size-4" aria-hidden="true" />
            )}
            Descargar HTML
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
