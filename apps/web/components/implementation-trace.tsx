'use client';

import { useQuery } from '@tanstack/react-query';
import { MapPin } from 'lucide-react';
import { useState } from 'react';
import { api } from '../lib/api';
import { useActiveProject } from '../lib/active-project';

const VALIDATION: Record<string, string> = {
  READY: 'validada, lista para desplegar',
  QUEUED: 'validación en curso',
  RUNNING: 'validación en curso',
  FAILED: 'validación con fallos, en reparación',
  VALIDATION_FAILED: 'validación fallida',
  ERROR: 'la validación no pudo completarse',
};

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <p className="font-semibold text-foreground">{title}</p>
      {children}
    </div>
  );
}

// DEC-172: where a requirement or use case is implemented, loaded on demand.
export function ImplementationTrace({ code }: { code: string }) {
  const { projectId } = useActiveProject();
  const [open, setOpen] = useState(false);
  const trace = useQuery({
    queryKey: ['implementation-trace', projectId, code],
    queryFn: () => api.implementationTrace(projectId!, code),
    enabled: open && Boolean(projectId),
    retry: false,
  });
  const data = trace.data;
  const nothing =
    data &&
    !data.screens.length &&
    !data.actions.length &&
    !data.design.length &&
    !data.files.length;

  return (
    <details
      className="rounded-xl border border-border/80 bg-muted/20 p-3 text-xs"
      onToggle={(event) => setOpen((event.target as HTMLDetailsElement).open)}
    >
      <summary className="flex cursor-pointer items-center gap-1.5 font-semibold">
        <MapPin className="size-3.5 text-primary" aria-hidden="true" />
        ¿Dónde está implementado?
      </summary>
      <div className="mt-2.5 flex flex-col gap-2.5 text-muted-foreground">
        {trace.isLoading ? <p>Buscando…</p> : null}
        {trace.error ? (
          <p role="alert">
            {trace.error instanceof Error ? trace.error.message : 'No se pudo consultar.'}
          </p>
        ) : null}
        {data ? (
          <>
            <p>
              {data.run
                ? `Según la construcción del ${new Date(data.run.createdAt).toLocaleString('es-EC')} (${
                    data.run.validation
                      ? (VALIDATION[data.run.validation] ?? data.run.validation)
                      : 'sin validar'
                  }).`
                : 'Aún no hay una construcción: se muestra lo que prevé el plan de implementación.'}
            </p>
            {nothing ? (
              <p>
                Todavía nada lo implementa: ninguna pantalla del plan realiza sus casos de uso y
                ningún elemento del diseño lo cita.
              </p>
            ) : null}
            {data.type === 'REQUIREMENT' && data.useCases.length ? (
              <Block title="Casos de uso que lo realizan">
                <ul>
                  {data.useCases.map((useCase) => (
                    <li key={useCase.code}>
                      <span className="font-mono">{useCase.code}</span> {useCase.name}
                    </li>
                  ))}
                </ul>
              </Block>
            ) : null}
            {data.screens.length ? (
              <Block title={`Pantallas (${data.screens.length})`}>
                <ul>
                  {data.screens.map((screen) => (
                    <li key={screen.path}>
                      {screen.screenName} <span className="font-mono">{screen.path}</span>
                    </li>
                  ))}
                </ul>
              </Block>
            ) : null}
            {data.actions.length ? (
              <Block title={`Acciones del servidor (${data.actions.length})`}>
                <ul>
                  {data.actions.map((action) => (
                    <li key={action.key}>
                      {action.summary} <span className="font-mono">{action.key}</span>
                    </li>
                  ))}
                </ul>
              </Block>
            ) : null}
            {data.design.length ? (
              <Block title="Elementos del diseño que lo atienden">
                <ul>
                  {data.design.map((item) => (
                    <li key={`${item.source}-${item.name}`}>
                      {item.name} <span>({item.source})</span>
                    </li>
                  ))}
                </ul>
              </Block>
            ) : null}
            {data.acceptance.length ? (
              <Block title="Pruebas de aceptación">
                <ul>
                  {data.acceptance.map((criterion) => (
                    <li key={criterion.key}>
                      {criterion.key} · {criterion.useCaseName}:{' '}
                      <strong>
                        {!criterion.result
                          ? 'sin ejecutar'
                          : criterion.result.passed
                            ? 'pasó'
                            : 'falló'}
                      </strong>
                    </li>
                  ))}
                </ul>
              </Block>
            ) : null}
            {data.files.length ? (
              <details>
                <summary className="cursor-pointer font-semibold text-foreground">
                  Archivos ({data.files.length})
                </summary>
                <ul className="mt-1 font-mono">
                  {data.files.map((file) => (
                    <li key={file.path}>{file.path}</li>
                  ))}
                </ul>
              </details>
            ) : null}
          </>
        ) : null}
      </div>
    </details>
  );
}
