'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Code2 } from 'lucide-react';
import type { ImplementationPlanContent } from '@caseflow-ai/contracts';
import { Button } from '@caseflow-ai/ui';
import { api, ApiError } from '../lib/api';

const TYPE_LABELS: Record<string, string> = {
  STRING: 'texto',
  TEXT: 'texto largo',
  INT: 'entero',
  DECIMAL: 'decimal',
  BOOLEAN: 'sí/no',
  DATE: 'fecha',
  DATETIME: 'fecha y hora',
  ENUM: 'lista',
};
const RELATION_LABELS: Record<string, string> = {
  MANY_TO_ONE: 'pertenece a',
  ONE_TO_ONE: 'uno a uno con',
  MANY_TO_MANY: 'muchos a muchos con',
};
const OPERATION_LABELS: Record<string, string> = {
  LIST: 'listar',
  GET: 'consultar',
  CREATE: 'crear',
  UPDATE: 'editar',
  DELETE: 'eliminar',
};

export function ImplementationPlanDetail({ content }: { content: ImplementationPlanContent }) {
  const names = new Map(content.entities.map((e) => [e.localId, e.name]));
  const muted = 'text-muted-foreground';
  return (
    <div className="mt-2 flex flex-col gap-3 border-t border-border pt-2 text-sm">
      <div className={muted}>
        <strong className="text-foreground">Autenticación:</strong>{' '}
        {content.authentication.required
          ? `requerida${content.authentication.roles.length ? ` · roles: ${content.authentication.roles.join(', ')}` : ''}`
          : 'no requerida'}
      </div>
      {content.modules.map((module) => (
        <div key={module.localId}>
          <strong>{module.name}</strong> <span className={muted}>— {module.description}</span>
          <ul className="mt-1 flex flex-col gap-1 pl-3">
            {content.entities
              .filter((entity) => entity.moduleLocalId === module.localId)
              .map((entity) => (
                <li key={entity.localId}>
                  <span className="font-mono text-xs">{entity.name}</span>
                  <span className={muted}>
                    {' '}
                    ·{' '}
                    {entity.fields
                      .map(
                        (f) =>
                          `${f.name} (${TYPE_LABELS[f.type]}${f.required ? '' : ', opcional'}${f.unique ? ', único' : ''})`,
                      )
                      .join(', ')}
                  </span>
                  {entity.relations.length ? (
                    <div className={muted}>
                      Relaciones:{' '}
                      {entity.relations
                        .map(
                          (r) =>
                            `${r.name} ${RELATION_LABELS[r.kind]} ${names.get(r.targetEntityLocalId)}`,
                        )
                        .join('; ')}
                    </div>
                  ) : null}
                  <div className={muted}>
                    Operaciones:{' '}
                    {entity.operations.length
                      ? entity.operations.map((o) => OPERATION_LABELS[o]).join(', ')
                      : 'ninguna expuesta'}
                    {entity.writeRoles.length
                      ? ` · escritura: ${entity.writeRoles.join(', ')}`
                      : ''}
                  </div>
                </li>
              ))}
          </ul>
        </div>
      ))}
      {content.customEndpoints.length ? (
        <div>
          <strong>Endpoints de negocio</strong>
          <ul className={`mt-1 ${muted}`}>
            {content.customEndpoints.map((e) => (
              <li key={`${e.method} ${e.path}`}>
                <span className="font-mono text-xs text-foreground">
                  {e.method} {e.path}
                </span>{' '}
                — {e.summary}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {content.routes.length ? (
        <div>
          <strong>Pantallas del frontend</strong>
          <ul className={`mt-1 ${muted}`}>
            {content.routes.map((r) => (
              <li key={r.path}>
                <span className="font-mono text-xs text-foreground">{r.path}</span> — {r.screenName}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {content.envVars.length ? (
        <div className={muted}>
          <strong className="text-foreground">Variables de entorno:</strong>{' '}
          {content.envVars.map((v) => v.name).join(', ')}
        </div>
      ) : null}
      {content.tests.length ? (
        <div className={muted}>
          <strong className="text-foreground">Pruebas planificadas:</strong> {content.tests.length}
        </div>
      ) : null}
    </div>
  );
}

// Read-only preview of the deterministic Prisma schema and OpenAPI contract
// the plan will generate, so reviewers approve exactly what gets built.
export function ImplementationPlanArtifacts({
  projectId,
  planId,
}: {
  projectId: string;
  planId: string;
}) {
  const [open, setOpen] = useState<'prisma' | 'openapi' | null>(null);
  const artifacts = useQuery({
    queryKey: ['implementation-plan-artifacts', projectId, planId],
    queryFn: () => api.structuredAnalysis.implementationPlanArtifacts(projectId, planId),
    enabled: open !== null,
  });
  const text =
    open === 'prisma'
      ? artifacts.data?.databaseSchema
      : open === 'openapi'
        ? JSON.stringify(artifacts.data?.openApi, null, 2)
        : undefined;
  return (
    <div className="mt-2 flex flex-col gap-2">
      <div className="flex flex-wrap gap-2">
        {(
          [
            ['prisma', 'Esquema Prisma'],
            ['openapi', 'Contrato OpenAPI'],
          ] as const
        ).map(([key, label]) => (
          <Button
            key={key}
            type="button"
            variant={open === key ? 'secondary' : 'outline'}
            size="sm"
            onClick={() => setOpen(open === key ? null : key)}
          >
            <Code2 className="size-3.5" aria-hidden="true" />
            {label}
          </Button>
        ))}
      </div>
      {open === null ? null : artifacts.isLoading ? (
        <p className="text-xs text-muted-foreground">Generando vista previa…</p>
      ) : artifacts.error ? (
        <p className="text-xs text-destructive">
          {artifacts.error instanceof ApiError
            ? artifacts.error.message
            : 'No se pudo generar la vista previa.'}
        </p>
      ) : (
        <pre className="max-h-96 overflow-auto rounded-md border border-border bg-muted/40 p-3 font-mono text-xs">
          {text}
        </pre>
      )}
    </div>
  );
}
