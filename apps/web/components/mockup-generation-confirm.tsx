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
  screens,
  device,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  // Screens of the blueprint; null when it is not known.
  screens: number | null;
  device: 'DESKTOP' | 'MOBILE';
  onConfirm: (generator: MockupGenerator) => void;
  onCancel: () => void;
}) {
  const [generator, setGenerator] = useState<MockupGenerator>('STITCH');
  useEffect(() => {
    if (open) setGenerator('STITCH');
  }, [open]);
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
          <Button type="button" onClick={() => onConfirm(generator)} className="gap-1.5">
            <Sparkles aria-hidden="true" className="size-4" />
            Generar boceto
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
