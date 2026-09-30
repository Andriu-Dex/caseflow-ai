'use client';

import { Sparkles } from 'lucide-react';

// One shared, non-blocking progress overlay for every AI generation in the
// product. It ignores pointer events so the user can keep scrolling/reading
// while a long generation runs; the triggering button stays disabled.
export function GenerationOverlay({
  open,
  title = 'Generando con IA',
  description = 'Esto puede tardar unos segundos. El resultado quedará como propuesta para su revisión.',
}: {
  open: boolean;
  title?: string;
  description?: string;
}) {
  if (!open) return null;
  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center bg-background/60 backdrop-blur-[2px]"
    >
      <div className="flex max-w-sm flex-col items-center gap-5 rounded-2xl border border-border bg-card/95 px-8 py-7 text-center shadow-xl">
        <div className="relative size-28" aria-hidden="true">
          <div className="ai-orbit absolute inset-0 rounded-full border-4 border-primary/15 border-t-primary" />
          <div className="ai-orbit-reverse absolute inset-3 rounded-full border-4 border-primary/10 border-b-primary/70" />
          <div className="ai-pulse absolute inset-7 flex items-center justify-center rounded-full bg-primary/15">
            <Sparkles className="size-7 text-primary" />
          </div>
        </div>
        <div>
          <p className="text-base font-semibold text-foreground">{title}</p>
          <p className="mt-1 text-sm text-muted-foreground">{description}</p>
        </div>
      </div>
    </div>
  );
}
