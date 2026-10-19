'use client';

import { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Badge, Button, Input, Textarea } from '@caseflow-ai/ui';
import {
  BookmarkCheck,
  Calendar,
  Check,
  ChevronDown,
  ChevronUp,
  Copy,
  Eye,
  FileCode,
  FileText,
  History,
  Layers,
  Loader2,
  Plus,
  Search,
  ShieldCheck,
  Sparkles,
  User,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import { api, ApiError, downloadFile } from '../../lib/api';
import { RequireActiveProject } from '../../components/query-state';
import { HtmlPreviewDialog } from '../../components/html-preview-dialog';
import { DismissibleHint } from '../../components/dismissible-hint';
import { AddSection } from '../../components/add-section';
import type { BaselineResponse } from '@caseflow-ai/contracts';

const SUGGESTED_LABELS = ['v1.0.0', 'v1.1.0', 'Hito-Requisitos', 'Sprint-1', 'Entrega-V1'];

function sanitizeFileName(str: string): string {
  return str.toLowerCase().replace(/[^a-z0-9_-]/g, '_') || 'baseline';
}

async function downloadJson(projectId: string, id: string, label: string): Promise<void> {
  try {
    const filename = `baseline-${sanitizeFileName(label)}.json`;
    await downloadFile(api.baselines.exportJsonUrl(projectId, id), filename);
    toast.success(`Línea base ${label} descargada en formato JSON.`);
  } catch (err) {
    toast.error(err instanceof ApiError ? err.message : 'No se pudo exportar la línea base.');
  }
}

async function downloadHtmlDirect(projectId: string, id: string, label: string): Promise<void> {
  try {
    const filename = `baseline-${sanitizeFileName(label)}.html`;
    await downloadFile(api.baselines.exportHtmlUrl(projectId, id), filename);
    toast.success(`Línea base ${label} descargada en formato HTML.`);
  } catch (err) {
    toast.error(
      err instanceof ApiError ? err.message : 'No se pudo exportar la línea base en HTML.',
    );
  }
}

function formatDate(isoDate: string): string {
  try {
    return new Date(isoDate).toLocaleString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return isoDate;
  }
}

function BaselinesContent({ projectId }: { projectId: string }) {
  const queryClient = useQueryClient();
  const baselines = useQuery({
    queryKey: ['baselines', projectId],
    queryFn: () => api.baselines.list(projectId),
  });

  const [searchQuery, setSearchQuery] = useState('');
  const [label, setLabel] = useState('');
  const [description, setDescription] = useState('');
  const [creating, setCreating] = useState(false);
  const [previewing, setPreviewing] = useState<BaselineResponse | null>(null);
  const [expandedBaselineIds, setExpandedBaselineIds] = useState<Record<string, boolean>>({});
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  const createMutation = useMutation({
    mutationFn: () =>
      api.baselines.create(projectId, {
        label: label.trim(),
        description: description.trim() || undefined,
      }),
    onSuccess: () => {
      toast.success('Línea base creada exitosamente.');
      setLabel('');
      setDescription('');
      queryClient.invalidateQueries({ queryKey: ['baselines', projectId] });
    },
    onError: () => toast.error('Error al crear línea base.'),
    onSettled: () => setCreating(false),
  });

  const handleCreate = (e: React.FormEvent, close: (() => void) | undefined) => {
    e.preventDefault();
    if (!label.trim()) return;
    setCreating(true);
    createMutation.mutate(undefined, { onSuccess: () => close?.() });
  };

  const toggleDetails = (id: string) => {
    setExpandedBaselineIds((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const copyToClipboard = (id: string) => {
    navigator.clipboard.writeText(id);
    setCopiedId(id);
    toast.success('Identificador copiado al portapapeles.');
    setTimeout(() => setCopiedId(null), 2000);
  };

  const totalBaselines = baselines.data?.length ?? 0;
  const latestBaseline = baselines.data?.[0];
  const latestEntriesCount = latestBaseline?.entries?.length ?? 0;

  const filteredBaselines = useMemo(() => {
    if (!baselines.data) return [];
    if (!searchQuery.trim()) return baselines.data;
    const q = searchQuery.toLowerCase();
    return baselines.data.filter(
      (b) =>
        b.label.toLowerCase().includes(q) ||
        (b.description && b.description.toLowerCase().includes(q)) ||
        (b.user?.displayName && b.user.displayName.toLowerCase().includes(q)),
    );
  }, [baselines.data, searchQuery]);

  return (
    <div className="flex flex-col gap-6">
      {/* Page Heading & Status */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="flex items-center gap-2 text-xl font-semibold text-foreground">
              <BookmarkCheck className="size-5 text-primary" />
              Líneas Base
            </h1>
            <DismissibleHint id="baselines-intro" label="¿Qué es una línea base?">
              Una captura fija y con nombre de todo lo aprobado hasta hoy — a diferencia de
              "Preparación / Exportar", que descarga el estado actual, una línea base queda guardada
              para siempre y puede volver a descargarla cuando quiera.
            </DismissibleHint>
          </div>
          <p className="text-sm text-muted-foreground mt-0.5">
            Registre y consulte instantáneas inmutables de los artefactos aprobados del proyecto
            para auditoría, congelación de hitos y control de cambios.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold border bg-emerald-50 text-emerald-700 border-emerald-300 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-700">
            <ShieldCheck className="size-3.5 text-emerald-600" />
            Inmutabilidad Garantizada
          </span>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Total Baselines */}
        <div className="rounded-xl border border-border bg-card p-4 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-xs font-medium uppercase tracking-wider">Total Líneas Base</span>
            <History className="size-4 text-primary" />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-foreground">{totalBaselines}</span>
            <span className="text-xs text-muted-foreground">versiones registradas</span>
          </div>
        </div>

        {/* Card 2: Latest Baseline */}
        <div className="rounded-xl border border-border bg-card p-4 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-xs font-medium uppercase tracking-wider">Última Captura</span>
            <BookmarkCheck className="size-4 text-emerald-600" />
          </div>
          <div className="mt-2">
            {latestBaseline ? (
              <div>
                <span className="text-base font-bold text-foreground font-mono">
                  {latestBaseline.label}
                </span>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {formatDate(latestBaseline.createdAt)}
                </p>
              </div>
            ) : (
              <span className="text-sm text-muted-foreground">Sin capturas previas</span>
            )}
          </div>
        </div>

        {/* Card 3: Frozen Artifacts in Latest */}
        <div className="rounded-xl border border-border bg-card p-4 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-xs font-medium uppercase tracking-wider">
              Artefactos Congelados
            </span>
            <Layers className="size-4 text-blue-600" />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-foreground">
              {latestBaseline ? latestEntriesCount : 0}
            </span>
            <span className="text-xs text-muted-foreground">en la captura más reciente</span>
          </div>
        </div>

        {/* Card 4: Audit Status */}
        <div className="rounded-xl border border-border bg-card p-4 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-xs font-medium uppercase tracking-wider">
              Control de Versiones
            </span>
            <ShieldCheck className="size-4 text-emerald-600" />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-sm font-semibold text-emerald-700 dark:text-emerald-400">
              Versiones Aprobadas
            </span>
            <span className="text-xs text-muted-foreground">Historial protegido</span>
          </div>
        </div>
      </div>

      {/* Creation Section */}
      <AddSection
        isEmpty={baselines.data ? baselines.data.length === 0 : undefined}
        addLabel="Crear línea base"
      >
        {(close) => (
          <div className="rounded-xl border border-primary/20 bg-card p-5 shadow-sm flex flex-col gap-4">
            <div className="flex items-center gap-2">
              <Sparkles className="size-5 text-primary" />
              <h2 className="text-lg font-semibold text-foreground">Crear nueva línea base</h2>
            </div>

            <div className="rounded-lg bg-muted/40 p-3.5 border border-border/60 text-xs text-muted-foreground leading-relaxed">
              <strong className="text-foreground font-medium">Nota sobre el congelamiento:</strong>{' '}
              Al crear una línea base, se capturan y aseguran las versiones{' '}
              <strong>APROBADAS</strong> más recientes de cada artefacto del proyecto (Requisitos,
              Casos de Uso, Modelos, Arquitectura, Planos de Interfaz y Bocetos). Esta instantánea
              permanece inalterable para futuras auditorías o descargas.
            </div>

            <form onSubmit={(e) => handleCreate(e, close)} className="flex flex-col gap-4 max-w-xl">
              <div>
                <label className="text-xs font-medium text-foreground mb-1 block">
                  Etiqueta de la línea base <span className="text-red-500">*</span>
                </label>
                <Input
                  placeholder="Ej: v1.0.0 o Hito-Arquitectura"
                  value={label}
                  onChange={(e) => setLabel(e.target.value)}
                  required
                />
                {/* Suggestions chips */}
                <div className="flex flex-wrap items-center gap-1.5 mt-2">
                  <span className="text-xs text-muted-foreground mr-1">Sugerencias:</span>
                  {SUGGESTED_LABELS.map((suggested) => (
                    <button
                      key={suggested}
                      type="button"
                      onClick={() => setLabel(suggested)}
                      className="px-2 py-0.5 rounded text-xs bg-muted hover:bg-muted/80 text-foreground border border-border transition-colors font-mono"
                    >
                      {suggested}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="text-xs font-medium text-foreground mb-1 block">
                  Descripción u observaciones (opcional)
                </label>
                <Textarea
                  placeholder="Describa el motivo del congelamiento (ej: Cierre de sprint 1 con aprobación de cliente)..."
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={3}
                />
              </div>

              <div className="flex items-center gap-2 pt-1">
                <Button type="submit" disabled={creating || !label.trim()}>
                  {creating ? (
                    <Loader2 className="size-4 animate-spin mr-2" />
                  ) : (
                    <Plus className="size-4 mr-2" />
                  )}
                  Crear Línea Base
                </Button>
                {close ? (
                  <Button type="button" variant="ghost" disabled={creating} onClick={close}>
                    Cancelar
                  </Button>
                ) : null}
              </div>
            </form>
          </div>
        )}
      </AddSection>

      {/* Existing Baselines Section */}
      <div className="flex flex-col gap-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-semibold text-foreground">Líneas base existentes</h2>
            {baselines.data && baselines.data.length > 0 && (
              <Badge variant="secondary" className="text-xs">
                {baselines.data.length}
              </Badge>
            )}
          </div>

          {/* Search Bar */}
          {baselines.data && baselines.data.length > 0 && (
            <div className="relative w-full sm:w-72">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
              <Input
                placeholder="Buscar por etiqueta o descripción..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 pr-8 h-9 text-xs"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  aria-label="Limpiar búsqueda"
                >
                  <X className="size-3.5" />
                </button>
              )}
            </div>
          )}
        </div>

        {/* Loading state */}
        {baselines.isLoading ? (
          <div className="flex items-center justify-center p-12 border rounded-xl bg-card">
            <Loader2 className="size-6 animate-spin text-primary mr-2" />
            <span className="text-sm text-muted-foreground">Cargando líneas base...</span>
          </div>
        ) : totalBaselines === 0 ? (
          /* Empty state when 0 baselines */
          <div className="flex flex-col items-center justify-center p-12 border border-dashed rounded-xl bg-card text-center">
            <div className="p-3 bg-primary/10 rounded-full mb-3 text-primary">
              <BookmarkCheck className="size-8" />
            </div>
            <h3 className="text-base font-semibold text-foreground">
              No hay líneas base creadas aún
            </h3>
            <p className="text-sm text-muted-foreground max-w-md mt-1 mb-4">
              Las líneas base guardan instantáneas inmutables de todo lo aprobado en el proyecto.
              Cree una para congelar un hito de entrega o fase de planificación.
            </p>
          </div>
        ) : filteredBaselines.length === 0 ? (
          /* Empty state when search yields no matches */
          <div className="flex flex-col items-center justify-center p-8 border border-dashed rounded-xl bg-card text-center">
            <p className="text-sm text-muted-foreground">
              No se encontraron líneas base que coincidan con "<strong>{searchQuery}</strong>".
            </p>
            <Button
              variant="outline"
              size="sm"
              className="mt-3 text-xs"
              onClick={() => setSearchQuery('')}
            >
              Limpiar búsqueda
            </Button>
          </div>
        ) : (
          /* List of Baselines */
          <div className="flex flex-col gap-3">
            {searchQuery && (
              <p className="text-xs text-muted-foreground">
                Mostrando {filteredBaselines.length} de {totalBaselines} líneas base
              </p>
            )}

            {filteredBaselines.map((baseline: BaselineResponse) => {
              const entryCount = baseline.entries?.length ?? 0;
              const isExpanded = !!expandedBaselineIds[baseline.id];
              const isDownloading = downloadingId === baseline.id;

              return (
                <div
                  key={baseline.id}
                  className="rounded-xl border border-border bg-card p-5 shadow-sm hover:border-primary/40 transition-colors flex flex-col gap-3"
                >
                  {/* Top Bar: Label Tag, Count Badge & Export Buttons */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-md text-sm font-semibold bg-primary/10 text-primary border border-primary/20 font-mono">
                        <BookmarkCheck className="size-4" />
                        {baseline.label}
                      </span>
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-secondary text-secondary-foreground border border-border">
                        <Layers className="size-3 text-muted-foreground" />
                        {entryCount} artefacto{entryCount === 1 ? '' : 's'} congelado
                        {entryCount === 1 ? '' : 's'}
                      </span>
                    </div>

                    {/* Action Buttons */}
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setPreviewing(baseline)}
                        className="text-xs h-8"
                      >
                        <Eye className="size-3.5 mr-1.5" />
                        Vista Previa HTML
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={isDownloading}
                        onClick={async () => {
                          setDownloadingId(baseline.id);
                          await downloadHtmlDirect(projectId, baseline.id, baseline.label);
                          setDownloadingId(null);
                        }}
                        className="text-xs h-8"
                      >
                        <FileText className="size-3.5 mr-1.5" />
                        Descargar HTML
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={isDownloading}
                        onClick={async () => {
                          setDownloadingId(baseline.id);
                          await downloadJson(projectId, baseline.id, baseline.label);
                          setDownloadingId(null);
                        }}
                        className="text-xs h-8"
                      >
                        <FileCode className="size-3.5 mr-1.5" />
                        JSON
                      </Button>
                    </div>
                  </div>

                  {/* Description if present */}
                  {baseline.description && (
                    <p className="text-sm text-foreground/90 bg-muted/30 p-2.5 rounded-md border border-border/40">
                      {baseline.description}
                    </p>
                  )}

                  {/* Metadata and Details Trigger */}
                  <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-border/50 text-xs text-muted-foreground">
                    <div className="flex flex-wrap items-center gap-4">
                      <span className="flex items-center gap-1">
                        <User className="size-3.5" />
                        {baseline.user?.displayName ||
                          baseline.user?.email ||
                          baseline.createdByUserId}
                      </span>
                      <span className="flex items-center gap-1">
                        <Calendar className="size-3.5" />
                        {formatDate(baseline.createdAt)}
                      </span>
                    </div>

                    <button
                      type="button"
                      onClick={() => toggleDetails(baseline.id)}
                      className="inline-flex items-center gap-1 text-xs text-primary hover:underline font-medium"
                    >
                      {isExpanded ? (
                        <>
                          Ocultar detalles <ChevronUp className="size-3.5" />
                        </>
                      ) : (
                        <>
                          Ver detalles <ChevronDown className="size-3.5" />
                        </>
                      )}
                    </button>
                  </div>

                  {/* Expandable details container */}
                  {isExpanded && (
                    <div className="rounded-lg bg-muted/40 p-3 border border-border/60 text-xs flex flex-col gap-2 animate-in fade-in-50 duration-150">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-muted-foreground">ID de la línea base:</span>
                        <div className="flex items-center gap-1.5 font-mono text-[11px] bg-background px-2 py-0.5 rounded border border-border">
                          <span>{baseline.id}</span>
                          <button
                            type="button"
                            onClick={() => copyToClipboard(baseline.id)}
                            className="text-muted-foreground hover:text-foreground"
                            title="Copiar ID"
                          >
                            {copiedId === baseline.id ? (
                              <Check className="size-3 text-emerald-600" />
                            ) : (
                              <Copy className="size-3" />
                            )}
                          </button>
                        </div>
                      </div>
                      <div className="flex items-center justify-between text-muted-foreground">
                        <span>Total de artefactos aprobados congelados:</span>
                        <span className="font-semibold text-foreground">{entryCount}</span>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* HTML Preview Dialog */}
      {previewing ? (
        <HtmlPreviewDialog
          open
          onOpenChange={(open) => !open && setPreviewing(null)}
          url={api.baselines.exportHtmlUrl(projectId, previewing.id)}
          filename={`baseline-${sanitizeFileName(previewing.label)}.html`}
          title={`Línea base ${previewing.label}`}
        />
      ) : null}
    </div>
  );
}

export default function BaselinesPage() {
  return (
    <RequireActiveProject>
      {(projectId) => <BaselinesContent projectId={projectId} />}
    </RequireActiveProject>
  );
}
