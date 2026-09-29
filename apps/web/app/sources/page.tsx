'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Archive, Pencil, Trash2, Upload, X } from 'lucide-react';
import { useRef, useState } from 'react';
import { toast } from 'sonner';
import type {
  ProjectSourceKind,
  SourceReportCandidate,
  SourceResponse,
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
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Textarea,
} from '@caseflow-ai/ui';
import { api, ApiError } from '../../lib/api';
import { QueryState, RequireActiveProject } from '../../components/query-state';
import { PageHeading } from '../../components/page-heading';
import { StatusBadge } from '../../components/status-badge';

const SOURCE_KIND_LABELS: Record<ProjectSourceKind, string> = {
  PDF: 'Documento PDF',
  AUDIO: 'Audio',
  IMAGE: 'Imagen',
  FORM: 'Formulario',
  INVOICE: 'Factura',
  TEXT: 'Texto',
  NOTES: 'Notas',
  OTHER: 'Otro',
};

const SOURCE_KINDS = Object.keys(SOURCE_KIND_LABELS) as ProjectSourceKind[];

// Narrows the file picker to plausible extensions for the selected kind.
// Advisory only (the backend is the real authority on what it accepts) —
// TEXT/NOTES/FORM/OTHER stay open-ended since their real-world formats vary.
const SOURCE_KIND_ACCEPT: Partial<Record<ProjectSourceKind, string>> = {
  PDF: 'application/pdf,.pdf',
  AUDIO: 'audio/*',
  IMAGE: 'image/*',
  INVOICE: 'application/pdf,.pdf,image/*',
  TEXT: '.txt,.md,.docx,text/plain,text/markdown,application/vnd.openxmlformats-officedocument.wordprocessingml.document',
};

const EXTRACTION_LABEL: Record<string, string> = {
  EXTRACTED: 'Extracción automática',
  MANUAL: 'Transcripción manual',
  PENDING: 'Pendiente de extracción',
  UNSUPPORTED: 'No extraído (tipo no soportado automáticamente)',
  FAILED: 'La extracción automática falló',
};

