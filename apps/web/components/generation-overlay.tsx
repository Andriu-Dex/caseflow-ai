'use client';

import { useEffect, useState } from 'react';
import { Sparkles } from 'lucide-react';

// After this long a wait stops feeling like "a few seconds": say it is still
// working, so a long generation never looks frozen (DEC-132).
const LONG_WAIT_MS = 20_000;

export function formatDuration(ms: number): string {
  const seconds = Math.max(0, Math.round(ms / 1000));
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return minutes ? `${minutes} min ${String(rest).padStart(2, '0')} s` : `${rest} s`;
}

// Re-renders every second while mounted, for a live elapsed time.
export function useElapsed(since: string | number | null): number {
  const start = since === null ? null : new Date(since).getTime();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (start === null) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [start]);
  return start === null ? 0 : Math.max(0, now - start);
}

// The orbiting-rings animation shared by every AI-generation indicator in the
// product: the fixed full-screen GenerationOverlay below, and any inline spot
// (e.g. replacing a preview image while it regenerates) via AiOrbitSpinner.
function AiOrbitRings({ size = 'size-28', icon = 'size-7' }: { size?: string; icon?: string }) {
  return (
    <div className={`relative ${size}`} aria-hidden="true">
      <div className="ai-orbit absolute inset-0 rounded-full border-4 border-primary/15 border-t-primary" />
      <div className="ai-orbit-reverse absolute inset-3 rounded-full border-4 border-primary/10 border-b-primary/70" />
      <div className="ai-pulse absolute inset-7 flex items-center justify-center rounded-full bg-primary/15">
        <Sparkles className={`${icon} text-primary`} />
      </div>
    </div>
  );
}

// One shared, non-blocking progress overlay for every AI generation in the
// product. It ignores pointer events so the user can keep scrolling/reading
// while a long generation runs; the triggering button stays disabled.
export function GenerationOverlay({
  open,
  title = 'Generando con IA',
  description = 'Según el tamaño, puede tardar desde unos segundos hasta varios minutos. El resultado quedará como propuesta para su revisión.',
}: {
  open: boolean;
  title?: string;
  description?: string;
}) {
  if (!open) return null;
  return <OpenGenerationOverlay title={title} description={description} />;
}

function OpenGenerationOverlay({ title, description }: { title: string; description: string }) {
  // Counted from when the overlay opened.
  const [openedAt] = useState(() => Date.now());
  const elapsed = useElapsed(openedAt);
  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center bg-background/60 backdrop-blur-[2px]"
    >
      <div className="flex max-w-sm flex-col items-center gap-5 rounded-2xl border border-border bg-card/95 px-8 py-7 text-center shadow-xl">
        <AiOrbitRings />
        <div>
          <p className="text-base font-semibold text-foreground">{title}</p>
          <p className="mt-1 text-sm text-muted-foreground">{description}</p>
          <p className="mt-3 text-xs text-muted-foreground">
            Tiempo transcurrido: {formatDuration(elapsed)}
          </p>
          {elapsed >= LONG_WAIT_MS ? (
            <p className="mt-1 text-xs text-muted-foreground">
              Sigue trabajando. Las propuestas extensas pueden tardar varios minutos.
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}

// Same animation, sized to sit inside a fixed spot (a card, an image frame)
// instead of covering the screen — e.g. replacing a screen preview in place
// while it regenerates.
export function AiOrbitSpinner({
  label = 'Generando…',
  className = 'flex flex-col items-center justify-center gap-3 py-6',
}: {
  label?: string;
  className?: string;
}) {
  return (
    <div role="status" aria-live="polite" className={className}>
      <AiOrbitRings size="size-16" icon="size-5" />
      <p className="text-sm font-medium text-muted-foreground">{label}</p>
    </div>
  );
}
