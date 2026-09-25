'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Upload } from 'lucide-react';
import { useRef, useState } from 'react';
import type { ProjectSourceKind, SourceResponse } from '@caseflow-ai/contracts';
import {
  Button,
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
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!file) {
      setError('Seleccione un archivo.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await api.sources.create(
        projectId,
        {
          title,
          sourceKind,
          purpose,
          businessArea: businessArea || undefined,
          description: description || undefined,
        },
        file,
      );
      setTitle('');
      setPurpose('');
      setBusinessArea('');
      setDescription('');
      setFile(null);
      onCreated();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo crear la fuente.');
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
          <Select
            value={sourceKind}
            onValueChange={(v) => setSourceKind(v as ProjectSourceKind)}
          >
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
          <Label htmlFor="source-file">Archivo</Label>
          <input
            ref={fileInputRef}
            id="source-file"
            required
            type="file"
            className="sr-only"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          />
          <Button
            type="button"
            variant="outline"
            className="justify-start font-normal"
            onClick={() => fileInputRef.current?.click()}
          >
            <Upload className="size-4" aria-hidden="true" />
            {file ? file.name : 'Seleccionar archivo…'}
          </Button>
        </div>
      </div>
      <div className="flex flex-col gap-1.5 text-sm">
        <Label htmlFor="source-description">Descripción (opcional)</Label>
        <Textarea
          id="source-description"
          rows={2}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </div>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
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
  const [actionError, setActionError] = useState<string | null>(null);

  const report = useQuery({
    queryKey: ['source-report', projectId, source.id],
    queryFn: () => api.sources.getReport(projectId, source.id),
    enabled: open && source.source.hasReport,
    retry: false,
  });

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: ['sources', projectId] });
  }

  async function transition(status: 'IN_REVIEW' | 'APPROVED' | 'CHANGES_REQUESTED') {
    setActionError(null);
    try {
      await api.sources.transition(projectId, source.id, source.version.id, status);
      invalidate();
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : 'No se pudo cambiar el estado.');
    }
  }

  async function submitTranscript() {
    setActionError(null);
    try {
      await api.sources.submitManualTranscript(projectId, source.id, transcript);
      setTranscript('');
      invalidate();
    } catch (err) {
      setActionError(
        err instanceof ApiError ? err.message : 'No se pudo guardar la transcripción.',
      );
    }
  }

  async function generateReport() {
    setActionError(null);
    try {
      await api.sources.generateReport(projectId, source.id);
      invalidate();
    } catch (err) {
      setActionError(
        err instanceof ApiError
          ? err.message
          : 'No se pudo generar el reporte (¿IA deshabilitada?).',
      );
    }
  }

  async function submitManualReport() {
    setActionError(null);
    try {
      await api.sources.submitManualReport(projectId, source.id, manualSummary);
      setManualSummary('');
      invalidate();
    } catch (err) {
      setActionError(
        err instanceof ApiError ? err.message : 'No se pudo guardar el reporte manual.',
      );
    }
  }

  const needsExtraction =
    source.source.extractionState === 'MANUAL' ||
    source.source.extractionState === 'UNSUPPORTED' ||
    source.source.extractionState === 'FAILED' ||
    source.source.extractionState === 'PENDING';
  const canSubmitTranscript = needsExtraction && !source.source.hasExtractedText;

  return (
    <li className="rounded-lg border border-border bg-card p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <span className="font-mono text-xs text-muted-foreground">{source.code}</span>{' '}
          <span className="font-medium text-foreground">{source.source.title}</span>
        </div>
        <div className="flex items-center gap-2">
          <StatusBadge status={source.version.status} />
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="text-sm text-muted-foreground underline"
          >
            {open ? 'Ocultar detalle' : 'Ver detalle'}
          </button>
        </div>
      </div>
      <p className="mt-1 text-sm text-muted-foreground">
        {source.source.sourceKind} · {EXTRACTION_LABEL[source.source.extractionState]}
      </p>

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
              {source.source.originalFilename} ({source.source.mimeType},{' '}
              {Math.ceil(source.source.sizeBytes / 1024)} KB)
            </dd>
            <dt className="font-medium">Versión</dt>
            <dd>v{source.version.versionNumber}</dd>
          </dl>

          {canSubmitTranscript ? (
            <div className="rounded-md border border-amber-200 bg-amber-50 p-3">
              <p className="mb-2 text-amber-800">
                Este tipo de archivo no tiene extracción automática de texto. Ingrese una
                transcripción manual para que el conocimiento sea utilizable.
              </p>
              <textarea
                className="w-full rounded-md border border-input px-2 py-1"
                rows={3}
                value={transcript}
                onChange={(e) => setTranscript(e.target.value)}
                placeholder="Transcripción manual…"
              />
              <button
                type="button"
                onClick={submitTranscript}
                className="mt-2 rounded-md bg-primary px-3 py-1 text-sm text-white"
              >
                Guardar transcripción
              </button>
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
                <button
                  type="button"
                  onClick={generateReport}
                  className="self-start rounded-md border border-input px-3 py-1 text-sm hover:bg-muted/40"
                >
                  Generar reporte con IA
                </button>
                <textarea
                  className="w-full rounded-md border border-input px-2 py-1"
                  rows={2}
                  placeholder="O escriba un resumen manual del contenido…"
                  value={manualSummary}
                  onChange={(e) => setManualSummary(e.target.value)}
                />
                <button
                  type="button"
                  onClick={submitManualReport}
                  disabled={!manualSummary.trim()}
                  className="self-start rounded-md bg-primary px-3 py-1 text-sm text-white disabled:opacity-50"
                >
                  Guardar reporte manual
                </button>
              </div>
            ) : (
              <p className="text-muted-foreground">Guarde primero la transcripción manual.</p>
            )}
          </div>

          <div className="flex flex-wrap gap-2 border-t border-border pt-2">
            {source.version.status === 'DRAFT' || source.version.status === 'GENERATED' ? (
              <button
                type="button"
                onClick={() => transition('IN_REVIEW')}
                disabled={!source.source.hasExtractedText}
                title={
                  !source.source.hasExtractedText
                    ? 'Se requiere conocimiento utilizable (texto extraído o transcripción manual).'
                    : undefined
                }
                className="rounded-md border border-input px-3 py-1 text-sm hover:bg-muted/40 disabled:opacity-50"
              >
                Enviar a revisión
              </button>
            ) : null}
            {source.version.status === 'IN_REVIEW' ? (
              <>
                <button
                  type="button"
                  onClick={() => transition('APPROVED')}
                  className="rounded-md bg-emerald-600 px-3 py-1 text-sm text-white hover:bg-emerald-700"
                >
                  Aprobar
                </button>
                <button
                  type="button"
                  onClick={() => transition('CHANGES_REQUESTED')}
                  className="rounded-md border border-destructive/40 px-3 py-1 text-sm text-destructive hover:bg-destructive/5"
                >
                  Solicitar cambios
                </button>
              </>
            ) : null}
          </div>
          {actionError ? <p className="text-sm text-destructive">{actionError}</p> : null}
        </div>
      ) : null}
    </li>
  );
}

function SourcesContent({ projectId }: { projectId: string }) {
  const queryClient = useQueryClient();
  const sources = useQuery({
    queryKey: ['sources', projectId],
    queryFn: () => api.sources.list(projectId),
  });

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-xl font-semibold text-foreground">Fuentes del proyecto</h1>
      <CreateSourceForm
        projectId={projectId}
        onCreated={() => queryClient.invalidateQueries({ queryKey: ['sources', projectId] })}
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