function CreateSourceForm({ projectId, onCreated }: { projectId: string; onCreated: () => void }) {
  const [title, setTitle] = useState('');
  const [sourceKind, setSourceKind] = useState<ProjectSourceKind>('NOTES');
  const [purpose, setPurpose] = useState('');
  const [businessArea, setBusinessArea] = useState('');
  const [description, setDescription] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);

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
      setFile(null);
      onCreated();
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

  const fileInputRef = useRef<HTMLInputElement>(null);

  return (
    <form
      onSubmit={handleSubmit}
      className="flex flex-col gap-3 rounded-lg border border-border bg-card p-4"
    >
      <h2 className="text-sm font-semibold text-foreground">Agregar fuente de conocimiento</h2>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5 text-sm">
          <Label htmlFor="source-kind">Tipo de fuente</Label>
          <Select value={sourceKind} onValueChange={(v) => setSourceKind(v as ProjectSourceKind)}>
            <SelectTrigger id="source-kind" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SOURCE_KINDS.map((k) => (
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
            accept={SOURCE_KIND_ACCEPT[sourceKind]}
            className="sr-only"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
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
                onClick={() => {
                  setFile(null);
                  if (fileInputRef.current) fileInputRef.current.value = '';
                }}
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
      {sourceKind === 'AUDIO' && file ? (
        <p className="text-xs text-muted-foreground">
          Si hay un servicio de transcripción configurado, el audio se enviará a ese servicio. Puede
          registrar la fuente y transcribirla manualmente si el servicio no está disponible.
        </p>
      ) : null}
      <Button type="submit" disabled={submitting} className="self-start">
        {submitting ? 'Guardando…' : 'Agregar fuente'}
      </Button>
    </form>
  );
}

function SourceCard({ source, projectId }: { source: SourceResponse; projectId: string }) {
  const [open, setOpen] = useState(false);
  const queryClient = useQueryClient();
  const [transcript, setTranscript] = useState('');
  const [manualSummary, setManualSummary] = useState('');
  const [generatingReport, setGeneratingReport] = useState(false);
  const [reportCandidate, setReportCandidate] = useState<SourceReportCandidate | null>(null);
  const [acceptingReport, setAcceptingReport] = useState(false);
  const [approving, setApproving] = useState(false);
  const [editing, setEditing] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

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

  async function submitTranscript() {
    try {
      await api.sources.submitManualTranscript(projectId, source.id, transcript);
      setTranscript('');
      invalidate();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'No se pudo guardar la transcripción.');
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
  const processingLabel =
    processing?.status === 'QUEUED'
      ? longWait
        ? 'En cola desde hace varios minutos; puede transcribir manualmente o volver después'
        : 'En cola'
      : processing?.status === 'RUNNING'
        ? staleProcessing
          ? 'El procesamiento tardó demasiado; puede reintentarlo o transcribirlo manualmente'
          : processing.processor === 'OCR'
            ? 'Aplicando OCR'
            : processing.processor === 'TRANSCRIPTION'
              ? 'Transcribiendo audio'
              : 'Extrayendo texto'
        : processing?.status === 'FAILED'
          ? 'Procesamiento fallido'
          : processing?.status === 'UNSUPPORTED'
            ? 'Procesador no disponible'
            : EXTRACTION_LABEL[source.source.extractionState];

  return (
    <li className="rounded-lg border border-border bg-card p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <span className="font-mono text-xs text-muted-foreground">{source.code}</span>{' '}
          <span className="font-medium text-foreground">{source.source.title}</span>
        </div>
        <div className="flex items-center gap-2">
          {source.archivedAt ? <Badge variant="secondary">Archivada</Badge> : null}
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
      <p className="mt-1 text-sm text-muted-foreground">
        {source.source.sourceKind} · {processingLabel}
      </p>
      {processing && (['FAILED', 'UNSUPPORTED'].includes(processing.status) || staleProcessing) ? (
        <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-amber-700">
          <span>{processing.errorMessage}</span>
          <Button type="button" variant="outline" size="sm" onClick={retryProcessing}>
            Reintentar
          </Button>
        </div>
      ) : null}

      {open ? (
        <div className="mt-3 flex flex-col gap-3 border-t border-border pt-3 text-sm">
          <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-muted-foreground">
            <dt className="font-medium">Propósito</dt>
            <dd>{source.source.purpose}</dd>
            {source.source.businessArea ? (
              <>
                <dt className="font-medium">Área de negocio</dt>
                <dd>{source.source.businessArea}</dd>
              </>
            ) : null}
            <dt className="font-medium">Archivo original</dt>
            <dd>
              {source.source.originalFilename && source.source.sizeBytes != null
                ? `${source.source.originalFilename} (${source.source.mimeType}, ${Math.ceil(source.source.sizeBytes / 1024)} KB)`
                : 'Sin archivo — solo contenido escrito'}
            </dd>
            <dt className="font-medium">Contenido</dt>
            <dd>{source.source.description}</dd>
            <dt className="font-medium">Versión</dt>
            <dd>v{source.version.versionNumber}</dd>
          </dl>

          {source.source.hasExtractedText ? (
            <div className="rounded-md border border-border p-3">
              <p className="mb-2 font-medium">Texto extraído para revisión</p>
              {extractedText.isLoading ? <p>Cargando texto…</p> : null}
              {extractedText.isError ? <p>No se pudo cargar el texto.</p> : null}
              {extractedText.data ? (
                <pre className="max-h-64 overflow-auto whitespace-pre-wrap text-xs">
                  {extractedText.data.text}
                </pre>
              ) : null}
            </div>
          ) : null}

          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" size="sm" onClick={() => setEditing(true)}>
              <Pencil className="size-3.5" aria-hidden="true" />
              Editar
            </Button>
            {source.hasApprovedHistory ? (
              source.archivedAt ? null : (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setConfirmingDelete(true)}
                >
                  <Archive className="size-3.5" aria-hidden="true" />
                  Archivar
                </Button>
              )
            ) : (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="border-destructive/40 text-destructive hover:bg-destructive/5"
                onClick={() => setConfirmingDelete(true)}
              >
                <Trash2 className="size-3.5" aria-hidden="true" />
                Eliminar
              </Button>
            )}
          </div>

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
                }}
              />
            )
          ) : null}

          {canSubmitTranscript ? (
            <div className="rounded-md border border-amber-200 bg-amber-50 p-3">
              <p className="mb-2 text-amber-800">
                {source.source.hasExtractedText
                  ? 'Revise el texto extraído. Si tiene errores, guarde una versión corregida.'
                  : 'Puede escribir una transcripción o corrección manual mientras se procesa el archivo.'}
              </p>
              {extractedText.data ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setTranscript(extractedText.data!.text)}
                  className="mb-2"
                >
                  Copiar texto extraído para corregir
                </Button>
              ) : null}
              <textarea
                className="w-full rounded-md border border-input px-2 py-1"
                rows={3}
                value={transcript}
                onChange={(e) => setTranscript(e.target.value)}
                placeholder="Transcripción manual…"
              />
              <Button
                variant="default"
                size="sm"
                type="button"
                onClick={submitTranscript}
                disabled={!transcript.trim()}
                className="mt-2"
              >
                Guardar transcripción
              </Button>
            </div>
          ) : null}

          <div>
            <h3 className="mb-1 font-medium text-foreground">Reporte de la fuente</h3>
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
              {SOURCE_KINDS.map((k) => (
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

  return (
    <div className="flex flex-col gap-6">
      <PageHeading title="Fuentes del proyecto" projectId={projectId} />
      <CreateSourceForm
        projectId={projectId}
        onCreated={() => {
          queryClient.invalidateQueries({ queryKey: ['sources', projectId] });
          queryClient.invalidateQueries({ queryKey: ['readiness', projectId] });
        }}
      />
      <QueryState isLoading={sources.isLoading} error={sources.error}>
        {sources.data && sources.data.items.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No hay fuentes todavía. Agregue la primera arriba.
          </p>
        ) : (
          <ul className="flex flex-col gap-3">
            {sources.data?.items.map((s) => (
              <SourceCard key={s.id} source={s} projectId={projectId} />
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
