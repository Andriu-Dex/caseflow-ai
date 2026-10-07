'use client';

import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, CheckCircle2, FileText, Loader2, Pencil, XCircle } from 'lucide-react';
import { toast } from 'sonner';
import {
  ALLOWED_SOURCE_MIME_TYPES,
  SOURCE_KIND_MIME_TYPES,
  SOURCE_LIMITS,
  type ProjectSourceKind,
  type SourceCapabilitiesResponse,
  type SourceFailureReason,
  type SourceResponse,
} from '@caseflow-ai/contracts';
import { Button, Textarea } from '@caseflow-ai/ui';
import { api, ApiError, fetchBlob } from '../lib/api';

// Sources page building blocks: what each kind does with a file, the
// processing status in plain language, the original next to its text, and
// in-place correction of that text.

export const SOURCE_KIND_LABELS: Record<ProjectSourceKind, string> = {
  PDF: 'Documento PDF',
  AUDIO: 'Audio',
  IMAGE: 'Imagen',
  TEXT: 'Texto',
  NOTES: 'Notas',
  OTHER: 'Otro',
  // Retired kinds: still shown on the sources that already use them.
  FORM: 'Formulario (anterior)',
  INVOICE: 'Factura (anterior)',
};

// The file picker's accept list for a kind ('' = no file for this kind).
export function sourceKindAccept(kind: ProjectSourceKind): string {
  const types = SOURCE_KIND_MIME_TYPES[kind] ?? ALLOWED_SOURCE_MIME_TYPES;
  return types.join(',');
}

export const FAILURE_MESSAGES: Record<SourceFailureReason, string> = {
  TOO_MANY_PAGES: `El PDF supera las ${SOURCE_LIMITS.maxPdfPages} páginas.`,
  TOO_MANY_SCANNED_PAGES: `El PDF tiene más de ${SOURCE_LIMITS.maxScannedPdfPages} páginas escaneadas.`,
  TEXT_TOO_LONG: `El texto supera los ${SOURCE_LIMITS.maxExtractedCharacters.toLocaleString('es')} caracteres.`,
  EMPTY: 'No se encontró texto en el archivo.',
  OCR_UNAVAILABLE: 'El reconocimiento de texto no está disponible en esta instalación.',
  TRANSCRIPTION_UNAVAILABLE: 'La transcripción automática no está configurada.',
  UNSUPPORTED_FORMAT: 'Este formato no se puede leer automáticamente.',
  UNREADABLE: 'El archivo está dañado o no se pudo leer.',
};

export function useSourceCapabilities(projectId: string) {
  return useQuery({
    queryKey: ['source-capabilities', projectId],
    queryFn: () => api.sources.capabilities(projectId),
    staleTime: 5 * 60_000,
  });
}

// What will happen with a file of this kind, before uploading it.
export function SourceKindHint({
  kind,
  capabilities,
}: {
  kind: ProjectSourceKind;
  capabilities: SourceCapabilitiesResponse | undefined;
}) {
  const maxMb = Math.round((capabilities?.maxFileSizeBytes ?? 25 * 1024 * 1024) / 1024 / 1024);
  let text: string;
  let warning = false;
  switch (kind) {
    case 'PDF':
      text =
        capabilities?.ocr === false
          ? `Se extraerá el texto de cada página (máx. ${SOURCE_LIMITS.maxPdfPages}). Las páginas escaneadas no se pueden leer automáticamente en esta instalación.`
          : `Se extraerá el texto de cada página; las escaneadas pasan por reconocimiento de texto (máx. ${SOURCE_LIMITS.maxPdfPages} páginas, ${SOURCE_LIMITS.maxScannedPdfPages} escaneadas).`;
      break;
    case 'TEXT':
      text = 'Se leerá el texto del archivo (.txt, .md o .docx).';
      break;
    case 'IMAGE':
      warning = capabilities?.ocr === false;
      text = warning
        ? 'El reconocimiento de texto no está disponible; podrá escribir el contenido después de subir la imagen.'
        : 'Se reconocerá el texto de la imagen.';
      break;
    case 'AUDIO':
      warning = capabilities?.transcription === false;
      text = warning
        ? 'La transcripción automática no está disponible; podrá escribir la transcripción después de subir el archivo.'
        : 'El audio se transcribirá automáticamente.';
      break;
    case 'NOTES':
      return (
        <p className="text-xs text-muted-foreground">
          Escriba el contenido directamente. Si adjunta un archivo, el tipo se ajustará a su
          formato.
        </p>
      );
    default:
      text = 'Se intentará obtener el texto según el formato del archivo.';
  }
  return (
    <p
      className={`flex items-start gap-1.5 text-xs ${
        warning ? 'text-amber-700 dark:text-amber-400' : 'text-muted-foreground'
      }`}
    >
      {warning ? <AlertTriangle className="mt-px size-3.5 shrink-0" aria-hidden="true" /> : null}
      <span>
        {text} Tamaño máximo: {maxMb} MB.
      </span>
    </p>
  );
}

