'use client';

import { useEffect, useState } from 'react';
import type { MockupGenerator } from '@caseflow-ai/contracts';
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@caseflow-ai/ui';
import { Sparkles } from 'lucide-react';

// The API draws four screens at the same time. A screen takes about two minutes
// at Stitch and about one with HTML and CSS (the AI's answer plus drawing it in
// the isolated browser): that is the estimate shown, rounded to five minutes.
const SCREENS_AT_ONCE = 4;
const MINUTES_PER_SCREEN: Record<MockupGenerator, number> = { STITCH: 2, HTML_CSS: 1 };

export function estimatedMinutes(screens: number, generator: MockupGenerator = 'STITCH') {
  const minutes = Math.ceil(screens / SCREENS_AT_ONCE) * MINUTES_PER_SCREEN[generator];
  return Math.max(5, Math.ceil(minutes / 5) * 5);
}

const GENERATORS: { value: MockupGenerator; label: string; hint: string }[] = [
  {
    value: 'STITCH',
    label: 'Stitch',
    hint: 'Imágenes de alta fidelidad dibujadas por Stitch.',
  },
  {
    value: 'HTML_CSS',
    label: 'HTML y CSS con IA',
    hint: 'La IA del proyecto escribe cada pantalla en HTML con el tema aprobado.',
  },
];

// Generating a mockup is long and uses the project's credits or AI requests, so
// it is asked for once before it starts, choosing who draws the screens.
export function MockupGenerationConfirm({
  open,
  blueprintScreens,
  device,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  // Screens of the blueprint; null when they are not known.
  blueprintScreens: { localId: string; name: string }[] | null;
  device: 'DESKTOP' | 'MOBILE';
  // screenLocalIds is undefined when every screen is drawn (ADR-029).
  onConfirm: (generator: MockupGenerator, screenLocalIds?: string[]) => void;
  onCancel: () => void;
}) {
  const [generator, setGenerator] = useState<MockupGenerator>('STITCH');
  const [chosen, setChosen] = useState<Set<string>>(new Set());
  useEffect(() => {
    if (!open) return;
    setGenerator('STITCH');
    setChosen(new Set(blueprintScreens?.map((screen) => screen.localId)));
  }, [open, blueprintScreens]);
  const all = !blueprintScreens || chosen.size === blueprintScreens.length;
  const screens = blueprintScreens ? chosen.size : null;
  const what = screens
    ? `${screens} ${screens === 1 ? 'pantalla' : 'pantallas'} de ${device === 'MOBILE' ? 'móvil' : 'escritorio'}`
    : `las pantallas del plano de ${device === 'MOBILE' ? 'móvil' : 'escritorio'}`;
  return (
    <Dialog open={open} onOpenChange={(next) => (next ? undefined : onCancel())}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>¿Generar el boceto con IA?</DialogTitle>
          <DialogDescription>Se generarán {what}.</DialogDescription>
        </DialogHeader>
        {blueprintScreens && blueprintScreens.length > 1 ? (
          <fieldset className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between">
              <legend className="text-sm font-medium">Pantallas</legend>
              <button
                type="button"
                className="text-xs font-medium text-primary hover:underline"
                onClick={() =>
                  setChosen(new Set(all ? [] : blueprintScreens.map((screen) => screen.localId)))
                }
              >
                {all ? 'Quitar todas' : 'Elegir todas'}
              </button>
            </div>
            <p className="text-xs text-muted-foreground">
              Puede empezar por algunas, revisarlas y generar el resto después.
            </p>
            <div className="flex max-h-44 flex-col gap-1 overflow-y-auto rounded-md border border-border p-2">
              {blueprintScreens.map((screen) => (
                <label
                  key={screen.localId}
                  className="flex cursor-pointer items-center gap-2 text-sm"
                >
                  <input
                    type="checkbox"
                    checked={chosen.has(screen.localId)}
                    onChange={(event) =>
                      setChosen((prev) => {
                        const next = new Set(prev);
                        if (event.target.checked) next.add(screen.localId);
                        else next.delete(screen.localId);
                        return next;
                      })
                    }
                  />
                  {screen.name}
                </label>
              ))}
            </div>
          </fieldset>
        ) : null}
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 text-sm font-medium">Generar con</legend>
          {GENERATORS.map((option) => (
            <label
              key={option.value}
              className="flex cursor-pointer items-start gap-2.5 rounded-md border border-border p-3 text-sm has-[:checked]:border-primary has-[:checked]:bg-primary/5"
            >
              <input
                type="radio"
                name="mockup-generator"
                value={option.value}
                checked={generator === option.value}
                onChange={() => setGenerator(option.value)}
                className="mt-0.5"
              />
              <span>
                <span className="font-medium text-foreground">{option.label}</span>
                <span className="block text-muted-foreground">{option.hint}</span>
              </span>
            </label>
          ))}
        </fieldset>
        <div className="flex flex-col gap-2 text-sm text-muted-foreground">
          {generator === 'STITCH' ? (
            <p>
              {screens ? (
                <>
                  Tarda{' '}
                  <strong className="text-foreground">
                    unos {estimatedMinutes(screens)} minutos
                  </strong>{' '}
                  y usa los créditos de Stitch de su cuenta.
                </>
              ) : (
                'Puede tardar bastante y usa los créditos de Stitch de su cuenta.'
              )}
            </p>
          ) : (
            <p>
              Usa{' '}
              <strong className="text-foreground">
                {screens ? `${screens} solicitudes` : 'una solicitud por pantalla'}
              </strong>{' '}
              a la IA del proyecto
              {screens ? (
                <>
                  {' '}
                  y tarda{' '}
                  <strong className="text-foreground">
                    unos {estimatedMinutes(screens, 'HTML_CSS')} minutos
                  </strong>
                </>
              ) : null}
              . Cada pantalla se dibuja en un navegador aislado.
            </p>
          )}
          <p>Puede salir de esta página mientras tanto: el avance se conserva.</p>
          <p>Si no se obtiene ninguna pantalla, se creará un esquema interno sin IA.</p>
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="outline" onClick={onCancel}>
            Cancelar
          </Button>
          <Button
            type="button"
            disabled={screens === 0}
            onClick={() =>
              onConfirm(
                generator,
                all
                  ? undefined
                  : blueprintScreens!
                      .map((screen) => screen.localId)
                      .filter((id) => chosen.has(id)),
              )
            }
            className="gap-1.5"
          >
            <Sparkles aria-hidden="true" className="size-4" />
            Generar boceto
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
