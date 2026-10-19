'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  MOCKUP_REFINEMENT_PROMPT_MAX_LENGTH,
  type MockupDeviceType,
  type MockupJobResponse,
  type MockupPreviewResponse,
  type MockupResponse,
} from '@caseflow-ai/contracts';
import { useEffect, useId, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Download,
  FileCode,
  FileImage,
  Layers,
  Loader2,
  Maximize2,
  Minimize2,
  Monitor,
  Pencil,
  Search,
  Smartphone,
  Sparkles,
  Wand2,
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
  Input,
  Textarea,
} from '@caseflow-ai/ui';
import { api, ApiError, type ArtifactVersionStatus } from '../../../lib/api';
import { QueryState, RequireActiveProject } from '../../../components/query-state';
import { ArchivedArtifacts } from '../../../components/archived-artifacts';
import { MockupGenerationConfirm } from '../../../components/mockup-generation-confirm';
import { PageHeading } from '../../../components/page-heading';
import { StatusBadge } from '../../../components/status-badge';
import { TrustedDiagram } from '../../../components/trusted-svg';
import { AuthedDownloadButton, AuthedImage } from '../../../components/authed-media';
import { AiOrbitSpinner } from '../../../components/generation-overlay';
import {
  ApproveAllButton,
  ArchiveButton,
  EmptyState,
  approveDirectly,
  isPendingApproval,
} from '../../../components/artifact-actions';

// DEC-146: Stitch draws a few screens at a time, about two minutes each, so a
// mockup of many screens can take well over half an hour.
const MOCKUP_POLL_TIMEOUT_MS = 2 * 60 * 60_000;
const MOCKUP_POLL_INTERVAL_MS = 2_000;
type MockupUiStatus = 'SUBMITTING' | MockupJobResponse['status'];

type MockupPollResult =
  { timedOut: false; job: MockupJobResponse } | { timedOut: true; status: 'QUEUED' | 'RUNNING' };

export async function pollMockupJob(
  getJob: () => Promise<MockupJobResponse>,
  now: () => number = Date.now,
  delay: (milliseconds: number) => Promise<void> = (milliseconds) =>
    new Promise((resolve) => setTimeout(resolve, milliseconds)),
  onStatus?: (status: MockupJobResponse['status'], job: MockupJobResponse) => void,
): Promise<MockupPollResult> {
  const deadline = now() + MOCKUP_POLL_TIMEOUT_MS;
  for (;;) {
    const job = await getJob();
    onStatus?.(job.status, job);
    if (job.status === 'COMPLETED' || job.status === 'FAILED') return { timedOut: false, job };
    if (now() >= deadline) return { timedOut: true, status: job.status };
    await delay(MOCKUP_POLL_INTERVAL_MS);
  }
}

const REFINE_HINT =
  'Se generará una versión nueva para revisión; la versión actual no se modifica.';

const GLOBAL_REFINEMENT_SUGGESTIONS = [
  'Paleta con mayor contraste y legibilidad',
  'Tipografía moderna con jerarquía clara',
  'Optimizar espaciados y jerarquía visual',
  'Botones de acción más llamativos',
];

const SCREEN_REFINEMENT_SUGGESTIONS = [
  'Agregar barra de búsqueda rápida',
  'Transformar tabla en tarjetas interactivas',
  'Añadir filtros rápidos por estado',
  'Resaltar acciones primarias',
];

function MockupRefineForm({
  busy,
  onRefine,
  label,
  hint = REFINE_HINT,
  placeholder,
  className = 'rounded-lg border border-border bg-muted/20 p-3',
  autoFocus,
  suggestions,
}: {
  busy: boolean;
  onRefine: (prompt: string) => Promise<boolean>;
  label: string;
  hint?: string;
  placeholder: string;
  className?: string;
  autoFocus?: boolean;
  suggestions?: string[];
}) {
  const [prompt, setPrompt] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const promptId = useId();
  const valid = prompt.trim().length >= 3;
  return (
    <form
      className={`flex flex-col gap-2.5 ${className}`}
      onSubmit={async (event) => {
        event.preventDefault();
        if (!valid) return;
        setSubmitting(true);
        try {
          if (await onRefine(prompt.trim())) setPrompt('');
        } finally {
          setSubmitting(false);
        }
      }}
    >
      <div className="flex items-center justify-between gap-2">
        <label htmlFor={promptId} className="text-sm font-medium text-foreground">
          {label}
        </label>
        <span className="font-mono text-[11px] text-muted-foreground">
          {prompt.length}/{MOCKUP_REFINEMENT_PROMPT_MAX_LENGTH}
        </span>
      </div>
      <Textarea
        id={promptId}
        value={prompt}
        maxLength={MOCKUP_REFINEMENT_PROMPT_MAX_LENGTH}
        rows={2}
        disabled={busy}
        autoFocus={autoFocus}
        placeholder={placeholder}
        onChange={(event) => setPrompt(event.target.value)}
      />
      {suggestions && suggestions.length > 0 ? (
        <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
          <span className="flex items-center gap-1 text-[11px] font-medium text-muted-foreground">
            <Sparkles className="size-3 text-amber-500" /> Sugerencias:
          </span>
          {suggestions.map((suggestion) => (
            <button
              key={suggestion}
              type="button"
              disabled={busy}
              onClick={() => {
                setPrompt((current) =>
                  current.trim() ? `${current.trim()}, ${suggestion}` : suggestion,
                );
              }}
              className="inline-flex items-center rounded-md border border-border/70 bg-background px-2 py-0.5 text-[11px] text-muted-foreground transition-all hover:border-primary/50 hover:bg-primary/5 hover:text-primary active:scale-95 disabled:pointer-events-none disabled:opacity-50"
            >
              + {suggestion}
            </button>
          ))}
        </div>
      ) : null}
      <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
        <p className="text-xs text-muted-foreground">{hint}</p>
        <Button type="submit" size="sm" variant="outline" disabled={busy || !valid}>
          {submitting ? (
            <Loader2 aria-hidden="true" className="size-4 animate-spin" />
          ) : (
            <Wand2 aria-hidden="true" className="size-4" />
          )}
          {submitting ? 'Aplicando…' : 'Aplicar cambios'}
        </Button>
      </div>
    </form>
  );
}