type StatusTone = 'working' | 'done' | 'manual' | 'failed';

// The processing state of a source, its reason in plain language when the
// text could not be obtained, and whether a retry makes sense.
export function sourceStatus(source: SourceResponse): {
  tone: StatusTone;
  label: string;
  reason: string | null;
  retryable: boolean;
} {
  const job = source.processing;
  const reasonCode = job?.failureReason ?? source.source.extractionFailureReason;
  const reason = reasonCode ? FAILURE_MESSAGES[reasonCode] : (job?.errorMessage ?? null);
  if (job && ['QUEUED', 'RUNNING'].includes(job.status) && !source.source.hasExtractedText)
    return {
      tone: 'working',
      label:
        job.status === 'QUEUED'
          ? 'En cola para procesar…'
          : job.processor === 'OCR'
            ? 'Reconociendo texto…'
            : job.processor === 'TRANSCRIPTION'
              ? 'Transcribiendo audio…'
              : 'Extrayendo texto…',
      reason: null,
      retryable: false,
    };
  if (source.source.extractionState === 'MANUAL')
    return {
      tone: 'done',
      label: source.source.originalFilename ? 'Transcripción manual' : 'Contenido escrito',
      reason: null,
      retryable: false,
    };
  if (source.source.hasExtractedText)
    return { tone: 'done', label: 'Texto extraído', reason: null, retryable: false };
  const unsupported =
    job?.status === 'UNSUPPORTED' || source.source.extractionState === 'UNSUPPORTED';
  return {
    tone: unsupported ? 'manual' : 'failed',
    label: unsupported ? 'Requiere transcripción manual' : 'No se pudo procesar',
    reason,
    retryable: Boolean(job && ['FAILED', 'UNSUPPORTED'].includes(job.status)),
  };
}

const TONE_STYLES: Record<StatusTone, string> = {
  working:
    'border-sky-200 bg-sky-50 text-sky-800 dark:border-sky-900 dark:bg-sky-950/40 dark:text-sky-300',
  done: 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300',
  manual:
    'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300',
  failed:
    'border-red-200 bg-red-50 text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300',
};

