'use client';

import { Code2, Download, Maximize2, Pencil, X, ZoomIn, ZoomOut } from 'lucide-react';
import { Button } from '@caseflow-ai/ui';
import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { ApiError, downloadFile } from '../lib/api';
import { TrustedDiagram } from './trusted-svg';

const MIN_ZOOM = 0.25;
const MAX_ZOOM = 4;
const ZOOM_STEP = 0.25;

// Same wheel-zoom/drag-to-pan interaction as MockupScreenDialog
// (apps/web/app/design/mockups/page.tsx) — reused here so every diagram
// viewer in the product behaves the same way, not a second implementation.
// Unlike the mockup viewer, this one also allows zooming out below 100%
// (large traceability graphs benefit from shrinking to see the whole shape),
// and panning is always available (not gated to zoom > 1): a diagram this
// wide can overflow its box at 100% zoom too.
function ZoomableDiagram({ svg, caption }: { svg: string; caption?: string }) {
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const zoomRef = useRef(zoom);
  zoomRef.current = zoom;
  const dragStart = useRef<{ x: number; y: number; offsetX: number; offsetY: number } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // React attaches wheel listeners as passive by default, so an onWheel prop
  // can't reliably call preventDefault() — the page scrolls underneath while
  // this also zooms. A native listener registered with { passive: false } is
  // the only way to actually stop the page scroll here.
  useEffect(() => {
    const node = containerRef.current;
    if (!node) return;
    const handleWheel = (event: WheelEvent) => {
      event.preventDefault();
      const next = Math.min(
        MAX_ZOOM,
        Math.max(MIN_ZOOM, zoomRef.current + (event.deltaY < 0 ? ZOOM_STEP : -ZOOM_STEP)),
      );
      setZoom(next);
      if (next <= 1) setOffset({ x: 0, y: 0 });
    };
    node.addEventListener('wheel', handleWheel, { passive: false });
    return () => node.removeEventListener('wheel', handleWheel);
  }, []);

  return (
    <div className="flex flex-col gap-2">
      <div
        ref={containerRef}
        className="cursor-grab touch-none overflow-hidden rounded-lg border border-border bg-card p-4 active:cursor-grabbing"
        onPointerDown={(event) => {
          if (event.button !== 0) return;
          dragStart.current = {
            x: event.clientX,
            y: event.clientY,
            offsetX: offset.x,
            offsetY: offset.y,
          };
          event.currentTarget.setPointerCapture(event.pointerId);
        }}
        onPointerMove={(event) => {
          if (!dragStart.current) return;
          setOffset({
            x: dragStart.current.offsetX + event.clientX - dragStart.current.x,
            y: dragStart.current.offsetY + event.clientY - dragStart.current.y,
          });
        }}
        onPointerUp={() => {
          dragStart.current = null;
        }}
        onPointerCancel={() => {
          dragStart.current = null;
        }}
        aria-label="Vista ampliable: use la rueda para acercar y arrastre para desplazarse"
      >
        <div
          className="origin-top-left transition-transform duration-100 [&_figure]:m-0 [&_figure]:overflow-visible [&_figure]:border-0 [&_figure]:bg-transparent [&_figure]:p-0"
          style={{ transform: `translate(${offset.x}px, ${offset.y}px) scale(${zoom})` }}
        >
          <TrustedDiagram svg={svg} caption={caption} />
        </div>
      </div>
      <div className="flex items-center gap-1 text-xs text-muted-foreground">
        <Button
          type="button"
          variant="outline"
          size="icon-sm"
          aria-label="Alejar"
          disabled={zoom <= MIN_ZOOM}
          onClick={() => {
            const next = Math.max(MIN_ZOOM, zoom - ZOOM_STEP);
            setZoom(next);
            if (next <= 1) setOffset({ x: 0, y: 0 });
          }}
        >
          <ZoomOut aria-hidden="true" className="size-4" />
        </Button>
        <span className="min-w-12 text-center">{Math.round(zoom * 100)}%</span>
        <Button
          type="button"
          variant="outline"
          size="icon-sm"
          aria-label="Acercar"
          disabled={zoom >= MAX_ZOOM}
          onClick={() => setZoom((current) => Math.min(MAX_ZOOM, current + ZOOM_STEP))}
        >
          <ZoomIn aria-hidden="true" className="size-4" />
        </Button>
        {zoom !== 1 ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => {
              setZoom(1);
              setOffset({ x: 0, y: 0 });
            }}
          >
            Restablecer
          </Button>
        ) : null}
      </div>
    </div>
  );
}

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
async function downloadPng(pngUrl: string, filename: string) {
  try {
    await downloadFile(pngUrl, filename);
  } catch (err) {
    toast.error(err instanceof ApiError ? err.message : 'No se pudo descargar el PNG.');
  }
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
      <ZoomableDiagram key={svg} svg={svg} caption={caption} />
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
          <div className="flex flex-1 items-center justify-center overflow-hidden">
            <ZoomableDiagram key={svg} svg={svg} caption={caption} />
          </div>
        </div>
      ) : null}
    </div>
  );
}
