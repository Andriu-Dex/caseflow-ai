'use client';

import { Code2, Download, Maximize2, Pencil, X, ZoomIn, ZoomOut } from 'lucide-react';
import { Button } from '@caseflow-ai/ui';
import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { ApiError, downloadFile } from '../lib/api';
import { TrustedDiagram } from './trusted-svg';
import { nodeKeyAt, readGraph } from './diagram-graph';

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
// and the lines between them (diagram-graph.ts reads them from the SVG); a
// diagram without that markup simply has no highlighting.
const FADED_ENTITY = '0.15';
const FADED_LINK = '0.06';
const CLICK_SLOP = 5;
const entityAt = nodeKeyAt;
// The zoom controls of both views. They are the same controls; only where they
// sit and how they look differs: a plain bar under the diagram, or a floating
// pill over the full-screen one.
function ZoomControls({
  floating,
  zoom,
  moved,
  pinned,
  isolated,
  onToggleIsolate,
  interactive,
  onZoomOut,
  onZoomIn,
  onReset,
  onUnpin,
}: {
  floating: boolean;
  zoom: number;
  moved: boolean;
  pinned: boolean;
  isolated: boolean;
  onToggleIsolate: () => void;
  interactive: boolean;
  onZoomOut: () => void;
  onZoomIn: () => void;
  onReset: () => void;
  onUnpin: () => void;
}) {
  const icon = floating ? 'size-3.5' : 'size-4';
  const iconButton = floating ? 'ghost' : 'outline';
  const small = floating ? 'h-7 rounded-full px-2.5 text-xs font-normal' : undefined;
  const hint = `${interactive ? 'Señale o pulse un elemento para ver sus conexiones · ' : ''}Ctrl + rueda para acercar`;
  return (
    <div
      className={
        floating
          ? 'absolute bottom-6 left-1/2 z-20 flex -translate-x-1/2 flex-wrap items-center gap-1.5 rounded-full border border-border/80 bg-background/95 px-3.5 py-1.5 text-xs text-foreground shadow-2xl backdrop-blur-md'
          : 'flex items-center gap-1 text-xs text-muted-foreground'
      }
    >
      <Button
        type="button"
        variant={iconButton}
        size="icon-sm"
        aria-label="Alejar"
        disabled={zoom <= MIN_ZOOM}
        className={floating ? 'size-7 rounded-full' : undefined}
        onClick={onZoomOut}
      >
        <ZoomOut aria-hidden="true" className={icon} />
      </Button>
      <span className={`min-w-12 text-center ${floating ? 'font-mono font-medium' : ''}`}>
        {Math.round(zoom * 100)}%
      </span>
      <Button
        type="button"
        variant={iconButton}
        size="icon-sm"
        aria-label="Acercar"
        disabled={zoom >= MAX_ZOOM}
        className={floating ? 'size-7 rounded-full' : undefined}
        onClick={onZoomIn}
      >
        <ZoomIn aria-hidden="true" className={icon} />
      </Button>
      {floating ? <div className="mx-1 h-4 w-px bg-border/80" /> : null}
      {zoom !== 1 || moved ? (
        <Button type="button" variant="ghost" size="sm" className={small} onClick={onReset}>
          Restablecer
        </Button>
      ) : null}
      {pinned ? (
        <Button
          type="button"
          variant={isolated ? 'secondary' : 'ghost'}
          size="sm"
          className={small}
          aria-pressed={isolated}
          onClick={onToggleIsolate}
        >
          {isolated ? 'Mostrar todo' : 'Aislar'}
        </Button>
      ) : null}
      {pinned ? (
        <Button
          type="button"
          variant={floating ? 'secondary' : 'ghost'}
          size="sm"
          className={small}
          onClick={onUnpin}
        >
          Quitar resaltado
        </Button>
      ) : null}
      {floating ? (
        <div className="hidden items-center gap-1 border-l border-border/60 pl-2 text-[11px] text-muted-foreground md:flex">
          <span>{hint}</span>
        </div>
      ) : (
        <span className="ml-auto hidden text-right sm:inline">{hint}</span>
      )}
    </div>
  );
}