export function SourceStatusBadge({ tone, label }: { tone: StatusTone; label: string }) {
  const Icon =
    tone === 'working'
      ? Loader2
      : tone === 'done'
        ? CheckCircle2
        : tone === 'manual'
          ? AlertTriangle
          : XCircle;
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium ${TONE_STYLES[tone]}`}
    >
      <Icon
        className={`size-3.5 ${tone === 'working' ? 'animate-spin motion-reduce:animate-none' : ''}`}
        aria-hidden="true"
      />
      {label}
    </span>
  );
}

const PREVIEWABLE = (type: string | null) =>
  Boolean(
    type && (type === 'application/pdf' || type.startsWith('image/') || type.startsWith('audio/')),
  );

// The original file, fetched with the session (the API never exposes it
// through a public URL) and shown by the browser's own viewer or player.
export function SourcePreview({
  projectId,
  source,
}: {
  projectId: string;
  source: SourceResponse;
}) {
  const mimeType = source.source.mimeType;
  const previewable = PREVIEWABLE(mimeType);
  const blob = useQuery({
    queryKey: ['source-file', projectId, source.id, source.source.contentHash],
    queryFn: () => fetchBlob(api.sources.downloadUrl(projectId, source.id)),
    enabled: previewable,
    staleTime: Infinity,
  });
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!blob.data) return;
    const objectUrl = URL.createObjectURL(blob.data);
    setUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [blob.data]);

  if (!previewable)
    return (
      <p className="rounded-md border border-dashed border-border p-4 text-muted-foreground">
        Este formato no tiene vista previa. Puede descargar el archivo original.
      </p>
    );
  if (blob.isError)
    return <p className="text-destructive">No se pudo cargar el archivo original.</p>;
  if (!url) return <p className="text-muted-foreground">Cargando archivo original…</p>;
  const title = `Archivo original: ${source.source.originalFilename ?? source.source.title}`;
  if (mimeType === 'application/pdf')
    return (
      <iframe
        title={title}
        src={url}
        className="h-[28rem] w-full rounded-md border border-border"
      />
    );
  if (mimeType!.startsWith('image/'))
    return (
      <img
        src={url}
        alt={title}
        className="max-h-[28rem] w-full rounded-md border border-border bg-muted/30 object-contain"
      />
    );
  return (
    <audio controls src={url} className="w-full" aria-label={title}>
      Su navegador no puede reproducir este audio.
    </audio>
  );
}

// The extracted (or manually written) text, editable in place. Saving stores
// a manual transcript: a new version whose origin is MANUAL, so the automatic
// result stays in the history.
export function ExtractedTextPanel({
  projectId,
  source,
  text,
  loading,
  onSaved,
}: {
  projectId: string;
  source: SourceResponse;
  text: string | undefined;
  loading: boolean;
  onSaved: () => void;
}) {
  const editable = Boolean(source.source.originalFilename) && !source.archivedAt;
  const [draft, setDraft] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const editing = draft !== null;
  const dirty = editing && draft !== (text ?? '');
  const limit = SOURCE_LIMITS.maxExtractedCharacters;

  async function save() {
    if (draft === null) return;
    setSaving(true);
    try {
      await api.sources.submitManualTranscript(projectId, source.id, draft.trim());
      toast.success('Texto guardado como nueva versión.');
      setDraft(null);
      onSaved();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'No se pudo guardar el texto.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-2 rounded-md border border-border bg-muted/20 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
          <FileText className="size-3.5" aria-hidden="true" />
          {text === undefined && !loading ? 'Transcripción' : 'Texto extraído'}
        </p>
        {editable && !editing ? (
          <Button type="button" variant="outline" size="sm" onClick={() => setDraft(text ?? '')}>
            <Pencil className="size-3.5" aria-hidden="true" />
            {text === undefined ? 'Escribir transcripción' : 'Editar texto'}
          </Button>
        ) : null}
      </div>
      {editing ? (
        <>
          <Textarea
            aria-label="Texto de la fuente"
            rows={14}
            maxLength={limit}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            className="font-mono text-xs"
          />
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
            <span>
              {draft.length.toLocaleString('es')} / {limit.toLocaleString('es')} caracteres
              {dirty ? ' · Cambios sin guardar' : ''}
            </span>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={saving}
                onClick={() => setDraft(null)}
              >
                Descartar
              </Button>
              <Button
                type="button"
                size="sm"
                disabled={saving || !dirty || !draft.trim()}
                onClick={save}
              >
                {saving ? 'Guardando…' : 'Guardar'}
              </Button>
            </div>
          </div>
        </>
      ) : loading ? (
        <p className="text-muted-foreground">Cargando texto…</p>
      ) : text !== undefined ? (
        <pre className="max-h-[28rem] overflow-auto whitespace-pre-wrap text-xs">{text}</pre>
      ) : (
        <p className="text-muted-foreground">
          Todavía no hay texto. {editable ? 'Puede escribir la transcripción a mano.' : ''}
        </p>
      )}
    </div>
  );
}
