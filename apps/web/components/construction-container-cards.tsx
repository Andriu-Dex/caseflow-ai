'use client';

import { useMemo, useState } from 'react';
import type { ConstructionPreviewResponse } from '@caseflow-ai/contracts';
import { Button } from '@caseflow-ai/ui';

type Container = ConstructionPreviewResponse['containers'][number];

function ContainerCard({ container }: { container: Container }) {
  const [showModules, setShowModules] = useState(false);
  const modules = showModules ? container.modules : container.modules.slice(0, 3);

  return (
    <article className="flex flex-col gap-3 rounded-xl border border-border/80 bg-card p-4 shadow-2xs">
      <div>
        <h4 className="font-semibold text-foreground">{container.name}</h4>
        <p className="mt-1 text-xs leading-snug text-muted-foreground">
          {container.responsibility}
        </p>
        <p className="mt-2 font-mono text-[11px] text-muted-foreground">{container.image}</p>
      </div>
      <dl className="grid gap-2 text-xs sm:grid-cols-2">
        <div>
          <dt className="font-medium text-foreground">Ejecuta</dt>
          <dd className="text-muted-foreground">
            {container.services
              .map(
                (service) => `${service.name}${service.port === null ? '' : ` (${service.port})`}`,
              )
              .join(', ') || 'Sin servicios declarados'}
          </dd>
        </div>
        <div>
          <dt className="font-medium text-foreground">Acceso</dt>
          <dd className="text-muted-foreground">{container.exposure ?? 'Solo red interna'}</dd>
        </div>
        <div>
          <dt className="font-medium text-foreground">Volúmenes</dt>
          <dd className="text-muted-foreground">{container.volumes.join(', ') || 'No requiere'}</dd>
        </div>
        <div>
          <dt className="font-medium text-foreground">Límites</dt>
          <dd className="text-muted-foreground">{container.limits ?? 'No definidos'}</dd>
        </div>
        <div className="sm:col-span-2">
          <dt className="font-medium text-foreground">Depende de</dt>
          <dd className="text-muted-foreground">
            {container.dependsOn.join(', ') || 'No depende de otro contenedor'}
          </dd>
        </div>
      </dl>
      {container.modules.length > 0 ? (
        <div className="border-t border-border/60 pt-2 text-xs">
          <span className="font-medium text-foreground">Módulos servidos: </span>
          <span className="text-muted-foreground">{modules.join(', ')}</span>
          {container.modules.length > 3 ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="ml-1 h-auto px-1 py-0 text-xs"
              onClick={() => setShowModules((value) => !value)}
              aria-expanded={showModules}
            >
              {showModules ? 'Ver menos' : `Ver los ${container.modules.length}`}
            </Button>
          ) : null}
        </div>
      ) : null}
    </article>
  );
}

export function ConstructionContainerCards({ containers }: { containers: Container[] }) {
  const groups = useMemo(
    () =>
      [
        { environment: 'DEPLOYMENT', title: 'Despliegue de demostración' },
        { environment: 'LOCAL', title: 'Ejecución local (Docker Compose)' },
      ] as const,
    [],
  );
  const connections = useMemo(
    () =>
      containers.flatMap((container) =>
        container.dependsOn.map((dependency) => `${container.name} → ${dependency}`),
      ),
    [containers],
  );

  return (
    <div className="flex flex-col gap-6">
      {groups.map(({ environment, title }) => {
        const group = containers.filter((container) => container.environment === environment);
        return (
          <section key={environment} className="flex flex-col gap-3">
            <h3 className="font-semibold text-foreground">{title}</h3>
            {group.length ? (
              <div className="grid gap-3 lg:grid-cols-2">
                {group.map((container) => (
                  <ContainerCard key={`${environment}-${container.name}`} container={container} />
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                No hay contenedores previstos para este entorno.
              </p>
            )}
          </section>
        );
      })}
      {connections.length ? (
        <section className="rounded-lg border border-border/70 bg-muted/30 p-3">
          <h3 className="text-sm font-semibold text-foreground">Conexiones previstas</h3>
          <p className="mt-1 text-xs text-muted-foreground">{connections.join(' · ')}</p>
        </section>
      ) : null}
    </div>
  );
}