type MockupScreen = NonNullable<MockupPreviewResponse['screens']>[number];

// Edits one screen at Stitch; the other screens are carried over unchanged.
function ScreenEditDialog({
  screen,
  imageUrl,
  busy,
  onClose,
  onRefine,
}: {
  screen: MockupScreen | null;
  imageUrl: string | null;
  busy: boolean;
  onClose: () => void;
  onRefine: (prompt: string) => Promise<boolean>;
}) {
  return (
    <Dialog open={screen !== null} onOpenChange={(open) => (!open && !busy ? onClose() : null)}>
      <DialogContent className="sm:max-w-lg p-6 gap-5">
        <div className="flex items-start gap-4">
          <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary border border-primary/20 shadow-2xs">
            <Pencil className="size-5" aria-hidden="true" />
          </div>
          <div className="flex flex-col gap-1 min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <DialogTitle className="text-lg font-semibold tracking-tight text-foreground truncate">
                Editar pantalla: {screen?.screenName}
              </DialogTitle>
              {screen?.screenLocalId ? (
                <span className="font-mono text-xs px-2 py-0.5 rounded-md bg-muted text-muted-foreground border border-border/70 shrink-0">
                  {screen.screenLocalId}
                </span>
              ) : null}
            </div>
            <DialogDescription className="text-xs sm:text-sm text-muted-foreground leading-relaxed">
              Stitch modificará solo esta pantalla; las demás se conservan tal cual.
            </DialogDescription>
          </div>
        </div>

        {imageUrl ? (
          <div className="flex aspect-[16/10] items-center justify-center overflow-hidden rounded-xl border border-border/70 bg-muted/30 p-2 shadow-2xs">
            {busy ? (
              <AiOrbitSpinner label="Aplicando los cambios a esta pantalla…" />
            ) : (
              <AuthedImage
                url={imageUrl}
                alt={screen?.screenName ?? ''}
                className="max-h-full max-w-full rounded-lg object-contain shadow-2xs"
              />
            )}
          </div>
        ) : null}

        {screen?.refinementPrompt ? (
          <div className="rounded-xl border border-border/60 bg-muted/30 px-3.5 py-2.5 text-xs text-muted-foreground">
            <span className="font-semibold text-foreground">Última edición:</span>{' '}
            {screen.refinementPrompt}
          </div>
        ) : null}

        <MockupRefineForm
          busy={busy}
          autoFocus
          className=""
          label="Instrucciones para esta pantalla"
          placeholder="Ej.: agrega un buscador en la cabecera y cambia la tabla por tarjetas."
          suggestions={SCREEN_REFINEMENT_SUGGESTIONS}
          onRefine={async (prompt) => {
            const done = await onRefine(prompt);
            if (done) onClose();
            return done;
          }}
        />
      </DialogContent>
    </Dialog>
  );
}

