'use client';

import { Code2, Download, Maximize2, Pencil, X } from 'lucide-react';
import { Button } from '@caseflow-ai/ui';
import { useState } from 'react';
import { toast } from 'sonner';
import { ApiError } from '../lib/api';
import { TrustedDiagram } from './trusted-svg';

const SOURCE_EXTENSION: Record<string, string> = {
  MERMAID_ER: 'mmd',
  MERMAID_FLOWCHART: 'mmd',
  PLANTUML: 'puml',
  PLANTUML_COMPONENT: 'puml',
  PLANTUML_DEPLOYMENT: 'puml',
};

function download(filename: string, content: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// PNG is streamed from the backend (re-rendered on demand from the canonical
// stored source, spec §4.8) rather than rasterized here client-side: Mermaid
// always emits `<foreignObject>` for edge/attribute labels, and Chromium/
// WebKit refuse `canvas.toBlob` for any SVG containing one, regardless of
// origin — there is no reliable client-only fix for that.
function downloadPng(pngUrl: string, filename: string) {
  const anchor = document.createElement('a');
  anchor.href = pngUrl;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
}

// Shows a backend-rendered/sanitized diagram (TrustedDiagram) alongside its
// canonical text source, with downloads for both. `onSaveEdit`, when given,
// lets the user override the source directly — always re-rendered/sanitized
// server-side through the same untrusted-input boundary as generation, never
// trusted as SVG client-side. Editing is offered only where the diagram has
// its own independent version lifecycle (see use-cases/page.tsx); it is
// omitted for diagrams embedded 1:1 in a content version (ER, Navigation,
// Software/System Architecture), where "editing the diagram" would mean
// forking the content version it was derived from.
export function DiagramViewer({
  svg,
  source,
  sourceFormat,
  code,
  caption,
  pngUrl,
  onSaveEdit,
}: {
  svg: string;
  source: string;
  sourceFormat: string;
  code: string;
  caption?: string;
  pngUrl?: string;
  onSaveEdit?: (source: string) => Promise<void>;
}) {
  const [showSource, setShowSource] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(source);
  const [saving, setSaving] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const extension = SOURCE_EXTENSION[sourceFormat] ?? 'txt';

  async function save() {
    setSaving(true);
    try {
      await onSaveEdit!(draft);
      toast.success('Diagrama actualizado.');
      setEditing(false);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'No se pudo actualizar el diagrama.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <TrustedDiagram svg={svg} caption={caption} />
      <div className="flex flex-wrap gap-2 text-sm">
        <Button
          variant="ghost"
          size="sm"
          type="button"
          onClick={() => setFullscreen(true)}
          className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-muted-foreground hover:bg-muted/40"
        >
          <Maximize2 className="size-3.5" aria-hidden="true" />
          Ver en pantalla completa
        </Button>
        <Button
          variant="ghost"
          size="sm"
          type="button"
          onClick={() => setShowSource((v) => !v)}
          className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-muted-foreground hover:bg-muted/40"
        >
          <Code2 className="size-3.5" aria-hidden="true" />
          {showSource ? 'Ocultar código fuente' : 'Ver código fuente'}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          type="button"
          onClick={() => download(`${code}.svg`, svg, 'image/svg+xml')}
          className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-muted-foreground hover:bg-muted/40"
        >
          <Download className="size-3.5" aria-hidden="true" />
          Descargar SVG
        </Button>
        {pngUrl ? (
          <Button
            variant="ghost"
            size="sm"
            type="button"
            onClick={() => downloadPng(pngUrl, `${code}.png`)}
            className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-muted-foreground hover:bg-muted/40"
          >
            <Download className="size-3.5" aria-hidden="true" />
            Descargar PNG
          </Button>
        ) : null}
        <Button
          variant="ghost"
          size="sm"
          type="button"
          onClick={() => download(`${code}.${extension}`, source, 'text/plain')}
          className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-muted-foreground hover:bg-muted/40"
        >
          <Download className="size-3.5" aria-hidden="true" />
          Descargar código fuente
        </Button>
        {onSaveEdit && !editing ? (
          <Button
            variant="ghost"
            size="sm"
            type="button"
            onClick={() => {
              setDraft(source);
              setEditing(true);
              setShowSource(true);
            }}
            className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-muted-foreground hover:bg-muted/40"
          >
            <Pencil className="size-3.5" aria-hidden="true" />
            Editar código
          </Button>
        ) : null}
      </div>
      {showSource ? (
        editing ? (
          <div className="flex flex-col gap-2">
            <textarea
              rows={12}
              className="rounded-md border border-input bg-card px-2 py-1 font-mono text-xs"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
            />
            <div className="flex gap-2">
              <Button variant="default" size="sm" type="button" onClick={save} disabled={saving}>
                {saving ? 'Guardando…' : 'Guardar y volver a generar'}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                type="button"
                onClick={() => setEditing(false)}
                className="inline-flex items-center gap-1 text-sm text-muted-foreground underline"
              >
                <X className="size-3.5" aria-hidden="true" />
                Cancelar
              </Button>
            </div>
          </div>
        ) : (
          <pre className="overflow-auto rounded-md border border-border bg-muted/30 p-3 font-mono text-xs">
            {source}
          </pre>
        )
      ) : null}
      {fullscreen ? (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex flex-col gap-2 overflow-auto bg-background/95 p-4"
        >
          <Button
            variant="ghost"
            size="sm"
            type="button"
            onClick={() => setFullscreen(false)}
            className="inline-flex w-fit items-center gap-1 rounded-md bg-muted px-3 py-1.5 text-sm text-foreground hover:bg-muted/70"
          >
            <X className="size-3.5" aria-hidden="true" />
            Cerrar
          </Button>
          <div className="flex flex-1 items-center justify-center">
            <TrustedDiagram svg={svg} caption={caption} />
          </div>
        </div>
      ) : null}
    </div>
  );
}
