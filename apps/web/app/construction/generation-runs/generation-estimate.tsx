import type { GenerationEstimateResponse } from '@caseflow-ai/contracts';

// What a generation would ask the AI for: exact for the actions and the
// demonstration data, an upper bound for the screens (DEC-168).
export function GenerationEstimate({ estimate }: { estimate: GenerationEstimateResponse }) {
  const { businessActions: actions, demoData, screens, requests } = estimate;
  const newActions = actions.total - actions.reused;
  return (
    <div className="rounded-lg border border-border/70 bg-muted/30 p-3 text-xs" role="note">
      <p className="font-medium text-foreground">
        {requests.atMost === 0
          ? 'Generar no hará solicitudes a la IA: todo se reutiliza.'
          : requests.atLeast === requests.atMost
            ? `Uso de IA previsto: ${requests.atMost} ${requests.atMost === 1 ? 'solicitud' : 'solicitudes'}.`
            : `Uso de IA previsto: entre ${requests.atLeast} y ${requests.atMost} solicitudes.`}
      </p>
      <ul className="mt-1.5 flex flex-col gap-0.5 text-muted-foreground">
        {actions.total ? (
          <li>
            Lógica de negocio: {actions.reused} de {actions.total}{' '}
            {actions.total === 1 ? 'acción se reutiliza' : 'acciones se reutilizan'}
            {newActions
              ? `; ${newActions} ${newActions === 1 ? 'se pide' : 'se piden'} a la IA.`
              : '.'}
          </li>
        ) : null}
        {demoData !== 'NONE' ? (
          <li>
            Datos de demostración:{' '}
            {demoData === 'REUSED' ? 'se reutilizan.' : 'se piden a la IA (una solicitud).'}
          </li>
        ) : null}
        {screens.atMost ? (
          <li>
            Pantallas: hasta {screens.atMost} se revisan con la IA; las que no cambiaron se
            reutilizan.
          </li>
        ) : null}
      </ul>
      <p className="mt-1.5 text-muted-foreground">
        Una respuesta que no pasa la revisión se pide una vez más.
      </p>
    </div>
  );
}
