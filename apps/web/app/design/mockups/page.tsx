'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { MockupDeviceType, MockupJobResponse, MockupResponse } from '@caseflow-ai/contracts';
import { useEffect, useRef, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import {
  Check,
  ChevronLeft,
  ChevronRight,
  Download,
  Loader2,
  Maximize2,
  Minimize2,
  X,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  Button,
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@caseflow-ai/ui';
import { api, ApiError, type ArtifactVersionStatus } from '../../../lib/api';
import { QueryState, RequireActiveProject } from '../../../components/query-state';
import { PageHeading } from '../../../components/page-heading';
import { StatusBadge } from '../../../components/status-badge';
import { TrustedDiagram } from '../../../components/trusted-svg';
import { AuthedDownloadButton, AuthedImage } from '../../../components/authed-media';
import { GenerationOverlay } from '../../../components/generation-overlay';
import {
  ApproveAllButton,
  ArchiveButton,
  EmptyState,
  approveDirectly,
  isPendingApproval,
} from '../../../components/artifact-actions';

const MOCKUP_POLL_TIMEOUT_MS = 6 * 60_000;
const MOCKUP_POLL_INTERVAL_MS = 2_000;
type MockupUiStatus = 'SUBMITTING' | MockupJobResponse['status'];

type MockupPollResult =
  { timedOut: false; job: MockupJobResponse } | { timedOut: true; status: 'QUEUED' | 'RUNNING' };

export async function pollMockupJob(
  getJob: () => Promise<MockupJobResponse>,
  now: () => number = Date.now,
  delay: (milliseconds: number) => Promise<void> = (milliseconds) =>
    new Promise((resolve) => setTimeout(resolve, milliseconds)),
  onStatus?: (status: MockupJobResponse['status']) => void,
): Promise<MockupPollResult> {
  const deadline = now() + MOCKUP_POLL_TIMEOUT_MS;
  for (;;) {
    const job = await getJob();
    onStatus?.(job.status);
    if (job.status === 'COMPLETED' || job.status === 'FAILED') return { timedOut: false, job };
    if (now() >= deadline) return { timedOut: true, status: job.status };
    await delay(MOCKUP_POLL_INTERVAL_MS);
  }
}

function MockupPreview({ mockupId, projectId }: { mockupId: string; projectId: string }) {
  const [selectedScreenIndex, setSelectedScreenIndex] = useState<number | null>(null);
  const preview = useQuery({
    queryKey: ['mockup-preview', projectId, mockupId],
    queryFn: () => api.mockups.getPreview(projectId, mockupId),
  });
  const screens = preview.data?.screens ?? [];
  const downloadAllUrl = api.mockups.downloadAllUrl(projectId, mockupId);

  useEffect(() => {
    if (selectedScreenIndex === null || screens.length < 2) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'ArrowRight') {
        event.preventDefault();
        setSelectedScreenIndex((index) => (index === null ? null : (index + 1) % screens.length));
      } else if (event.key === 'ArrowLeft') {
        event.preventDefault();
        setSelectedScreenIndex((index) =>
          index === null ? null : (index - 1 + screens.length) % screens.length,
        );
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [screens.length, selectedScreenIndex]);

  if (preview.isLoading)
    return <p className="text-sm text-muted-foreground">Cargando vista previa…</p>;
  if (!preview.data) return null;
  if (preview.data.generatorKind === 'INTERNAL_WIREFRAME') {
    return (
      <div className="flex flex-col gap-3">
        <div
          role="button"
          tabIndex={0}
          aria-label="Ampliar boceto de la interfaz"
          onClick={() => setSelectedScreenIndex(0)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault();
              setSelectedScreenIndex(0);
            }
          }}
          className="overflow-hidden rounded-lg border border-border bg-muted/30 p-3 text-left hover:border-primary/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <div className="max-h-72 overflow-hidden [&_figure]:m-0 [&_svg]:mx-auto [&_svg]:max-h-72 [&_svg]:w-auto [&_svg]:max-w-full">
            <TrustedDiagram svg={preview.data.svg!} caption="Vista general del boceto" />
          </div>
        </div>
        <MockupScreenDialog
          open={selectedScreenIndex === 0}
          onOpenChange={(open) => setSelectedScreenIndex(open ? 0 : null)}
          title="Vista general del boceto"
          index={0}
          count={1}
          onPrevious={() => undefined}
          onNext={() => undefined}
        >
          <div className="max-h-[78vh] overflow-auto [&_figure]:m-0 [&_svg]:mx-auto [&_svg]:h-auto [&_svg]:max-h-[76vh] [&_svg]:max-w-full">
            <TrustedDiagram svg={preview.data.svg!} />
          </div>
        </MockupScreenDialog>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-3">
      {screens.length > 0 ? (
        <div className="flex justify-end">
          <AuthedDownloadButton
            url={downloadAllUrl}
            filename="bocetos.zip"
            className="inline-flex items-center gap-2 rounded-md border border-border bg-background px-3 py-2 text-sm font-medium hover:bg-muted"
          >
            <Download aria-hidden="true" className="size-4" />
            Descargar todas (ZIP)
          </AuthedDownloadButton>
        </div>
      ) : null}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {screens.map((screen, index) => (
          <figure
            key={screen.id}
            className="min-w-0 overflow-hidden rounded-lg border border-border bg-card"
          >
            <button
              type="button"
              aria-label={`Ampliar pantalla ${screen.screenName}`}
              onClick={() => setSelectedScreenIndex(index)}
              className="group flex aspect-[16/10] w-full items-center justify-center overflow-hidden bg-muted/40 p-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
            >
              <AuthedImage
                url={api.mockups.screenImageUrl(projectId, mockupId, screen.id)}
                alt={screen.screenName}
                className="max-h-full max-w-full object-contain transition-transform group-hover:scale-[1.02]"
              />
            </button>
            <figcaption className="flex items-center justify-between gap-2 border-t border-border px-3 py-2 text-sm">
              <span className="truncate font-medium">{screen.screenName}</span>
              <span className="flex shrink-0 items-center gap-3">
                <AuthedDownloadButton
                  url={api.mockups.screenImageUrl(projectId, mockupId, screen.id)}
                  filename={`${screen.screenName}.png`}
                  className="inline-flex items-center gap-1 text-xs text-primary underline underline-offset-2"
                >
                  Descargar PNG
                </AuthedDownloadButton>
                <AuthedDownloadButton
                  url={api.mockups.screenHtmlUrl(projectId, mockupId, screen.id)}
                  filename={`${screen.screenName}.html`}
                  className="inline-flex items-center gap-1 text-xs text-primary underline underline-offset-2"
                >
                  Descargar HTML
                </AuthedDownloadButton>
              </span>
            </figcaption>
          </figure>
        ))}
        {selectedScreenIndex !== null && screens[selectedScreenIndex] ? (
          <MockupScreenDialog
            open
            onOpenChange={(open) => setSelectedScreenIndex(open ? selectedScreenIndex : null)}
            title={screens[selectedScreenIndex]!.screenName}
            index={selectedScreenIndex}
            count={screens.length}
            onPrevious={() =>
              setSelectedScreenIndex((index) =>
                index === null ? null : (index - 1 + screens.length) % screens.length,
              )
            }
            onNext={() =>
              setSelectedScreenIndex((index) =>
                index === null ? null : (index + 1) % screens.length,
              )
            }
          >
            <AuthedImage
              url={api.mockups.screenImageUrl(
                projectId,
                mockupId,
                screens[selectedScreenIndex]!.id,
              )}
              alt={screens[selectedScreenIndex]!.screenName}
              className="max-h-[var(--mockup-image-max-height)] max-w-full object-contain"
            />
          </MockupScreenDialog>
        ) : null}
      </div>
    </div>
  );
}

function MockupScreenDialog({
  open,
  onOpenChange,
  title,
  index,
  count,
  onPrevious,
  onNext,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  index: number;
  count: number;
  onPrevious: () => void;
  onNext: () => void;
  children: ReactNode;
}) {
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [isFullscreen, setIsFullscreen] = useState(false);
  const dragStart = useRef<{ x: number; y: number; offsetX: number; offsetY: number } | null>(null);

  useEffect(() => {
    setZoom(1);
    setOffset({ x: 0, y: 0 });
    setIsFullscreen(false);
  }, [title, open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        className={`grid max-h-[92vh] w-[96vw] max-w-[96vw] grid-rows-[auto_minmax(0,1fr)_auto] gap-3 overflow-hidden p-4 sm:max-w-[96vw] md:p-6 ${isFullscreen ? '!fixed !inset-0 !left-0 !top-0 !h-dvh !w-screen !max-h-none !max-w-none !translate-x-0 !translate-y-0 !rounded-none' : ''}`}
      >
        <DialogHeader className="pr-8">
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            {count > 1
              ? `Pantalla ${index + 1} de ${count}. Use las flechas del teclado o los controles para recorrer el boceto.`
              : 'Vista general del boceto generado.'}
          </DialogDescription>
        </DialogHeader>
        <DialogClose asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label="Cerrar vista ampliada"
            className="absolute right-4 top-4"
          >
            <X aria-hidden="true" className="size-4" />
          </Button>
        </DialogClose>
        <div
          className={`flex min-h-0 items-center justify-center overflow-hidden rounded-md bg-muted/30 p-2 md:p-4 ${zoom > 1 ? 'cursor-grab touch-none active:cursor-grabbing' : 'touch-pan-y'}`}
          style={
            {
              '--mockup-image-max-height': isFullscreen
                ? 'calc(100dvh - 11rem)'
                : 'calc(78vh - 5rem)',
            } as CSSProperties
          }
          onPointerDown={(event) => {
            if (zoom <= 1 || event.button !== 0) return;
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
          onWheel={(event) => {
            event.preventDefault();
            const next = Math.min(4, Math.max(1, zoom + (event.deltaY < 0 ? 0.25 : -0.25)));
            setZoom(next);
            if (next === 1) setOffset({ x: 0, y: 0 });
          }}
          aria-label="Vista ampliable: use la rueda para acercar y arrastre para desplazarse"
        >
          <div
            className="flex max-h-full max-w-full items-center justify-center transition-transform duration-100"
            style={{ transform: `translate(${offset.x}px, ${offset.y}px) scale(${zoom})` }}
          >
            {children}
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-1">
            <Button
              type="button"
              variant="outline"
              size="icon-sm"
              aria-label="Alejar"
              disabled={zoom <= 1}
              onClick={() => {
                const next = Math.max(1, zoom - 0.25);
                setZoom(next);
                if (next === 1) setOffset({ x: 0, y: 0 });
              }}
            >
              <ZoomOut aria-hidden="true" className="size-4" />
            </Button>
            <span className="min-w-12 text-center text-xs text-muted-foreground">
              {Math.round(zoom * 100)}%
            </span>
            <Button
              type="button"
              variant="outline"
              size="icon-sm"
              aria-label="Acercar"
              disabled={zoom >= 4}
              onClick={() => setZoom((current) => Math.min(4, current + 0.25))}
            >
              <ZoomIn aria-hidden="true" className="size-4" />
            </Button>
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
            <Button
              type="button"
              variant="outline"
              size="sm"
              aria-label={isFullscreen ? 'Salir de pantalla completa' : 'Pantalla completa'}
              onClick={() => setIsFullscreen((current) => !current)}
            >
              {isFullscreen ? (
                <Minimize2 aria-hidden="true" className="size-4" />
              ) : (
                <Maximize2 aria-hidden="true" className="size-4" />
              )}
              <span className="hidden sm:inline">
                {isFullscreen ? 'Salir' : 'Pantalla completa'}
              </span>
            </Button>
            <span className="ml-2 text-xs text-muted-foreground">
              {index + 1} / {count}
            </span>
          </div>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onPrevious}
              disabled={count < 2}
            >
              <ChevronLeft aria-hidden="true" className="size-4" />
              Anterior
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={onNext} disabled={count < 2}>
              Siguiente
              <ChevronRight aria-hidden="true" className="size-4" />
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function MockupsContent({ projectId }: { projectId: string }) {
  const queryClient = useQueryClient();
  const mockups = useQuery({
    queryKey: ['mockups', projectId],
    queryFn: () => api.mockups.list(projectId),
  });
  const blueprints = useQuery({
    queryKey: ['structured-analysis', 'UI_BLUEPRINT', projectId],
    queryFn: () => api.structuredAnalysis.list(projectId, 'UI_BLUEPRINT'),
  });
  const [creatingVersionId, setCreatingVersionId] = useState<string | null>(null);
  const [creatingJobStatus, setCreatingJobStatus] = useState<MockupUiStatus | null>(null);
  const [approvingId, setApprovingId] = useState<string | null>(null);
  const [deviceTypes, setDeviceTypes] = useState<Record<string, MockupDeviceType>>({});
  const approvedBlueprints = (blueprints.data?.items ?? []).filter(
    (b) => b.version.status === 'APPROVED',
  );

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: ['mockups', projectId] });
    queryClient.invalidateQueries({ queryKey: ['readiness', projectId] });
  }

  async function createMockup(uiBlueprintVersionId: string) {
    setCreatingVersionId(uiBlueprintVersionId);
    setCreatingJobStatus('SUBMITTING');
    try {
      const deviceType = deviceTypes[uiBlueprintVersionId] ?? 'DESKTOP';
      const job = await api.mockups.create(projectId, uiBlueprintVersionId, deviceType);
      setCreatingJobStatus(job.status);
      const result = await pollMockupJob(
        () => api.mockups.getJob(projectId, job.id),
        Date.now,
        undefined,
        setCreatingJobStatus,
      );
      if (result.timedOut) {
        if (result.status === 'QUEUED') {
          toast.error(
            'La generación no ha comenzado. Verifique que el servicio de trabajos en segundo plano esté activo.',
          );
        } else {
          toast.error('La generación está tardando más de lo esperado. Revise la lista más tarde.');
          invalidate();
        }
      } else if (result.job.status === 'FAILED') {
        toast.error(result.job.errorMessage ?? 'No se pudo generar el boceto.');
      } else {
        toast.success('Boceto generado.');
        invalidate();
      }
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'No se pudo generar el boceto.');
    } finally {
      setCreatingVersionId(null);
      setCreatingJobStatus(null);
    }
  }

  const transitionFor = (m: MockupResponse) => (status: ArtifactVersionStatus) =>
    api.mockups.transition(projectId, m.id, m.version.id, status);

  async function approveOne(m: MockupResponse) {
    setApprovingId(m.id);
    try {
      await approveDirectly(transitionFor(m));
      toast.success(`${m.code} aprobado.`);
      invalidate();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'No se pudo aprobar el boceto.');
    } finally {
      setApprovingId(null);
    }
  }

  async function transition(m: MockupResponse, status: ArtifactVersionStatus) {
    try {
      await transitionFor(m)(status);
      invalidate();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'No se pudo cambiar el estado.');
    }
  }

  const items = mockups.data?.items ?? [];
  const pending = items.filter((m) => isPendingApproval(m.version.status));

  return (
    <div className="flex flex-col gap-6">
      <PageHeading title="Bocetos" projectId={projectId} />
      <p className="text-sm text-muted-foreground">
        Cada boceto se genera a partir de un Plano de interfaz aprobado y muestra cómo se
        organizarán las pantallas. Si cambia el plano de interfaz, genere un boceto nuevo.
      </p>

      <section className="rounded-lg border border-border bg-card p-4">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-foreground">Generar boceto</h2>
          <ApproveAllButton
            pending={pending}
            approve={(id) => approveDirectly(transitionFor(items.find((m) => m.id === id)!))}
            onDone={invalidate}
          />
        </div>
        {approvedBlueprints.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Cuando tenga un Plano de interfaz aprobado podrá generar aquí su boceto.
          </p>
        ) : (
          <ul className="flex flex-col gap-1 text-sm">
            {approvedBlueprints.map((b) => (
              <li key={b.id} className="flex items-center justify-between gap-2">
                <span>
                  <span className="font-mono text-xs text-muted-foreground">{b.code}</span>{' '}
                  {b.title}
                </span>
                <div className="flex items-center gap-2">
                  <select
                    aria-label="Formato del boceto"
                    className="rounded-md border border-border bg-background px-2 py-1 text-xs"
                    value={deviceTypes[b.version.id] ?? 'DESKTOP'}
                    disabled={creatingVersionId === b.version.id}
                    onChange={(e) =>
                      setDeviceTypes((prev) => ({
                        ...prev,
                        [b.version.id]: e.target.value as MockupDeviceType,
                      }))
                    }
                  >
                    <option value="DESKTOP">Escritorio</option>
                    <option value="MOBILE">Móvil</option>
                  </select>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={creatingVersionId === b.version.id}
                    onClick={() => createMockup(b.version.id)}
                  >
                    {creatingVersionId === b.version.id ? (
                      <>
                        <Loader2 aria-hidden="true" className="size-4 animate-spin" /> Generando…
                      </>
                    ) : (
                      'Generar boceto'
                    )}
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <GenerationOverlay
        open={creatingVersionId !== null}
        title={
          creatingJobStatus === 'SUBMITTING'
            ? 'Preparando la generación'
            : creatingJobStatus === 'QUEUED'
              ? 'Boceto en cola'
              : 'Generando las pantallas'
        }
        description="Puede tardar varios minutos. El estado se actualizará automáticamente."
      />
      {creatingVersionId ? (
        <div
          role="status"
          aria-live="polite"
          className="flex flex-col gap-4 rounded-lg border border-border bg-card p-5 sm:p-6"
        >
          <div className="flex items-start gap-3">
            <Loader2
              className="mt-0.5 size-5 shrink-0 animate-spin text-primary"
              aria-hidden="true"
            />
            <div>
              <p className="text-sm font-semibold text-foreground">
                {creatingJobStatus === 'SUBMITTING'
                  ? 'Preparando la generación'
                  : creatingJobStatus === 'QUEUED'
                    ? 'Boceto en cola'
                    : 'Generando las pantallas'}
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                {creatingJobStatus === 'SUBMITTING'
                  ? 'Enviando el trabajo al servicio de generación.'
                  : creatingJobStatus === 'QUEUED'
                    ? 'El servicio de generación iniciará el trabajo en cuanto esté disponible.'
                    : 'El proveedor está creando las pantallas. La duración depende del contenido del plano.'}
              </p>
            </div>
          </div>
          <div
            role="progressbar"
            aria-label={
              creatingJobStatus === 'SUBMITTING'
                ? 'Preparando la generación'
                : creatingJobStatus === 'QUEUED'
                  ? 'Generación en cola'
                  : 'Generación en curso'
            }
            aria-valuetext={
              creatingJobStatus === 'SUBMITTING'
                ? 'Preparando'
                : creatingJobStatus === 'QUEUED'
                  ? 'En cola'
                  : 'En curso'
            }
            className="h-1.5 overflow-hidden rounded-full bg-muted"
          >
            <div className="mockup-progress-indeterminate h-full w-1/3 rounded-full bg-primary" />
          </div>
          <ol className="grid gap-2 text-xs sm:grid-cols-3">
            <li
              className={`flex items-center gap-2 ${creatingJobStatus === 'SUBMITTING' ? 'font-medium text-primary' : 'text-foreground'}`}
            >
              {creatingJobStatus !== 'SUBMITTING' ? (
                <Check aria-hidden="true" className="size-4 text-emerald-600" />
              ) : (
                <span className="size-4 rounded-full border-2 border-primary" aria-hidden="true" />
              )}
              Preparando
            </li>
            <li
              className={`flex items-center gap-2 ${creatingJobStatus === 'QUEUED' ? 'font-medium text-primary' : creatingJobStatus === 'SUBMITTING' ? 'text-muted-foreground' : 'text-foreground'}`}
            >
              {creatingJobStatus === 'SUBMITTING' ? (
                <span className="size-4 rounded-full border border-current" aria-hidden="true" />
              ) : creatingJobStatus === 'QUEUED' ? (
                <span className="size-4 rounded-full border-2 border-primary" aria-hidden="true" />
              ) : (
                <Check aria-hidden="true" className="size-4 text-emerald-600" />
              )}
              En cola
            </li>
            <li
              className={`flex items-center gap-2 ${creatingJobStatus === 'RUNNING' ? 'font-medium text-primary' : creatingJobStatus === 'COMPLETED' ? 'text-foreground' : 'text-muted-foreground'}`}
            >
              {creatingJobStatus === 'RUNNING' ? (
                <Loader2 aria-hidden="true" className="size-4 animate-spin" />
              ) : creatingJobStatus === 'COMPLETED' ? (
                <Check aria-hidden="true" className="size-4 text-emerald-600" />
              ) : (
                <span className="size-4 rounded-full border border-current" aria-hidden="true" />
              )}
              Generando las pantallas
            </li>
          </ol>
          <p className="text-xs text-muted-foreground">
            Puede tardar varios minutos. El estado se actualizará automáticamente.
          </p>
        </div>
      ) : null}

      <QueryState isLoading={mockups.isLoading} error={mockups.error}>
        {items.length === 0 ? (
          <EmptyState title="Aún no hay bocetos">
            Genere un boceto a partir de un Plano de interfaz aprobado.
          </EmptyState>
        ) : (
          <ul className="flex flex-col gap-4">
            {items.map((m) => (
              <li key={m.id} className="rounded-lg border border-border bg-card p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-mono text-xs text-muted-foreground">
                    {m.code}{' '}
                    <span className="text-muted-foreground/70">
                      · {m.deviceType === 'MOBILE' ? 'Móvil' : 'Escritorio'}
                    </span>
                  </span>
                  <div className="flex flex-wrap items-center gap-2">
                    <StatusBadge status={m.version.status} />
                    {isPendingApproval(m.version.status) ? (
                      <button
                        type="button"
                        onClick={() => approveOne(m)}
                        disabled={approvingId === m.id}
                        className="rounded-md bg-emerald-600 px-3 py-1 text-sm text-white hover:bg-emerald-700 disabled:opacity-50"
                      >
                        {approvingId === m.id ? 'Aprobando…' : 'Aprobar'}
                      </button>
                    ) : null}
                    {m.version.status === 'IN_REVIEW' ? (
                      <>
                        <button
                          type="button"
                          onClick={() => transition(m, 'APPROVED')}
                          className="rounded-md bg-emerald-600 px-3 py-1 text-sm text-white hover:bg-emerald-700"
                        >
                          Aprobar
                        </button>
                        <button
                          type="button"
                          onClick={() => transition(m, 'CHANGES_REQUESTED')}
                          className="rounded-md border border-destructive/40 px-3 py-1 text-sm text-destructive hover:bg-destructive/5"
                        >
                          Solicitar cambios
                        </button>
                      </>
                    ) : null}
                    <ArchiveButton
                      projectId={projectId}
                      artifactId={m.id}
                      code={m.code}
                      onDone={invalidate}
                    />
                  </div>
                </div>
                <div className="mt-2">
                  <MockupPreview mockupId={m.id} projectId={projectId} />
                </div>
              </li>
            ))}
          </ul>
        )}
      </QueryState>
    </div>
  );
}

export default function MockupsPage() {
  return (
    <RequireActiveProject>
      {(projectId) => <MockupsContent projectId={projectId} />}
    </RequireActiveProject>
  );
}