function MockupPreview({
  mockupId,
  projectId,
  busy,
  onRefine,
  onRefineScreen,
}: {
  mockupId: string;
  projectId: string;
  busy: boolean;
  onRefine: (prompt: string) => Promise<boolean>;
  onRefineScreen: (screenId: string, prompt: string) => Promise<boolean>;
}) {
  const [selectedScreenIndex, setSelectedScreenIndex] = useState<number | null>(null);
  const [editingScreen, setEditingScreen] = useState<MockupScreen | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const preview = useQuery({
    queryKey: ['mockup-preview', projectId, mockupId],
    queryFn: () => api.mockups.getPreview(projectId, mockupId),
  });
  const screens = preview.data?.screens ?? [];
  const downloadAllUrl = api.mockups.downloadAllUrl(projectId, mockupId);

  const query = searchQuery.trim().toLowerCase();
  const filteredScreens = query
    ? screens.filter(
        (s) =>
          s.screenName.toLowerCase().includes(query) ||
          (s.screenLocalId && s.screenLocalId.toLowerCase().includes(query)) ||
          (s.refinementPrompt && s.refinementPrompt.toLowerCase().includes(query)),
      )
    : screens;

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
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-md border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-xs font-medium text-amber-700 dark:text-amber-400">
            Esquema interno (SVG)
          </span>
        </div>
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
          className="overflow-hidden rounded-xl border border-border bg-muted/30 p-3 text-left hover:border-primary/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
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
        <p className="text-xs text-muted-foreground">
          Este boceto es un esquema interno generado sin IA, por lo que no puede editarse con
          instrucciones. Modifique el Plano de interfaz o genere el boceto con Stitch.
        </p>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-4">
      {preview.data.refinementPrompt ? (
        <div className="rounded-lg border border-border/70 bg-muted/30 px-3.5 py-2 text-xs text-muted-foreground">
          <span className="font-semibold text-foreground">Instrucciones aplicadas:</span>{' '}
          {preview.data.refinementPrompt}
        </div>
      ) : null}

      {screens.length > 0 ? (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-xl border border-border/70 bg-muted/20 p-3">
          <div className="relative flex-1 max-w-sm">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Buscar por nombre o ID..."
              aria-label="Buscar pantalla en el boceto"
              className="h-8 bg-background pl-8 pr-7 text-xs"
            />
            {searchQuery ? (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                aria-label="Borrar búsqueda"
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                <X className="size-3.5" />
              </button>
            ) : null}
          </div>
          <div className="flex items-center justify-between sm:justify-end gap-3 text-xs text-muted-foreground">
            <span>
              Mostrando <strong className="text-foreground">{filteredScreens.length}</strong> de{' '}
              {screens.length} {screens.length === 1 ? 'pantalla' : 'pantallas'}
            </span>
            <AuthedDownloadButton
              url={downloadAllUrl}
              filename="bocetos.zip"
              className="group inline-flex items-center gap-2 rounded-md border border-border/80 bg-background px-3 py-1.5 text-xs font-medium text-foreground shadow-2xs transition-all duration-150 hover:-translate-y-0.5 hover:border-primary/50 hover:bg-accent hover:text-accent-foreground hover:shadow-xs active:translate-y-0 disabled:pointer-events-none disabled:opacity-50"
            >
              <Download
                aria-hidden="true"
                className="size-3.5 text-primary transition-transform duration-200 group-hover:translate-y-0.5"
              />
              <span>
                Descargar todas{' '}
                <span className="font-normal text-muted-foreground">(ZIP · {screens.length})</span>
              </span>
            </AuthedDownloadButton>
          </div>
        </div>
      ) : null}

      {filteredScreens.length === 0 && screens.length > 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border/80 p-8 text-center">
          <Search className="mb-2 size-7 text-muted-foreground/50" />
          <p className="text-sm font-medium text-foreground">No se encontraron pantallas</p>
          <p className="mt-1 text-xs text-muted-foreground">
            No hay ninguna pantalla que coincida con &ldquo;{searchQuery}&rdquo;.
          </p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="mt-3 text-xs"
            onClick={() => setSearchQuery('')}
          >
            Limpiar búsqueda
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {filteredScreens.map((screen) => {
            const screenIndex = screens.findIndex((s) => s.id === screen.id);
            return (
              <figure
                key={screen.id}
                className="group relative flex flex-col min-w-0 overflow-hidden rounded-xl border border-border/80 bg-card shadow-2xs transition-all duration-200 hover:border-primary/40 hover:shadow-sm"
              >
                <div className="relative aspect-[16/10] w-full overflow-hidden bg-muted/40">
                  <div className="absolute left-2.5 top-2.5 z-10 flex items-center gap-1.5">
                    <span className="inline-flex items-center rounded-md border border-border/60 bg-background/90 px-1.5 py-0.5 font-mono text-[10px] font-medium text-muted-foreground shadow-2xs backdrop-blur-xs">
                      {screen.screenLocalId || `screen-${screenIndex + 1}`}
                    </span>
                    {screen.editable ? (
                      <span className="inline-flex items-center gap-0.5 rounded-md border border-violet-500/30 bg-violet-500/10 px-1.5 py-0.5 text-[10px] font-medium text-violet-600 dark:text-violet-400 backdrop-blur-xs">
                        <Sparkles className="size-2.5" />
                        Editable
                      </span>
                    ) : null}
                  </div>

                  <button
                    type="button"
                    aria-label={`Ampliar pantalla ${screen.screenName}`}
                    onClick={() => setSelectedScreenIndex(screenIndex)}
                    className="group/btn relative flex size-full items-center justify-center p-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                  >
                    <AuthedImage
                      url={api.mockups.screenImageUrl(projectId, mockupId, screen.id)}
                      alt={screen.screenName}
                      className="max-h-full max-w-full object-contain transition-transform duration-300 group-hover/btn:scale-[1.03]"
                    />
                    <div className="absolute inset-0 flex items-center justify-center bg-black/20 opacity-0 backdrop-blur-[1px] transition-opacity duration-200 group-hover/btn:opacity-100">
                      <span className="inline-flex items-center gap-1.5 rounded-full border border-white/20 bg-black/60 px-3 py-1 text-xs font-medium text-white shadow-md">
                        <ZoomIn className="size-3.5" />
                        Vista detallada
                      </span>
                    </div>
                  </button>
                </div>

                <figcaption className="flex items-center justify-between gap-2 border-t border-border/80 bg-card px-3.5 py-2.5 text-sm">
                  <span
                    className="truncate font-medium text-foreground text-xs sm:text-sm"
                    title={screen.screenName}
                  >
                    {screen.screenName}
                  </span>
                  <span className="flex shrink-0 items-center gap-1.5">
                    {screen.editable ? (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => setEditingScreen(screen)}
                        title="Editar esta pantalla con instrucciones"
                        aria-label={`Editar la pantalla ${screen.screenName} con instrucciones`}
                        className="group/action inline-flex items-center gap-1 rounded-md border border-border/70 bg-background px-2 py-1 text-xs font-medium text-foreground/80 shadow-2xs transition-all duration-150 hover:-translate-y-0.5 hover:border-violet-500/50 hover:bg-violet-500/5 hover:text-violet-600 dark:hover:text-violet-400 active:translate-y-0 disabled:pointer-events-none disabled:opacity-50"
                      >
                        <Wand2
                          aria-hidden="true"
                          className="size-3 text-violet-500/70 transition-colors group-hover/action:text-violet-500"
                        />
                        <span>Editar</span>
                      </button>
                    ) : null}
                    <AuthedDownloadButton
                      url={api.mockups.screenImageUrl(projectId, mockupId, screen.id)}
                      filename={`${screen.screenName}.png`}
                      title="Descargar imagen PNG"
                      aria-label={`Descargar ${screen.screenName} en formato PNG`}
                      className="group/action inline-flex items-center gap-1 rounded-md border border-border/70 bg-background px-2 py-1 text-xs font-medium text-foreground/80 shadow-2xs transition-all duration-150 hover:-translate-y-0.5 hover:border-primary/50 hover:bg-primary/5 hover:text-primary active:translate-y-0 disabled:pointer-events-none disabled:opacity-50"
                    >
                      <FileImage
                        aria-hidden="true"
                        className="size-3 text-primary/70 transition-colors group-hover/action:text-primary"
                      />
                      <span>PNG</span>
                    </AuthedDownloadButton>
                    <AuthedDownloadButton
                      url={api.mockups.screenHtmlUrl(projectId, mockupId, screen.id)}
                      filename={`${screen.screenName}.html`}
                      title="Descargar archivo HTML"
                      aria-label={`Descargar ${screen.screenName} en formato HTML`}
                      className="group/action inline-flex items-center gap-1 rounded-md border border-border/70 bg-background px-2 py-1 text-xs font-medium text-foreground/80 shadow-2xs transition-all duration-150 hover:-translate-y-0.5 hover:border-amber-500/50 hover:bg-amber-500/5 hover:text-amber-600 dark:hover:text-amber-400 active:translate-y-0 disabled:pointer-events-none disabled:opacity-50"
                    >
                      <FileCode
                        aria-hidden="true"
                        className="size-3 text-amber-500/70 transition-colors group-hover/action:text-amber-500"
                      />
                      <span>HTML</span>
                    </AuthedDownloadButton>
                  </span>
                </figcaption>
                {screen.refinementPrompt ? (
                  <p
                    className="line-clamp-2 border-t border-border/60 bg-violet-500/5 px-3 py-1.5 text-xs text-muted-foreground"
                    title={screen.refinementPrompt}
                  >
                    <span className="font-medium text-violet-600 dark:text-violet-400">
                      Editada:
                    </span>{' '}
                    {screen.refinementPrompt}
                  </p>
                ) : null}
              </figure>
            );
          })}
        </div>
      )}

      {selectedScreenIndex !== null && screens[selectedScreenIndex] ? (
        <MockupScreenDialog
          open
          onOpenChange={(open) => setSelectedScreenIndex(open ? selectedScreenIndex : null)}
          title={screens[selectedScreenIndex]!.screenName}
          index={selectedScreenIndex}
          count={screens.length}
          filename={screens[selectedScreenIndex]!.screenName}
          downloadImageUrl={api.mockups.screenImageUrl(
            projectId,
            mockupId,
            screens[selectedScreenIndex]!.id,
          )}
          downloadHtmlUrl={api.mockups.screenHtmlUrl(
            projectId,
            mockupId,
            screens[selectedScreenIndex]!.id,
          )}
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
            url={api.mockups.screenImageUrl(projectId, mockupId, screens[selectedScreenIndex]!.id)}
            alt={screens[selectedScreenIndex]!.screenName}
            className="h-auto w-full object-contain"
          />
        </MockupScreenDialog>
      ) : null}

      {screens.some((screen) => !screen.editable) ? (
        <p className="text-xs text-muted-foreground">
          Algunas pantallas se generaron antes de habilitar la edición individual. Regenere el
          boceto completo una vez para poder editarlas una por una.
        </p>
      ) : null}

      <MockupRefineForm
        busy={busy}
        onRefine={onRefine}
        label="Editar todas las pantallas"
        hint={`Para cambios que afectan a todo el boceto (p. ej., la paleta de colores); regenera todas las pantallas. ${REFINE_HINT}`}
        placeholder="Ej.: usa una paleta verde y una tipografía más grande en todas las pantallas."
        suggestions={GLOBAL_REFINEMENT_SUGGESTIONS}
      />
      <ScreenEditDialog
        screen={editingScreen}
        imageUrl={
          editingScreen ? api.mockups.screenImageUrl(projectId, mockupId, editingScreen.id) : null
        }
        busy={busy}
        onClose={() => setEditingScreen(null)}
        onRefine={(prompt) => onRefineScreen(editingScreen!.id, prompt)}
      />
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
  downloadImageUrl,
  filename,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  index: number;
  count: number;
  onPrevious: () => void;
  onNext: () => void;
  children: ReactNode;
  downloadImageUrl?: string;
  downloadHtmlUrl?: string;
  filename?: string;
}) {
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [isFullscreen, setIsFullscreen] = useState(false);
  const dragStart = useRef<{ x: number; y: number; offsetX: number; offsetY: number } | null>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const zoomRef = useRef(zoom);
  const offsetRef = useRef(offset);
  zoomRef.current = zoom;
  offsetRef.current = offset;

  // The picture is drawn as wide as the box and as tall as it is, so a tall
  // screen is looked at by scrolling: the wheel moves it up and down (Shift, or a
  // sideways wheel, left and right) and Ctrl + wheel zooms, like the diagram
  // viewer. The offset never leaves the picture: the top edge is the start, and
  // sideways it only moves once zoomed past the width of the box.
  function clampOffset(x: number, y: number, scale = zoomRef.current) {
    const box = viewportRef.current;
    const content = contentRef.current;
    if (!box || !content) return { x: 0, y: 0 };
    const roomY = box.clientHeight - content.offsetHeight * scale;
    const roomX = (content.offsetWidth * scale - box.clientWidth) / 2;
    return {
      x: Math.min(Math.max(0, roomX), Math.max(-Math.max(0, roomX), x)),
      y: Math.min(0, Math.max(Math.min(0, roomY), y)),
    };
  }

  useEffect(() => {
    setZoom(1);
    setOffset({ x: 0, y: 0 });
    setIsFullscreen(false);
  }, [title, open]);

  // React attaches wheel listeners as passive, which cannot stop the page from
  // scrolling: a native listener is registered instead. It is attached when the
  // dialog opens, because the box does not exist while it is closed.
  useEffect(() => {
    if (!open) return;
    let detach: (() => void) | undefined;
    const attach = () => {
      const node = viewportRef.current;
      if (!node) return false;
      const onWheel = (event: WheelEvent) => {
        event.preventDefault();
        if (event.ctrlKey || event.metaKey) {
          const next = Math.min(
            4,
            Math.max(1, zoomRef.current + (event.deltaY < 0 ? 0.25 : -0.25)),
          );
          setZoom(next);
          setOffset(clampOffset(offsetRef.current.x, offsetRef.current.y, next));
          return;
        }
        const sideways = event.shiftKey || Math.abs(event.deltaX) > Math.abs(event.deltaY);
        const delta = sideways ? event.deltaX || event.deltaY : event.deltaY;
        const { x, y } = offsetRef.current;
        setOffset(clampOffset(sideways ? x - delta : x, sideways ? y : y - delta));
      };
      node.addEventListener('wheel', onWheel, { passive: false });
      detach = () => node.removeEventListener('wheel', onWheel);
      return true;
    };
    if (!attach()) {
      const timer = setInterval(() => attach() && clearInterval(timer), 50);
      return () => {
        clearInterval(timer);
        detach?.();
      };
    }
    return () => detach?.();
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        className={`grid max-h-[92vh] w-[96vw] max-w-[96vw] grid-rows-[auto_minmax(0,1fr)_auto] gap-3 overflow-hidden p-4 sm:max-w-[96vw] md:p-6 ${isFullscreen ? '!fixed !inset-0 !left-0 !top-0 !h-dvh !w-screen !max-h-none !max-w-none !translate-x-0 !translate-y-0 !rounded-none' : ''}`}
      >
        <DialogHeader className="pr-8">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <DialogTitle>{title}</DialogTitle>
              <DialogDescription>
                {count > 1
                  ? `Pantalla ${index + 1} de ${count}. Use las flechas del teclado o los controles para recorrer el boceto.`
                  : 'Vista general del boceto generado.'}
              </DialogDescription>
            </div>
            <div className="hidden lg:flex items-center gap-2 rounded-lg border border-border/60 bg-muted/30 px-2.5 py-1 text-[11px] text-muted-foreground">
              <span className="inline-flex items-center gap-1 rounded border border-border/70 bg-background px-1.5 py-0.5 font-mono text-[10px]">
                ← / →
              </span>{' '}
              Navegar
              <span className="mx-1 text-border">•</span>
              <span className="inline-flex items-center gap-1 rounded border border-border/70 bg-background px-1.5 py-0.5 font-mono text-[10px]">
                Rueda
              </span>{' '}
              Desplazar
              <span className="mx-1 text-border">•</span>
              <span className="inline-flex items-center gap-1 rounded border border-border/70 bg-background px-1.5 py-0.5 font-mono text-[10px]">
                Ctrl + rueda
              </span>{' '}
              Zoom
              <span className="mx-1 text-border">•</span>
              <span className="inline-flex items-center gap-1 rounded border border-border/70 bg-background px-1.5 py-0.5 font-mono text-[10px]">
                Arrastrar
              </span>{' '}
              Paneo
              <span className="mx-1 text-border">•</span>
              <span className="inline-flex items-center gap-1 rounded border border-border/70 bg-background px-1.5 py-0.5 font-mono text-[10px]">
                Esc
              </span>{' '}
              Cerrar
            </div>
          </div>
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
          ref={viewportRef}
          className="flex min-h-0 cursor-grab touch-none items-start justify-center overflow-hidden rounded-md bg-muted/30 p-2 active:cursor-grabbing md:p-4"
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
            setOffset(
              clampOffset(
                dragStart.current.offsetX + event.clientX - dragStart.current.x,
                dragStart.current.offsetY + event.clientY - dragStart.current.y,
              ),
            );
          }}
          onPointerUp={() => {
            dragStart.current = null;
          }}
          onPointerCancel={() => {
            dragStart.current = null;
          }}
          aria-label="Vista ampliable: use la rueda para desplazarse, Ctrl con la rueda para acercar y arrastre para moverse"
        >
          <div
            ref={contentRef}
            className="flex w-full max-w-full shrink-0 items-start justify-center"
            style={{
              transform: `translate(${offset.x}px, ${offset.y}px) scale(${zoom})`,
              transformOrigin: 'top center',
            }}
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
                setOffset(clampOffset(offset.x, offset.y, next));
                if (next === 1) setOffset({ x: 0, y: 0 });
              }}
            >
              <ZoomOut aria-hidden="true" className="size-4" />
            </Button>
            <span className="min-w-12 text-center text-xs text-muted-foreground font-mono">
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
            <span className="ml-2 text-xs text-muted-foreground font-mono">
              {index + 1} / {count}
            </span>
          </div>
          <div className="flex items-center gap-2">
            {downloadImageUrl ? (
              <AuthedDownloadButton
                url={downloadImageUrl}
                filename={`${filename ?? title}.png`}
                title="Descargar imagen PNG"
                aria-label={`Descargar ${title} en formato PNG`}
                className="hidden sm:inline-flex items-center gap-1.5 rounded-md border border-border/70 bg-background px-2.5 py-1.5 text-xs font-medium text-foreground/80 shadow-2xs hover:border-primary/50 hover:bg-primary/5 hover:text-primary"
              >
                <FileImage aria-hidden="true" className="size-3.5 text-primary" />
                <span>Descargar PNG</span>
              </AuthedDownloadButton>
            ) : null}
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
  // The generation waiting for the person to confirm it (it is long and costs credits).
  const [confirming, setConfirming] = useState<{ id: string; screens: number | null } | null>(null);
  // A generation that stopped with screens already drawn, to offer to continue it.
  const [stopped, setStopped] = useState<MockupJobResponse | null>(null);
  // Screens drawn so far, when the provider draws them one by one.
  const [progress, setProgress] = useState<{ completed: number; total: number } | null>(null);
  const [approvingId, setApprovingId] = useState<string | null>(null);
  const [deviceTypes, setDeviceTypes] = useState<Record<string, MockupDeviceType>>({});
  const approvedBlueprints = (blueprints.data?.items ?? []).filter(
    (b) => b.version.status === 'APPROVED',
  );

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: ['mockups', projectId] });
    queryClient.invalidateQueries({ queryKey: ['readiness', projectId] });
    queryClient.invalidateQueries({ queryKey: ['archived-artifacts', projectId] });
  }

  function createMockup(uiBlueprintVersionId: string) {
    const deviceType = deviceTypes[uiBlueprintVersionId] ?? 'DESKTOP';
    return runMockupJob(uiBlueprintVersionId, () =>
      api.mockups.create(projectId, uiBlueprintVersionId, deviceType),
    );
  }

  // Resolves true when a new version was produced, so the refine form can clear.
  function refineMockup(mockupId: string, prompt: string) {
    return runMockupJob(mockupId, () => api.mockups.refine(projectId, mockupId, prompt));
  }

  // Shared enqueue → poll flow; `busyKey` marks which control is generating.
  async function runMockupJob(
    busyKey: string,
    enqueue: () => Promise<MockupJobResponse>,
  ): Promise<boolean> {
    setCreatingVersionId(busyKey);
    setStopped(null);
    setCreatingJobStatus('SUBMITTING');
    try {
      const job = await enqueue();
      setCreatingJobStatus(job.status);
      const result = await pollMockupJob(
        () => api.mockups.getJob(projectId, job.id),
        Date.now,
        undefined,
        (status, current) => {
          setCreatingJobStatus(status);
          setProgress(
            current.totalScreens
              ? { completed: current.completedScreens, total: current.totalScreens }
              : null,
          );
        },
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
        if (result.job.completedScreens > 0 && result.job.uiBlueprintVersionId)
          setStopped(result.job);
      } else {
        toast.success('Boceto generado.');
        // Why it is the internal wireframe and not Stitch, when that happened.
        if (result.job.errorMessage) toast.warning(result.job.errorMessage);
        invalidate();
        // A refinement adds a version to an existing mockup: its preview changes too.
        queryClient.invalidateQueries({ queryKey: ['mockup-preview', projectId] });
        return true;
      }
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'No se pudo generar el boceto.');
    } finally {
      setCreatingVersionId(null);
      setCreatingJobStatus(null);
      setProgress(null);
    }
    return false;
  }

  // A generation still running when the page opens (it was left, or reloaded)
  // is followed again instead of being lost from view.
  const resumed = useRef(false);
  useEffect(() => {
    if (resumed.current) return;
    resumed.current = true;
    api.mockups
      .latestJob(projectId)
      .then(({ job }) => {
        if (job && (job.status === 'QUEUED' || job.status === 'RUNNING'))
          void runMockupJob('job', () => Promise.resolve(job));
        else if (job?.status === 'FAILED' && job.completedScreens > 0 && job.uiBlueprintVersionId)
          setStopped(job);
      })
      .catch(() => undefined);
  }, [projectId]);

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

      <section className="rounded-xl border border-border bg-card p-5 shadow-2xs">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary border border-primary/20">
              <Layers className="size-4" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-foreground">Generar boceto</h2>
              <p className="text-xs text-muted-foreground">
                A partir de un Plano de interfaz aprobado, genera pantallas de alta fidelidad o
                esquemas visuales.
              </p>
            </div>
          </div>
          <ApproveAllButton
            pending={pending}
            approve={(id) => approveDirectly(transitionFor(items.find((m) => m.id === id)!))}
            onDone={invalidate}
          />
        </div>
        {approvedBlueprints.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border/80 bg-muted/20 p-4 text-center text-sm text-muted-foreground">
            Cuando tenga un Plano de interfaz aprobado podrá generar aquí su boceto.
          </div>
        ) : (
          <ul className="flex flex-col gap-2.5 text-sm">
            {approvedBlueprints.map((b) => {
              const screensCount = 'screens' in b.content ? b.content.screens.length : null;
              const currentDevice = deviceTypes[b.version.id] ?? 'DESKTOP';
              return (
                <li
                  key={b.id}
                  className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-lg border border-border/70 bg-muted/20 p-3 transition-colors hover:bg-muted/30"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span className="font-mono text-xs font-semibold px-2 py-0.5 rounded-md bg-primary/10 text-primary border border-primary/20 shrink-0">
                      {b.code}
                    </span>
                    <span className="font-medium text-foreground truncate" title={b.title}>
                      {b.title}
                    </span>
                    {screensCount !== null && screensCount > 0 ? (
                      <span className="hidden md:inline-flex items-center rounded-md border border-border/60 bg-background px-2 py-0.5 text-xs text-muted-foreground shrink-0">
                        {screensCount} {screensCount === 1 ? 'pantalla' : 'pantallas'}
                      </span>
                    ) : null}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <div
                      role="radiogroup"
                      aria-label="Dispositivo de destino"
                      className="inline-flex rounded-lg border border-border/80 bg-muted/40 p-0.5"
                    >
                      <button
                        type="button"
                        role="radio"
                        aria-checked={currentDevice === 'DESKTOP'}
                        disabled={creatingVersionId === b.version.id}
                        onClick={() =>
                          setDeviceTypes((prev) => ({
                            ...prev,
                            [b.version.id]: 'DESKTOP',
                          }))
                        }
                        className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-all ${
                          currentDevice === 'DESKTOP'
                            ? 'bg-background text-foreground shadow-xs'
                            : 'text-muted-foreground hover:text-foreground'
                        }`}
                      >
                        <Monitor className="size-3.5" />
                        <span>Escritorio</span>
                      </button>
                      <button
                        type="button"
                        role="radio"
                        aria-checked={currentDevice === 'MOBILE'}
                        disabled={creatingVersionId === b.version.id}
                        onClick={() =>
                          setDeviceTypes((prev) => ({
                            ...prev,
                            [b.version.id]: 'MOBILE',
                          }))
                        }
                        className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-all ${
                          currentDevice === 'MOBILE'
                            ? 'bg-background text-foreground shadow-xs'
                            : 'text-muted-foreground hover:text-foreground'
                        }`}
                      >
                        <Smartphone className="size-3.5" />
                        <span>Móvil</span>
                      </button>
                    </div>
                    {/* Accessible fallback select */}
                    <select
                      aria-label="Formato del boceto"
                      className="sr-only"
                      value={currentDevice}
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
                      onClick={() => setConfirming({ id: b.version.id, screens: screensCount })}
                      className="border-primary/40 hover:bg-primary/5 hover:text-primary"
                    >
                      {creatingVersionId === b.version.id ? (
                        <>
                          <Loader2 aria-hidden="true" className="size-4 animate-spin" /> Generando…
                        </>
                      ) : (
                        <>
                          <Sparkles aria-hidden="true" className="size-3.5 text-primary mr-1" />
                          Generar boceto
                        </>
                      )}
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <MockupGenerationConfirm
        open={confirming !== null}
        screens={confirming?.screens ?? null}
        device={confirming ? (deviceTypes[confirming.id] ?? 'DESKTOP') : 'DESKTOP'}
        onCancel={() => setConfirming(null)}
        onConfirm={() => {
          const id = confirming!.id;
          setConfirming(null);
          void createMockup(id);
        }}
      />

      {stopped && !creatingVersionId ? (
        <div
          role="status"
          className="flex flex-col gap-3 rounded-lg border border-amber-300 bg-amber-50 p-5 dark:border-amber-700/60 dark:bg-amber-950/30"
        >
          <p className="text-sm font-semibold text-foreground">
            La generación del boceto se detuvo: {stopped.completedScreens} de {stopped.totalScreens}{' '}
            pantallas listas
          </p>
          <p className="text-sm text-muted-foreground">
            {stopped.errorMessage ??
              'Las pantallas ya generadas se conservan; solo se piden las que faltan.'}
          </p>
          <div>
            <Button
              type="button"
              size="sm"
              onClick={() => {
                const job = stopped;
                void runMockupJob(job.uiBlueprintVersionId!, () =>
                  api.mockups.create(
                    projectId,
                    job.uiBlueprintVersionId!,
                    job.deviceType ?? 'DESKTOP',
                  ),
                );
              }}
            >
              Continuar la generación
            </Button>
          </div>
        </div>
      ) : null}

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
                    : progress
                      ? `${progress.completed} de ${progress.total} pantallas listas. Se dibujan unas pocas a la vez; puede salir de esta página, el avance se conserva.`
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
            {...(progress
              ? {
                  'aria-valuemin': 0,
                  'aria-valuemax': progress.total,
                  'aria-valuenow': progress.completed,
                }
              : {})}
            className="h-1.5 overflow-hidden rounded-full bg-muted"
          >
            {progress ? (
              <div
                className="h-full rounded-full bg-primary transition-all"
                style={{ width: `${Math.round((progress.completed / progress.total) * 100)}%` }}
              />
            ) : (
              <div className="mockup-progress-indeterminate h-full w-1/3 rounded-full bg-primary" />
            )}
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
            {progress
              ? 'Si se interrumpe, vuelva a generar el boceto: solo se piden las pantallas que faltan.'
              : 'Puede tardar varios minutos. El estado se actualizará automáticamente.'}
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
              <li
                key={m.id}
                className="rounded-2xl border border-border/80 bg-card p-5 sm:p-6 shadow-2xs transition-all duration-200 hover:border-primary/30 hover:shadow-xs"
              >
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/60 pb-4">
                  <div className="flex flex-wrap items-center gap-2.5">
                    <span className="font-mono text-xs font-semibold px-2.5 py-1 rounded-lg bg-primary/10 text-primary border border-primary/20">
                      {m.code}
                    </span>
                    <span className="inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-lg bg-muted text-muted-foreground border border-border/70">
                      {m.deviceType === 'MOBILE' ? (
                        <Smartphone className="size-3.5 text-primary" />
                      ) : (
                        <Monitor className="size-3.5 text-primary" />
                      )}
                      {m.deviceType === 'MOBILE' ? 'Móvil' : 'Escritorio'}
                    </span>
                    <span className="text-xs text-muted-foreground font-mono bg-muted/50 px-2 py-0.5 rounded border border-border/50">
                      v{m.version.versionNumber}
                    </span>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <StatusBadge status={m.version.status} />
                    {isPendingApproval(m.version.status) ? (
                      <Button
                        type="button"
                        size="sm"
                        onClick={() => approveOne(m)}
                        disabled={approvingId === m.id}
                        className="bg-emerald-600 text-white hover:bg-emerald-700 shadow-2xs"
                      >
                        <CheckCircle2 className="size-4" />
                        {approvingId === m.id ? 'Aprobando…' : 'Aprobar'}
                      </Button>
                    ) : null}
                    {m.version.status === 'IN_REVIEW' ? (
                      <>
                        <Button
                          type="button"
                          size="sm"
                          onClick={() => transition(m, 'APPROVED')}
                          className="bg-emerald-600 text-white hover:bg-emerald-700 shadow-2xs"
                        >
                          <CheckCircle2 className="size-4" />
                          Aprobar
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => transition(m, 'CHANGES_REQUESTED')}
                          className="border-destructive/40 text-destructive hover:bg-destructive/5"
                        >
                          Solicitar cambios
                        </Button>
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
                <div className="mt-4">
                  <MockupPreview
                    mockupId={m.id}
                    projectId={projectId}
                    busy={creatingVersionId !== null}
                    onRefine={(prompt) => refineMockup(m.id, prompt)}
                    onRefineScreen={(screenId, prompt) =>
                      runMockupJob(m.id, () =>
                        api.mockups.refineScreen(projectId, m.id, screenId, prompt),
                      )
                    }
                  />
                </div>
              </li>
            ))}
          </ul>
        )}
      </QueryState>

      {/* Navigation Footer */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-6 border-t border-border mt-4">
        <Link href="/design/theme">
          <Button variant="outline" size="sm" className="gap-2 text-xs">
            <ArrowLeft className="size-3.5" />
            Anterior: Tema visual (Paso 11)
          </Button>
        </Link>
        <Link href="/traceability">
          <Button size="sm" className="gap-2 text-xs font-semibold">
            Siguiente: Trazabilidad (Paso 13)
            <ArrowRight className="size-3.5" />
          </Button>
        </Link>
      </div>

      <ArchivedArtifacts projectId={projectId} types={['MOCKUP']} onRestored={invalidate} />
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
