'use client';

import { useState } from 'react';
import { Button } from '@caseflow-ai/ui';
import { toast } from 'sonner';
import { ApiError } from '../lib/api';

// Stops a generation in the background. It asks once, because the run is long
// and costs AI usage; what the finished batches saved is kept for resuming.
export function GenerationCancelButton({ onCancel }: { onCancel: () => Promise<unknown> }) {
  const [asking, setAsking] = useState(false);
  const [cancelling, setCancelling] = useState(false);

  async function confirm() {
    setCancelling(true);
    try {
      await onCancel();
      toast.info('Se canceló la generación. Los lotes completados se conservan.');
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : 'No se pudo cancelar la generación.');
    } finally {
      setCancelling(false);
      setAsking(false);
    }
  }

  if (!asking)
    return (
      <Button type="button" size="sm" variant="outline" onClick={() => setAsking(true)}>
        Cancelar la generación
      </Button>
    );
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-sm text-muted-foreground">
        ¿Cancelar? Lo ya generado se conserva y podrá reanudar.
      </span>
      <Button
        type="button"
        size="sm"
        variant="destructive"
        disabled={cancelling}
        onClick={() => void confirm()}
      >
        {cancelling ? 'Cancelando…' : 'Sí, cancelar'}
      </Button>
      <Button
        type="button"
        size="sm"
        variant="outline"
        disabled={cancelling}
        onClick={() => setAsking(false)}
      >
        Seguir generando
      </Button>
    </div>
  );
}
