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

// Ctrl + wheel (or a trackpad pinch, which browsers report the same way)
// zooms; the plain wheel scrolls the diagram up and down inside its box, and
// Shift + wheel sideways. Once the diagram reaches its edge the page scrolls
// again, so the box never traps the wheel. Dragging pans in any direction.
// This one also allows zooming out below 100% (large traceability graphs
// benefit from shrinking to see the whole shape).
const BOX_PADDING = 16;

// A big diagram has more lines than the eye can follow. Pointing at an element
// (or clicking it, to keep it) fades everything except it, what it connects to
// and the lines between them. It reads the entity and link markup PlantUML
// leaves in the SVG (data-entity-1/2 on each link, one id per entity); a
// diagram without that markup simply has no highlighting.
const FADED_ENTITY = '0.15';
const FADED_LINK = '0.06';
const CLICK_SLOP = 5;
const entityAt = (target: EventTarget | null) =>
  (target as Element | null)?.closest?.('g.entity')?.id ?? null;
function ZoomableDiagram({ svg, caption }: { svg: string; caption?: string }) {
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const zoomRef = useRef(zoom);
  zoomRef.current = zoom;
  const offsetRef = useRef(offset);
  offsetRef.current = offset;
  const contentRef = useRef<HTMLDivElement>(null);
  const [interactive, setInteractive] = useState(false);
  const [hovered, setHovered] = useState<string | null>(null);
  const [pinned, setPinned] = useState<string | null>(null);
  const press = useRef<{ x: number; y: number; entity: string | null } | null>(null);
  const focus = pinned ?? hovered;

  useEffect(() => {
    setInteractive(!!contentRef.current?.querySelector('g.link[data-entity-1]'));
    setHovered(null);
    setPinned(null);
  }, [svg]);

  useEffect(() => {
    const root = contentRef.current;
    if (!root || !interactive) return;
    const entities = root.querySelectorAll<SVGGElement>('g.entity');
    const links = root.querySelectorAll<SVGGElement>('g.link');
    const clear = () => {
      entities.forEach((entity) => (entity.style.opacity = ''));
      links.forEach((link) => {
        link.style.opacity = '';
        const path = link.querySelector('path');
        if (path) path.style.strokeWidth = '';
      });
    };
    clear();
    if (!focus) return;
    const near = new Set([focus]);
    const touching = new Set<Element>();
    links.forEach((link) => {
      const a = link.getAttribute('data-entity-1');
      const b = link.getAttribute('data-entity-2');
      if (a !== focus && b !== focus) return;
      touching.add(link);
      if (a) near.add(a);
      if (b) near.add(b);
    });
    entities.forEach((entity) => {
      entity.style.opacity = near.has(entity.id) ? '' : FADED_ENTITY;
    });
    links.forEach((link) => {
      const on = touching.has(link);
      link.style.opacity = on ? '' : FADED_LINK;
      const path = link.querySelector('path');
      if (path && on) path.style.strokeWidth = '2.5px';
    });
    return clear;
  }, [focus, interactive, svg]);
  const dragStart = useRef<{ x: number; y: number; offsetX: number; offsetY: number } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // React attaches wheel listeners as passive by default, so an onWheel prop
  // can't reliably call preventDefault(). A native listener registered with
  // { passive: false } is the only way to stop the page scroll when the
  // wheel is used for zooming or for scrolling inside the box.
  useEffect(() => {
    const node = containerRef.current;
    if (!node) return;
    const handleWheel = (event: WheelEvent) => {
      if (event.ctrlKey || event.metaKey) {
        event.preventDefault();
        const next = Math.min(
          MAX_ZOOM,
          Math.max(MIN_ZOOM, zoomRef.current + (event.deltaY < 0 ? ZOOM_STEP : -ZOOM_STEP)),
        );
        setZoom(next);
        if (next <= 1) setOffset({ x: 0, y: 0 });
        return;
      }
      // Scroll inside the box, as far as the diagram goes.
      const content = contentRef.current;
      if (!content) return;
      const scale = zoomRef.current;
      const sideways = event.shiftKey || Math.abs(event.deltaX) > Math.abs(event.deltaY);
      const delta = sideways ? event.deltaX || event.deltaY : event.deltaY;
      const room = sideways
        ? node.clientWidth - 2 * BOX_PADDING - content.offsetWidth * scale
        : node.clientHeight - 2 * BOX_PADDING - content.offsetHeight * scale;
      const axis = sideways ? 'x' : 'y';
      const current = offsetRef.current[axis];
      const next = Math.min(0, Math.max(Math.min(0, room), current - delta));
      if (next === current) return;
      event.preventDefault();
      setOffset({ ...offsetRef.current, [axis]: next });
    };
    node.addEventListener('wheel', handleWheel, { passive: false });
    return () => node.removeEventListener('wheel', handleWheel);
  }, []);

  return (
    <div className="flex flex-col gap-2">
      <div
        ref={containerRef}
        className="max-h-[75vh] cursor-grab touch-none overflow-hidden rounded-lg border border-border bg-card p-4 active:cursor-grabbing"
        onPointerDown={(event) => {
          if (event.button !== 0) return;
          press.current = { x: event.clientX, y: event.clientY, entity: entityAt(event.target) };
          dragStart.current = {
            x: event.clientX,
            y: event.clientY,
            offsetX: offset.x,
            offsetY: offset.y,
          };
          event.currentTarget.setPointerCapture(event.pointerId);
        }}
        onPointerMove={(event) => {
          if (!dragStart.current) {
            if (interactive) setHovered(entityAt(event.target));
            return;
          }
          setOffset({
            x: dragStart.current.offsetX + event.clientX - dragStart.current.x,
            y: dragStart.current.offsetY + event.clientY - dragStart.current.y,
          });
        }}
        onPointerUp={(event) => {
          dragStart.current = null;
          if (interactive) setHovered(entityAt(event.target));
          const start = press.current;
          press.current = null;
          // A click, not a drag: keep the highlight on that element, or drop it.
          if (
            interactive &&
            start &&
            Math.hypot(event.clientX - start.x, event.clientY - start.y) < CLICK_SLOP
          )
            setPinned((current) =>
              start.entity && start.entity !== current ? start.entity : null,
            );
        }}
        onPointerLeave={() => setHovered(null)}
        onPointerCancel={() => {
          dragStart.current = null;
          press.current = null;
        }}
        aria-label="Vista ampliable: Ctrl y rueda para acercar, rueda para desplazarse y arrastre para moverse"
      >
        <div
          ref={contentRef}
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
        {zoom !== 1 || offset.x !== 0 || offset.y !== 0 ? (
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
        {pinned ? (
          <Button type="button" variant="ghost" size="sm" onClick={() => setPinned(null)}>
            Quitar resaltado
          </Button>
        ) : null}
        <span className="ml-auto hidden text-right sm:inline">
          {interactive ? 'Señale o pulse un elemento para ver sus conexiones · ' : ''}Ctrl + rueda
          para acercar
        </span>
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
