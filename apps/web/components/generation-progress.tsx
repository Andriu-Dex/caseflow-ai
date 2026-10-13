'use client';

import { AiOrbitSpinner, formatDuration, useElapsed } from './generation-overlay';

// Real progress of a long AI generation running in the background (DEC-132):
// what phase it is in, how much it has written against what earlier ones
// took, and how long it has been going — so a wait of minutes never looks
// like a frozen page.

// A streamed answer is counted in characters; a token is about 3.5 of them
// in Spanish structured output.
const CHARS_PER_TOKEN = 3.5;

export function GenerationProgress({
  title,
  startedAt,
  outputChars,
  expectedOutputTokens,
  expectedDurationMs,
}: {
  title: string;
  startedAt: string;
  outputChars: number;
  expectedOutputTokens: number | null;
  expectedDurationMs: number | null;
}) {
  const elapsed = useElapsed(startedAt);
  const written = Math.round(outputChars / CHARS_PER_TOKEN);
  const writing = outputChars > 0;
  // Never shows 100 % before the answer is actually complete.
  const percent =
    writing && expectedOutputTokens
      ? Math.min(95, Math.round((written / expectedOutputTokens) * 100))
      : null;
  return (
    <section
      aria-label={title}
      className="flex flex-col gap-4 rounded-xl border border-primary/30 bg-primary/5 p-5 sm:flex-row sm:items-center"
    >
      <AiOrbitSpinner label="" className="flex shrink-0 items-center justify-center" />
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <p className="text-sm font-semibold text-foreground">{title}</p>
        <p className="text-sm text-foreground/80" aria-live="polite">
          {writing
            ? `La IA está escribiendo la propuesta: ~${written.toLocaleString('es')} tokens${
                expectedOutputTokens ? ` de ~${expectedOutputTokens.toLocaleString('es')}` : ''
              }.`
            : 'La IA está leyendo las fuentes y pensando la respuesta. Cuando empiece a escribir verá el avance aquí.'}
        </p>
        {percent !== null ? (
          <div
            role="progressbar"
            aria-label="Avance de la propuesta"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={percent}
            className="h-2 overflow-hidden rounded-full bg-primary/15"
          >
            <div
              className="h-full rounded-full bg-primary transition-[width] duration-700"
              style={{ width: `${percent}%` }}
            />
          </div>
        ) : null}
        <p className="text-xs text-muted-foreground">
          Tiempo transcurrido: {formatDuration(elapsed)}
          {expectedDurationMs ? ` · Suele tardar unos ${formatDuration(expectedDurationMs)}` : ''}
          {' · '}
          Puede seguir trabajando o recargar la página: la propuesta no se pierde.
        </p>
      </div>
    </section>
  );
}
