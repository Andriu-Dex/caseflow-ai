'use client';

import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@caseflow-ai/ui';
import { Sparkles } from 'lucide-react';

// The API draws four screens at the same time and a screen takes about two
// minutes at Stitch: that is the estimate shown, rounded to five minutes.
const SCREENS_AT_ONCE = 4;
const MINUTES_PER_SCREEN = 2;

export function estimatedMinutes(screens: number) {
  const minutes = Math.ceil(screens / SCREENS_AT_ONCE) * MINUTES_PER_SCREEN;
  return Math.max(5, Math.ceil(minutes / 5) * 5);
}

// Generating a mockup with Stitch is long and uses the project's credits, so it
// is asked for once before it starts.
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
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={(next) => (next ? undefined : onCancel())}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>¿Generar el boceto con IA?</DialogTitle>
          <DialogDescription>
            {screens
              ? `Se generarán ${screens} ${screens === 1 ? 'pantalla' : 'pantallas'} de ${device === 'MOBILE' ? 'móvil' : 'escritorio'} con Stitch.`
              : `Se generarán las pantallas del plano de ${device === 'MOBILE' ? 'móvil' : 'escritorio'} con Stitch.`}
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-2 text-sm text-muted-foreground">
          {screens ? (
            <p>
              Tarda{' '}
              <strong className="text-foreground">unos {estimatedMinutes(screens)} minutos</strong>{' '}
              y usa los créditos de Stitch de su cuenta. Puede salir de esta página mientras tanto:
              el avance se conserva.
            </p>
          ) : (
            <p>Puede tardar bastante y usa los créditos de Stitch de su cuenta.</p>
          )}
          <p>Si no hay créditos o Stitch no responde, se creará un esquema interno sin IA.</p>
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="outline" onClick={onCancel}>
            Cancelar
          </Button>
          <Button type="button" onClick={onConfirm} className="gap-1.5">
            <Sparkles aria-hidden="true" className="size-4" />
            Generar boceto
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
