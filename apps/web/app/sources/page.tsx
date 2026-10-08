'use client';

import { GenerationOverlay } from '../../components/generation-overlay';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle,
  Archive,
  ChevronRight,
  Columns2,
  Download,
  FileText,
  MoreHorizontal,
  Pencil,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import { useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import {
  SELECTABLE_SOURCE_KINDS,
  sourceKindAcceptsMimeType,
  sourceKindForMimeType,
  type ProjectSourceKind,
  type SourceReportCandidate,
  type SourceResponse,
  type StalenessAnalysisResponse,
} from '@caseflow-ai/contracts';
import {
  Badge,
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Textarea,
} from '@caseflow-ai/ui';
import { api, ApiError, downloadFile } from '../../lib/api';
import { QueryState, RequireActiveProject } from '../../components/query-state';
import { PageHeading } from '../../components/page-heading';
import { AddSection } from '../../components/add-section';
import { ReadableText } from '../../components/readable-text';
import { StatusBadge } from '../../components/status-badge';
import {
  ExtractedTextPanel,
  SOURCE_KIND_LABELS,
  SourceKindHint,
  SourcePreview,
  SourceStatusBadge,
  sourceKindAccept,
  sourceStatus,
  useSourceCapabilities,
} from '../../components/source-panels';

// A source doesn't become stale itself — it's the authoritative, newer
// knowledge. What can happen is that something *downstream* (today, only
// the Project Context) hasn't incorporated it yet. Home and Trazabilidad
// already point the user at that; this surfaces the same concrete reason
// right where the source itself lives, instead of leaving this page silent
// about why there's more than one approved version to begin with.
function outboundStalenessMessages(
  staleness: StalenessAnalysisResponse | undefined,
  sourceArtifactId: string,
): string[] {
  if (!staleness) return [];
  const messages = new Set<string>();
  for (const entry of staleness.entries)
    for (const reason of entry.reasons)
      if (reason.sourceArtifactId === sourceArtifactId) messages.add(reason.message);
  return [...messages];
}

function CreateSourceForm({
  projectId,
  onCreated,
  onClose,
}: {
  projectId: string;
  onCreated: () => void;
  // Absent while the project has no sources: the form is the page's content.
  onClose?: () => void;
}) {
  const [title, setTitle] = useState('');
  const [sourceKind, setSourceKind] = useState<ProjectSourceKind>('NOTES');
  const [purpose, setPurpose] = useState('');
  const [businessArea, setBusinessArea] = useState('');
  const [description, setDescription] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const capabilities = useSourceCapabilities(projectId);

  function clearFile() {
    setFile(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  // The kind follows the file: a file of another format switches the kind
  // (with a notice) instead of failing on upload.
  function chooseFile(next: File | null) {
    if (next && next.type && !sourceKindAcceptsMimeType(sourceKind, next.type)) {
      const detected = sourceKindForMimeType(next.type);
      if (!detected) {
        toast.error('Este formato de archivo no está permitido.');
        clearFile();
        return;
      }
      setSourceKind(detected);
      toast.info(`Se cambió el tipo a «${SOURCE_KIND_LABELS[detected]}» según el archivo.`);
    }
    setFile(next);
  }

  function chooseKind(next: ProjectSourceKind) {
    setSourceKind(next);
    if (file && !sourceKindAcceptsMimeType(next, file.type)) {
      clearFile();
      toast.info(
        next === 'NOTES'
          ? 'Las notas no llevan archivo; se quitó el archivo seleccionado.'
          : `Se quitó el archivo: no corresponde al tipo «${SOURCE_KIND_LABELS[next]}».`,
      );
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      const created = await api.sources.create(
        projectId,
        {
          title,
          sourceKind,
          purpose,
          businessArea: businessArea || undefined,
          description,
        },
        file,
      );
      setTitle('');
      setPurpose('');
      setBusinessArea('');
      setDescription('');
      clearFile();
      onCreated();
      onClose?.();
      toast.success(
        created.processing
          ? 'Fuente guardada. El procesamiento continuará en segundo plano.'
          : 'Fuente guardada.',
      );
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'No se pudo crear la fuente.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="flex flex-col gap-3 rounded-lg border border-border bg-card p-4"
    >
      <h2 className="text-sm font-semibold text-foreground">Agregar fuente de conocimiento</h2>
      {onClose ? null : (
        <p className="text-sm text-muted-foreground">
          Las fuentes son el conocimiento del que parte el proyecto: entrevistas, documentos,
          normativas o notas. Agregue la primera para comenzar.
        </p>
      )}
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5 text-sm">
          <Label htmlFor="source-kind">Tipo de fuente</Label>
          <Select value={sourceKind} onValueChange={(v) => chooseKind(v as ProjectSourceKind)}>
            <SelectTrigger id="source-kind" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SELECTABLE_SOURCE_KINDS.map((k) => (
                <SelectItem key={k} value={k}>
                  {SOURCE_KIND_LABELS[k]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-1.5 text-sm">
          <Label htmlFor="source-title">Título</Label>
          <Input
            id="source-title"
            required
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
        </div>
      </div>
      <SourceKindHint kind={sourceKind} capabilities={capabilities.data} />
      <div className="flex flex-col gap-1.5 text-sm">
        <Label htmlFor="source-purpose">¿Qué representa esta fuente?</Label>
        <Textarea
          id="source-purpose"
          required
          rows={2}
          value={purpose}
          onChange={(e) => setPurpose(e.target.value)}
        />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5 text-sm">
          <Label htmlFor="source-business-area">Área / dominio de negocio (opcional)</Label>
          <Input
            id="source-business-area"
            value={businessArea}
            onChange={(e) => setBusinessArea(e.target.value)}
          />
        </div>
        <div className="flex flex-col gap-1.5 text-sm">
          <Label htmlFor="source-file">Archivo (opcional)</Label>
          <input
            ref={fileInputRef}
            id="source-file"
            type="file"
            accept={sourceKindAccept(sourceKind)}
            className="sr-only"
            onChange={(e) => chooseFile(e.target.files?.[0] ?? null)}
          />
          <div className="flex gap-1">
            <Button
              type="button"
              variant="outline"
              className="w-full justify-start overflow-hidden font-normal"
              onClick={() => fileInputRef.current?.click()}
            >
              <Upload className="size-4 shrink-0" aria-hidden="true" />
              <span className="truncate">{file ? file.name : 'Seleccionar archivo…'}</span>
            </Button>
            {file ? (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label="Quitar archivo"
                onClick={clearFile}
              >
                <X className="size-4" aria-hidden="true" />
              </Button>
            ) : null}
          </div>
        </div>
      </div>
      <div className="flex flex-col gap-1.5 text-sm">
        <Label htmlFor="source-description">
          {file ? 'Contexto adicional (opcional)' : 'Contenido'}
        </Label>
        <p className="text-xs text-muted-foreground">
          {file
            ? 'El archivo se procesará para obtener su texto. Puede añadir contexto aquí.'
            : 'Escriba aquí el contenido de la fuente o adjunte un archivo.'}
        </p>
        <Textarea
          id="source-description"
          required={!file}
          rows={3}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </div>
      <div className="flex gap-2">
        <Button type="submit" disabled={submitting}>
          {submitting ? 'Guardando…' : 'Agregar fuente'}
        </Button>
        {onClose ? (
          <Button type="button" variant="ghost" disabled={submitting} onClick={onClose}>
            Cancelar
          </Button>
        ) : null}
      </div>
    </form>
  );
}

function SourceCard({
  source,
  projectId,
  staleness,
}: {
  source: SourceResponse;
  projectId: string;
  staleness: StalenessAnalysisResponse | undefined;
}) {
  const [open, setOpen] = useState(false);
  const outboundMessages = useMemo(
    () => outboundStalenessMessages(staleness, source.id),
    [staleness, source.id],
  );
  const queryClient = useQueryClient();
  const [manualSummary, setManualSummary] = useState('');
  const [generatingReport, setGeneratingReport] = useState(false);
  const [reportCandidate, setReportCandidate] = useState<SourceReportCandidate | null>(null);
  const [acceptingReport, setAcceptingReport] = useState(false);
  const [approving, setApproving] = useState(false);
  const [editing, setEditing] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  // The detail opens as a reading view; the original side by side and the
  // text editor are one click away.
  const [view, setView] = useState<'read' | 'compare' | 'edit'>('read');
  const hasFile = Boolean(source.source.originalFilename);

  const report = useQuery({
    queryKey: ['source-report', projectId, source.id],
    queryFn: () => api.sources.getReport(projectId, source.id),
    enabled: open && source.source.hasReport,
    retry: false,
  });
  const extractedText = useQuery({
    queryKey: ['source-text', projectId, source.id, source.version.id],
    queryFn: () => api.sources.getText(projectId, source.id),
    enabled: open && source.source.hasExtractedText,
  });

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: ['sources', projectId] });
    queryClient.invalidateQueries({ queryKey: ['readiness', projectId] });
    // A source's approved version is exactly what staleness reasons about.
    queryClient.invalidateQueries({ queryKey: ['staleness', projectId] });
  }

  async function transition(status: 'IN_REVIEW' | 'APPROVED' | 'CHANGES_REQUESTED') {
    try {
      await api.sources.transition(projectId, source.id, source.version.id, status);
      invalidate();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'No se pudo cambiar el estado.');
    }
  }

  async function approveDirectly() {
    setApproving(true);
    try {
      await api.sources.transition(projectId, source.id, source.version.id, 'IN_REVIEW');
      await api.sources.transition(projectId, source.id, source.version.id, 'APPROVED');
      invalidate();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'No se pudo aprobar la fuente.');
    } finally {
      setApproving(false);
    }
  }

  async function retryProcessing() {
    try {
      await api.sources.retryProcessing(projectId, source.id);
      invalidate();
    } catch (err) {
      toast.error(
        err instanceof ApiError ? err.message : 'No se pudo reintentar el procesamiento.',
      );
    }
  }

  async function generateReport() {
    setGeneratingReport(true);
    try {
      const candidate = await api.sources.generateReport(projectId, source.id);
      setReportCandidate(candidate);
    } catch (err) {
      toast.error(
        err instanceof ApiError
          ? err.message
          : 'No se pudo generar el reporte con IA en este momento. Puede redactar el resumen manualmente.',
      );
    } finally {
      setGeneratingReport(false);
    }
  }

  async function acceptReportCandidate() {
    if (!reportCandidate) return;
    setAcceptingReport(true);
    try {
      await api.sources.acceptReport(projectId, source.id, reportCandidate.id);
      setReportCandidate(null);
      queryClient.invalidateQueries({ queryKey: ['source-report', projectId, source.id] });
      invalidate();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'No se pudo aceptar el reporte.');
    } finally {
      setAcceptingReport(false);
    }
  }

  async function submitManualReport() {
    try {
      await api.sources.submitManualReport(projectId, source.id, manualSummary);
      setManualSummary('');
      invalidate();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'No se pudo guardar el reporte manual.');
    }
  }

  const canSubmitTranscript = Boolean(source.source.originalFilename) && !source.archivedAt;
  const processing = source.processing;
  const longWait =
    processing?.status === 'QUEUED' &&
    Date.now() - new Date(processing.updatedAt).getTime() > 5 * 60_000;
  const staleProcessing =
    processing?.status === 'RUNNING' &&
    Date.now() - new Date(processing.updatedAt).getTime() > 15 * 60_000;
  const status = sourceStatus(source);
  const readingText = hasFile ? extractedText.data?.text : source.source.description;
  const waitNotice = longWait
    ? 'Lleva varios minutos en cola; puede escribir la transcripción a mano o volver después.'
    : staleProcessing
      ? 'El procesamiento tardó demasiado; puede reintentarlo o escribir la transcripción a mano.'
      : null;

  return (
    <li className="rounded-lg border border-border bg-card p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <FileText className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          <span className="font-mono text-xs text-muted-foreground">
            {source.code} v{source.version.versionNumber}
          </span>
          <span className="font-medium text-foreground">{source.source.title}</span>
        </div>
        <div className="flex items-center gap-2">
          {source.archivedAt ? <Badge variant="secondary">Archivada</Badge> : null}
          {outboundMessages.length ? (
            <span
              title="Hay un artefacto que aún no incorpora esta versión aprobada."
              className="inline-flex items-center gap-1 rounded-full border border-amber-300 bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-800"
            >
              <AlertTriangle className="size-3.5" aria-hidden="true" />
              Pendiente de incorporar
            </span>
          ) : null}
          <StatusBadge status={source.version.status} />
          <Button
            variant="ghost"
            size="sm"
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="text-sm text-muted-foreground underline"
          >
            {open ? 'Ocultar detalle' : 'Ver detalle'}
          </Button>
        </div>
      </div>
      <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
        <span>{SOURCE_KIND_LABELS[source.source.sourceKind]}</span>
        <SourceStatusBadge tone={status.tone} label={status.label} />
      </div>
      {status.reason || waitNotice ? (
        <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-amber-700 dark:text-amber-400">
          <span>{waitNotice ?? status.reason}</span>
          {status.retryable || staleProcessing ? (
            <Button type="button" variant="outline" size="sm" onClick={retryProcessing}>
              Reintentar
            </Button>
          ) : null}
        </div>
      ) : null}

      {open ? (
        <div className="mt-3 flex flex-col gap-4 border-t border-border pt-3 text-sm">
          {outboundMessages.length ? (
            <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-amber-800">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              <div>
                <p className="font-medium">
                  Esta versión aprobada aún no está incorporada en todo lo que depende de ella.
                </p>
                <ul className="mt-1 flex flex-col gap-0.5">
                  {outboundMessages.map((message) => (
                    <li key={message}>{message}</li>
                  ))}
                </ul>
                <p className="mt-1.5">
                  <Link href="/context" className="underline">
                    Ir al Contexto del Proyecto
                  </Link>
                </p>
              </div>
            </div>
          ) : null}

          <dl className="flex flex-wrap gap-x-8 gap-y-2 rounded-md bg-muted/40 px-3 py-2">
            <div>
              <dt className="text-xs text-muted-foreground">Propósito</dt>
              <dd className="text-foreground/90">{source.source.purpose}</dd>
            </div>
            {source.source.businessArea ? (
              <div>
                <dt className="text-xs text-muted-foreground">Área de negocio</dt>
                <dd className="text-foreground/90">{source.source.businessArea}</dd>
              </div>
            ) : null}
            <div>
              <dt className="text-xs text-muted-foreground">Archivo</dt>
              <dd className="text-foreground/90">
                {hasFile && source.source.sizeBytes != null
                  ? `${source.source.originalFilename} · ${Math.ceil(source.source.sizeBytes / 1024)} KB`
                  : 'Sin archivo — contenido escrito'}
              </dd>
            </div>
            {hasFile && source.source.description ? (
              <div className="basis-full">
                <dt className="text-xs text-muted-foreground">Contexto</dt>
                <dd className="whitespace-pre-line text-foreground/90">
                  {source.source.description}
                </dd>
              </div>
            ) : null}
          </dl>

          <div className="flex flex-wrap items-center gap-2">
            {hasFile ? (
              <Button
                type="button"
                variant={view === 'compare' ? 'secondary' : 'outline'}
                size="sm"
                onClick={() => setView((v) => (v === 'compare' ? 'read' : 'compare'))}
              >
                <Columns2 className="size-3.5" aria-hidden="true" />
                {view === 'compare' ? 'Volver a la lectura' : 'Ver original lado a lado'}
              </Button>
            ) : null}
            {hasFile && !source.archivedAt && view === 'read' ? (
              <Button type="button" variant="outline" size="sm" onClick={() => setView('edit')}>
                <Pencil className="size-3.5" aria-hidden="true" />
                {source.source.hasExtractedText ? 'Editar texto' : 'Escribir transcripción'}
              </Button>
            ) : null}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button type="button" variant="ghost" size="sm" aria-label="Más acciones">
                  <MoreHorizontal className="size-4" aria-hidden="true" />
                  Más acciones
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start">
                <DropdownMenuItem onSelect={() => setEditing(true)}>
                  <Pencil aria-hidden="true" />
                  Editar datos de la fuente
                </DropdownMenuItem>
                {hasFile ? (
                  <DropdownMenuItem
                    onSelect={() =>
                      downloadFile(
                        api.sources.downloadUrl(projectId, source.id),
                        source.source.originalFilename!,
                      ).catch(() => toast.error('No se pudo descargar el archivo.'))
                    }
                  >
                    <Download aria-hidden="true" />
                    Descargar original
                  </DropdownMenuItem>
                ) : null}
                {source.hasApprovedHistory ? (
                  source.archivedAt ? null : (
                    <>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem onSelect={() => setConfirmingDelete(true)}>
                        <Archive aria-hidden="true" />
                        Archivar
                      </DropdownMenuItem>
                    </>
                  )
                ) : (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      variant="destructive"
                      onSelect={() => setConfirmingDelete(true)}
                    >
                      <Trash2 aria-hidden="true" />
                      Eliminar
                    </DropdownMenuItem>
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          {view === 'compare' ? (
            // The original next to its text, so a reading or transcription
            // error can be corrected while looking at the source.
            <div className="grid gap-3 lg:grid-cols-2">
              <SourcePreview projectId={projectId} source={source} />
              <ExtractedTextPanel
                projectId={projectId}
                source={source}
                text={extractedText.data?.text}
                loading={source.source.hasExtractedText && extractedText.isLoading}
                onSaved={invalidate}
              />
            </div>
          ) : view === 'edit' || (hasFile && !source.source.hasExtractedText) ? (
            <ExtractedTextPanel
              projectId={projectId}
              source={source}
              text={extractedText.data?.text}
              loading={source.source.hasExtractedText && extractedText.isLoading}
              onSaved={invalidate}
              startEditing={view === 'edit'}
              onExit={() => setView('read')}
            />
          ) : readingText ? (
            <ReadableText text={readingText} label="el texto de la fuente" />
          ) : (
            <p className="text-muted-foreground">Cargando texto…</p>
          )}

          {editing ? (
            <EditSourceForm
              projectId={projectId}
              source={source}
              onSaved={() => {
                invalidate();
                setEditing(false);
              }}
              onCancel={() => setEditing(false)}
            />
          ) : null}

          {confirmingDelete ? (
            source.hasApprovedHistory ? (
              <ArchiveSourceDialog
                projectId={projectId}
                source={source}
                onOpenChange={setConfirmingDelete}
                onArchived={() => {
                  queryClient.invalidateQueries({ queryKey: ['sources', projectId] });
                  queryClient.invalidateQueries({ queryKey: ['readiness', projectId] });
                  queryClient.invalidateQueries({ queryKey: ['staleness', projectId] });
                }}
              />
            ) : (
              <DeleteSourceDialog
                projectId={projectId}
                source={source}
                onOpenChange={setConfirmingDelete}
                onDeleted={() => {
                  queryClient.invalidateQueries({ queryKey: ['sources', projectId] });
                  queryClient.invalidateQueries({ queryKey: ['readiness', projectId] });
                  queryClient.invalidateQueries({ queryKey: ['staleness', projectId] });
                }}
              />
            )
          ) : null}

          <details className="group rounded-md border border-border">
            <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2 font-medium text-foreground select-none">
              <ChevronRight
                className="size-4 text-muted-foreground transition-transform group-open:rotate-90"
                aria-hidden="true"
              />
              Reporte de la fuente
              <span className="text-xs font-normal text-muted-foreground">
                {source.source.hasReport ? '· Registrado' : '· Opcional'}
              </span>
            </summary>
            <div className="border-t border-border px-3 py-3">
              <p className="mb-2 text-xs text-muted-foreground">
                Opcional: no es necesario para aprobar la fuente. Si lo registra, la generación del
                contexto del proyecto lo usa como guía; el texto de la fuente sigue siendo la
                referencia.
              </p>
              {source.source.hasReport ? (
                <QueryState isLoading={report.isLoading} error={null}>
                  {report.data ? (
                    <div className="flex flex-col gap-2 text-foreground/80">
                      <p>{report.data.content.summary}</p>
                      {report.data.content.actors.length ? (
                        <p>
                          <strong>Actores:</strong> {report.data.content.actors.join(', ')}
                        </p>
                      ) : null}
                      {report.data.content.needs.length ? (
                        <p>
                          <strong>Necesidades:</strong> {report.data.content.needs.join(', ')}
                        </p>
                      ) : null}
                    </div>
                  ) : null}
                </QueryState>
              ) : source.source.hasExtractedText || !canSubmitTranscript ? (
                <div className="flex flex-col gap-2">
                  <p className="text-muted-foreground">Sin reporte todavía.</p>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="self-start"
                    disabled={generatingReport}
                    onClick={generateReport}
                  >
                    {generatingReport ? 'Generando…' : 'Generar reporte con IA'}
                  </Button>
                  <GenerationOverlay open={generatingReport} />
                  {reportCandidate ? (
                    <div className="rounded-md border border-dashed border-purple-300 bg-purple-50 p-3 text-foreground/80">
                      <p className="mb-2 text-xs font-medium text-purple-700">
                        Propuesta de IA — revísela antes de incorporarla
                      </p>
                      <p>{reportCandidate.content.summary}</p>
                      {reportCandidate.content.actors.length ? (
                        <p className="mt-1">
                          <strong>Actores:</strong> {reportCandidate.content.actors.join(', ')}
                        </p>
                      ) : null}
                      {reportCandidate.content.needs.length ? (
                        <p className="mt-1">
                          <strong>Necesidades:</strong> {reportCandidate.content.needs.join(', ')}
                        </p>
                      ) : null}
                      <div className="mt-2 flex gap-2">
                        <Button
                          type="button"
                          size="sm"
                          disabled={acceptingReport}
                          onClick={acceptReportCandidate}
                        >
                          {acceptingReport ? 'Aceptando…' : 'Aceptar como reporte oficial'}
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => setReportCandidate(null)}
                        >
                          Descartar
                        </Button>
                      </div>
                    </div>
                  ) : null}
                  <textarea
                    className="w-full rounded-md border border-input px-2 py-1"
                    rows={2}
                    placeholder="O escriba un resumen manual del contenido…"
                    value={manualSummary}
                    onChange={(e) => setManualSummary(e.target.value)}
                  />
                  <Button
                    variant="default"
                    size="sm"
                    type="button"
                    onClick={submitManualReport}
                    disabled={!manualSummary.trim()}
                    className="self-start"
                  >
                    Guardar reporte manual
                  </Button>
                </div>
              ) : (
                <p className="text-muted-foreground">Guarde primero la transcripción manual.</p>
              )}
            </div>
          </details>

          <div className="flex flex-wrap gap-2 border-t border-border pt-2">
            {source.version.status === 'DRAFT' || source.version.status === 'GENERATED' ? (
              // "Enviar a revisión" (transition to IN_REVIEW) stays hidden while
              // there is only one workspace member: nobody exists yet to review
              // someone else's submission. The transition itself, and the
              // IN_REVIEW status it targets, remain fully implemented for when
              // multi-user review ships — approveDirectly still drives through
              // IN_REVIEW on the way to APPROVED.
              <Button
                variant="default"
                size="sm"
                type="button"
                onClick={approveDirectly}
                disabled={!source.source.hasExtractedText || approving}
                title={
                  !source.source.hasExtractedText
                    ? 'Se requiere conocimiento utilizable (texto extraído o transcripción manual).'
                    : undefined
                }
                className="bg-emerald-600 hover:bg-emerald-700 text-white"
              >
                {approving ? 'Aprobando…' : 'Aprobar'}
              </Button>
            ) : null}
            {source.version.status === 'IN_REVIEW' ? (
              <>
                <Button
                  variant="ghost"
                  size="sm"
                  type="button"
                  onClick={() => transition('APPROVED')}
                  className="rounded-md bg-emerald-600 px-3 py-1 text-sm text-white hover:bg-emerald-700"
                >
                  Aprobar
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  type="button"
                  onClick={() => transition('CHANGES_REQUESTED')}
                  className="rounded-md border border-destructive/40 px-3 py-1 text-sm text-destructive hover:bg-destructive/5"
                >
                  Solicitar cambios
                </Button>
              </>
            ) : null}
          </div>
        </div>
      ) : null}
    </li>
  );
}

// Editing never mutates the current row (the backend creates the next
// ArtifactVersion instead — see sources.service.ts). Only metadata is
// editable here; the original file (if any) carries over unchanged.
function EditSourceForm({
  projectId,
  source,
  onSaved,
  onCancel,
}: {
  projectId: string;
  source: SourceResponse;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const [title, setTitle] = useState(source.source.title);
  const [sourceKind, setSourceKind] = useState<ProjectSourceKind>(source.source.sourceKind);
  // Kinds that fit the source's file; a retired kind stays available only to
  // the source that already has it.
  const editableKinds = [
    ...SELECTABLE_SOURCE_KINDS,
    ...(SELECTABLE_SOURCE_KINDS.includes(source.source.sourceKind as never)
      ? []
      : [source.source.sourceKind]),
  ].filter((k) => !source.source.mimeType || sourceKindAcceptsMimeType(k, source.source.mimeType));
  const [purpose, setPurpose] = useState(source.source.purpose);
  const [businessArea, setBusinessArea] = useState(source.source.businessArea ?? '');
  const [description, setDescription] = useState(source.source.description);
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await api.sources.edit(projectId, source.id, {
        title,
        sourceKind,
        purpose,
        businessArea: businessArea || undefined,
        description,
      });
      onSaved();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'No se pudo guardar la edición.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="flex flex-col gap-3 rounded-md border border-border bg-muted/30 p-3"
    >
      <p className="text-xs text-muted-foreground">
        Editar guarda una nueva versión (v{source.version.versionNumber + 1}); la actual no se
        modifica.
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5 text-sm">
          <Label htmlFor="edit-source-kind">Tipo de fuente</Label>
          <Select value={sourceKind} onValueChange={(v) => setSourceKind(v as ProjectSourceKind)}>
            <SelectTrigger id="edit-source-kind" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {editableKinds.map((k) => (
                <SelectItem key={k} value={k}>
                  {SOURCE_KIND_LABELS[k]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-1.5 text-sm">
          <Label htmlFor="edit-source-title">Título</Label>
          <Input
            id="edit-source-title"
            required
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
        </div>
      </div>
      <div className="flex flex-col gap-1.5 text-sm">
        <Label htmlFor="edit-source-purpose">¿Qué representa esta fuente?</Label>
        <Textarea
          id="edit-source-purpose"
          required
          rows={2}
          value={purpose}
          onChange={(e) => setPurpose(e.target.value)}
        />
      </div>
      <div className="flex flex-col gap-1.5 text-sm">
        <Label htmlFor="edit-source-business-area">Área / dominio de negocio (opcional)</Label>
        <Input
          id="edit-source-business-area"
          value={businessArea}
          onChange={(e) => setBusinessArea(e.target.value)}
        />
      </div>
      <div className="flex flex-col gap-1.5 text-sm">
        <Label htmlFor="edit-source-description">
          {source.source.originalFilename ? 'Contexto adicional (opcional)' : 'Contenido'}
        </Label>
        <Textarea
          id="edit-source-description"
          required={!source.source.originalFilename}
          rows={3}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </div>
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={saving}>
          {saving ? 'Guardando…' : 'Guardar nueva versión'}
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
          Cancelar
        </Button>
      </div>
    </form>
  );
}

function DeleteSourceDialog({
  projectId,
  source,
  onOpenChange,
  onDeleted,
}: {
  projectId: string;
  source: SourceResponse;
  onOpenChange: (open: boolean) => void;
  onDeleted: () => void;
}) {
  const [deleting, setDeleting] = useState(false);

  async function handleDelete() {
    setDeleting(true);
    try {
      await api.sources.delete(projectId, source.id);
      onDeleted();
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'No se pudo eliminar la fuente.');
    } finally {
      setDeleting(false);
    }
  }

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Eliminar fuente</DialogTitle>
          <DialogDescription>
            Esta acción es permanente y no se puede deshacer. Solo es posible mientras la fuente
            nunca haya sido aprobada.
          </DialogDescription>
        </DialogHeader>
        <p className="text-sm text-foreground">
          Va a eliminar{' '}
          <strong>
            {source.code} — {source.source.title}
          </strong>
          .
        </p>
        <DialogFooter>
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button type="button" variant="destructive" disabled={deleting} onClick={handleDelete}>
            {deleting ? 'Eliminando…' : 'Eliminar definitivamente'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ArchiveSourceDialog({
  projectId,
  source,
  onOpenChange,
  onArchived,
}: {
  projectId: string;
  source: SourceResponse;
  onOpenChange: (open: boolean) => void;
  onArchived: () => void;
}) {
  const [archiving, setArchiving] = useState(false);

  async function handleArchive() {
    setArchiving(true);
    try {
      await api.sources.archive(projectId, source.id);
      onArchived();
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'No se pudo archivar la fuente.');
    } finally {
      setArchiving(false);
    }
  }

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Archivar fuente</DialogTitle>
          <DialogDescription>
            Esta fuente tiene versiones aprobadas, así que no puede eliminarse. Archivarla la marca
            como inactiva sin borrar su historial.
          </DialogDescription>
        </DialogHeader>
        <p className="text-sm text-foreground">
          Va a archivar{' '}
          <strong>
            {source.code} — {source.source.title}
          </strong>
          .
        </p>
        <DialogFooter>
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button type="button" disabled={archiving} onClick={handleArchive}>
            {archiving ? 'Archivando…' : 'Archivar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function SourcesContent({ projectId }: { projectId: string }) {
  const queryClient = useQueryClient();
  const sources = useQuery({
    queryKey: ['sources', projectId],
    queryFn: () => api.sources.list(projectId),
    refetchInterval: (query) =>
      query.state.data?.items.some(
        (source) => source.processing && ['QUEUED', 'RUNNING'].includes(source.processing.status),
      )
        ? query.state.data?.items.some(
            (source) =>
              source.processing?.status === 'QUEUED' &&
              Date.now() - new Date(source.processing.updatedAt).getTime() > 5 * 60_000,
          )
          ? 15_000
          : 2500
        : false,
  });
  const staleness = useQuery({
    queryKey: ['staleness', projectId],
    queryFn: () => api.staleness.get(projectId),
  });

  return (
    <div className="flex flex-col gap-6">
      <PageHeading title="Fuentes del proyecto" projectId={projectId} />
      <AddSection
        isEmpty={sources.data ? sources.data.items.length === 0 : undefined}
        addLabel="Agregar fuente"
      >
        {(close) => (
          <CreateSourceForm
            projectId={projectId}
            onClose={close}
            onCreated={() => {
              queryClient.invalidateQueries({ queryKey: ['sources', projectId] });
              queryClient.invalidateQueries({ queryKey: ['readiness', projectId] });
              queryClient.invalidateQueries({ queryKey: ['staleness', projectId] });
            }}
          />
        )}
      </AddSection>
      <QueryState isLoading={sources.isLoading} error={sources.error}>
        {sources.data && sources.data.items.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No hay fuentes todavía. Agregue la primera arriba.
          </p>
        ) : (
          <ul className="flex flex-col gap-3">
            {sources.data?.items.map((s) => (
              <SourceCard key={s.id} source={s} projectId={projectId} staleness={staleness.data} />
            ))}
          </ul>
        )}
      </QueryState>
    </div>
  );
}

export default function SourcesPage() {
  return (
    <RequireActiveProject>
      {(projectId) => <SourcesContent projectId={projectId} />}
    </RequireActiveProject>
  );
}