function ZoomableDiagram({
  svg,
  caption,
  fullscreen = false,
}: {
  svg: string;
  caption?: string;
  fullscreen?: boolean;
}) {
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
  // With an element kept, hide everything not connected to it instead of fading.
  const [isolated, setIsolated] = useState(false);
  const isolate = isolated && pinned !== null;
  // Dropping the highlight, however it happens, leaves the isolated view too.
  useEffect(() => {
    if (pinned === null) setIsolated(false);
  }, [pinned]);
  const press = useRef<{ x: number; y: number; entity: string | null } | null>(null);
  const focus = pinned ?? hovered;

  useEffect(() => {
    setInteractive(!!contentRef.current && !!readGraph(contentRef.current));
    setHovered(null);
    setPinned(null);
    setIsolated(false);
  }, [svg]);

  useEffect(() => {
    const root = contentRef.current;
    if (!root || !interactive) return;
    const graph = readGraph(root);
    if (!graph) return;
    const line = (el: SVGElement) =>
      el.tagName.toLowerCase() === 'path' ? el : el.querySelector<SVGElement>('path');
    const clear = () => {
      graph.nodes.forEach(({ el }) => {
        el.style.opacity = '';
        el.style.display = '';
      });
      graph.links.forEach(({ els }) => {
        els.forEach((el) => {
          el.style.opacity = '';
          el.style.display = '';
        });
        const path = line(els[0]!);
        if (path) path.style.strokeWidth = '';
      });
    };
    clear();
    if (!focus) return;
    const near = new Set([focus]);
    const touching = new Set<SVGElement[]>();
    graph.links.forEach((link) => {
      if (!link.keys.includes(focus)) return;
      touching.add(link.els);
      link.keys.forEach((key) => near.add(key));
    });
    graph.nodes.forEach(({ key, el }) => {
      if (near.has(key)) return;
      if (isolate) el.style.display = 'none';
      else el.style.opacity = FADED_ENTITY;
    });
    graph.links.forEach(({ els }) => {
      const on = touching.has(els);
      if (!on)
        els.forEach((el) => {
          if (isolate) el.style.display = 'none';
          else el.style.opacity = FADED_LINK;
        });
      const path = line(els[0]!);
      if (path && on) path.style.strokeWidth = '2.5px';
    });
    return clear;
  }, [focus, interactive, isolate, svg]);

  // Once only the connections are left, bring them into view: zoom and move
  // the diagram so they fill the box.
  useEffect(() => {
    const content = contentRef.current;
    const box = containerRef.current;
    if (!isolate || !content || !box) return;
    const graph = readGraph(content);
    if (!graph) return;
    const shown = graph.nodes.filter(({ el }) => el.style.display !== 'none');
    if (!shown.length) return;
    let left = Infinity;
    let top = Infinity;
    let right = -Infinity;
    let bottom = -Infinity;
    for (const { el } of shown) {
      const rect = el.getBoundingClientRect();
      left = Math.min(left, rect.left);
      top = Math.min(top, rect.top);
      right = Math.max(right, rect.right);
      bottom = Math.max(bottom, rect.bottom);
    }
    if (!(right - left > 0 && bottom - top > 0)) return;
    // The wrapper's rectangle already includes the current move and zoom.
    const origin = content.getBoundingClientRect();
    const scale = zoomRef.current;
    const x = (left - origin.left) / scale;
    const y = (top - origin.top) / scale;
    const width = (right - left) / scale;
    const height = (bottom - top) / scale;
    const roomX = box.clientWidth - 2 * BOX_PADDING;
    const roomY = box.clientHeight - 2 * BOX_PADDING;
    const next = Math.min(
      MAX_ZOOM,
      Math.max(MIN_ZOOM, Math.min(roomX / width, roomY / height) * 0.95),
    );
    setZoom(next);
    setOffset({
      x: -x * next + (roomX - width * next) / 2,
      y: -y * next + (roomY - height * next) / 2,
    });
  }, [isolate, pinned]);
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
    <div className={`relative flex flex-col ${fullscreen ? 'h-full w-full' : 'gap-2'}`}>
      <div
        ref={containerRef}
        className={
          fullscreen
            ? 'relative flex-1 w-full h-full cursor-grab touch-none overflow-hidden bg-muted/15 p-6 active:cursor-grabbing'
            : 'max-h-[75vh] cursor-grab touch-none overflow-hidden rounded-lg border border-border bg-card p-4 active:cursor-grabbing'
        }
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
      <ZoomControls
        floating={fullscreen}
        zoom={zoom}
        moved={offset.x !== 0 || offset.y !== 0}
        pinned={pinned !== null}
        isolated={isolate}
        onToggleIsolate={() => setIsolated((current) => !current)}
        interactive={interactive}
        onZoomOut={() => {
          const next = Math.max(MIN_ZOOM, zoom - ZOOM_STEP);
          setZoom(next);
          if (next <= 1) setOffset({ x: 0, y: 0 });
        }}
        onZoomIn={() => setZoom((current) => Math.min(MAX_ZOOM, current + ZOOM_STEP))}
        onReset={() => {
          setZoom(1);
          setOffset({ x: 0, y: 0 });
        }}
        onUnpin={() => {
          setPinned(null);
          setIsolated(false);
        }}
      />
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

  useEffect(() => {
    if (!fullscreen) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setFullscreen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [fullscreen]);

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
          aria-label={caption || 'Vista en pantalla completa del diagrama'}
          className="fixed inset-0 z-50 flex flex-col bg-background text-foreground"
        >
          <header className="flex h-14 shrink-0 items-center justify-between border-b border-border/80 bg-card/90 px-4 sm:px-6 backdrop-blur-md">
            <div className="flex items-center gap-2.5 overflow-hidden">
              <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary border border-primary/20">
                <Maximize2 className="size-4" aria-hidden="true" />
              </span>
              <div className="flex flex-col truncate">
                <span className="truncate text-sm font-semibold text-foreground">
                  {caption || 'Diagrama'}
                </span>
                <span className="text-[11px] text-muted-foreground font-mono">
                  {code} · {sourceFormat}
                </span>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                type="button"
                onClick={() => download(`${code}.svg`, svg, 'image/svg+xml')}
                className="hidden sm:inline-flex items-center gap-1.5 text-xs h-8"
              >
                <Download className="size-3.5" aria-hidden="true" />
                Descargar SVG
              </Button>
              {pngUrl ? (
                <Button
                  variant="outline"
                  size="sm"
                  type="button"
                  onClick={() => downloadPng(pngUrl, `${code}.png`)}
                  className="hidden sm:inline-flex items-center gap-1.5 text-xs h-8"
                >
                  <Download className="size-3.5" aria-hidden="true" />
                  Descargar PNG
                </Button>
              ) : null}
              <Button
                variant="outline"
                size="sm"
                type="button"
                onClick={() => download(`${code}.${extension}`, source, 'text/plain')}
                className="hidden md:inline-flex items-center gap-1.5 text-xs h-8"
              >
                <Code2 className="size-3.5" aria-hidden="true" />
                Descargar código fuente
              </Button>
              <div className="hidden sm:block h-5 w-px bg-border mx-1" />
              <Button
                variant="ghost"
                size="sm"
                type="button"
                onClick={() => setFullscreen(false)}
                className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted"
                aria-label="Cerrar pantalla completa"
              >
                <X className="size-4" aria-hidden="true" />
                <span>Cerrar</span>
                <kbd className="hidden sm:inline-flex items-center rounded border border-border/80 bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
                  Esc
                </kbd>
              </Button>
            </div>
          </header>

          <div className="relative flex-1 w-full h-full overflow-hidden">
            <ZoomableDiagram key={`fullscreen-${svg}`} svg={svg} caption={caption} fullscreen />
          </div>
        </div>
      ) : null}
    </div>
  );
}
