'use client';

import { Code2, Download, Pencil, X } from 'lucide-react';
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
  onSaveEdit,
}: {
  svg: string;
  source: string;
  sourceFormat: string;
  code: string;
  caption?: string;
  onSaveEdit?: (source: string) => Promise<void>;
}) {
  const [showSource, setShowSource] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(source);
  const [saving, setSaving] = useState(false);
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
        <button
          type="button"
          onClick={() => setShowSource((v) => !v)}
          className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-muted-foreground hover:bg-muted/40"
        >
          <Code2 className="size-3.5" aria-hidden="true" />
          {showSource ? 'Ocultar código fuente' : 'Ver código fuente'}
        </button>
        <button
          type="button"
          onClick={() => download(`${code}.svg`, svg, 'image/svg+xml')}
          className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-muted-foreground hover:bg-muted/40"
        >
          <Download className="size-3.5" aria-hidden="true" />
          Descargar SVG
        </button>
        <button
          type="button"
          onClick={() => download(`${code}.${extension}`, source, 'text/plain')}
          className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-muted-foreground hover:bg-muted/40"
        >
          <Download className="size-3.5" aria-hidden="true" />
          Descargar código fuente
        </button>
        {onSaveEdit && !editing ? (
          <button
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
          </button>
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
              <button
                type="button"
                onClick={save}
                disabled={saving}
                className="rounded-md bg-primary px-3 py-1.5 text-sm text-primary-foreground disabled:opacity-50"
              >
                {saving ? 'Guardando…' : 'Guardar y volver a generar'}
              </button>
              <button
                type="button"
                onClick={() => setEditing(false)}
                className="inline-flex items-center gap-1 text-sm text-muted-foreground underline"
              >
                <X className="size-3.5" aria-hidden="true" />
                Cancelar
              </button>
            </div>
          </div>
        ) : (
          <pre className="overflow-auto rounded-md border border-border bg-muted/30 p-3 font-mono text-xs">
            {source}
          </pre>
        )
      ) : null}
    </div>
  );
}
