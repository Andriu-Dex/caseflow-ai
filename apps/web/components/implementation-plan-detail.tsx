'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Code2, Database, Globe, Key, Layout, Lock, Package, TestTube, Unlock } from 'lucide-react';
import type {
  ConstructionPreviewResponse,
  ImplementationPlanContent,
} from '@caseflow-ai/contracts';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
  Button,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@caseflow-ai/ui';
import { toast } from 'sonner';
import { api, ApiError } from '../lib/api';
import { ConstructionContainerCards } from './construction-container-cards';
import { ProjectStructureTree } from './project-structure-tree';

const TYPE_LABELS: Record<string, string> = {
  STRING: 'texto',
  TEXT: 'texto largo',
  INT: 'entero',
  DECIMAL: 'decimal',
  BOOLEAN: 'booleano',
  DATE: 'fecha',
  DATETIME: 'fecha y hora',
  ENUM: 'enum',
};
const OPERATION_LABELS: Record<string, string> = {
  LIST: 'listar',
  GET: 'consultar',
  CREATE: 'crear',
  UPDATE: 'editar',
  DELETE: 'eliminar',
};

function PreviewNotice({
  preview,
}: {
  preview: ReturnType<typeof useQuery<ConstructionPreviewResponse>>;
}) {
  if (preview.isLoading)
    return (
      <p className="rounded-lg border border-border/70 bg-muted/30 p-3 text-xs text-muted-foreground">
        Cargando la vista previa de construcción…
      </p>
    );
  if (preview.error)
    return (
      <p className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-xs text-destructive">
        {preview.error instanceof ApiError
          ? preview.error.message
          : 'No se pudo cargar la vista previa de construcción.'}
      </p>
    );
  return null;
}

function Description({ text }: { text: string }) {
  const [expanded, setExpanded] = useState(false);
  const isLong = text.length > 140;
  return (
    <p className="text-xs leading-snug text-muted-foreground">
      {expanded || !isLong ? text : `${text.slice(0, 140)}…`}
      {isLong ? (
        <Button
          type="button"
          variant="link"
          size="sm"
          className="ml-1 h-auto p-0 text-xs"
          onClick={() => setExpanded((value) => !value)}
          aria-expanded={expanded}
        >
          {expanded ? 'Ver menos' : 'Ver más'}
        </Button>
      ) : null}
    </p>
  );
}

function ModuleDetail({
  module,
  content,
  preview,
}: {
  module: ImplementationPlanContent['modules'][number];
  content: ImplementationPlanContent;
  preview?: ConstructionPreviewResponse;
}) {
  const entities = (content.entities ?? []).filter(
    (entity) => entity.moduleLocalId === module.localId,
  );
  const routes = (content.routes ?? []).filter((route) => route.moduleLocalId === module.localId);
  const endpoints = (content.customEndpoints ?? []).filter(
    (endpoint) => endpoint.moduleLocalId === module.localId,
  );
  const files = preview?.files.filter((file) => file.moduleLocalId === module.localId) ?? [];
  return (
    <Tabs defaultValue="data" className="mt-3">
      <TabsList className="h-auto w-full flex-wrap justify-start">
        <TabsTrigger value="data">Datos</TabsTrigger>
        <TabsTrigger value="screens">Pantallas</TabsTrigger>
        <TabsTrigger value="api">API</TabsTrigger>
        <TabsTrigger value="files">Archivos</TabsTrigger>
        <TabsTrigger value="sources">Fuentes</TabsTrigger>
      </TabsList>
      <TabsContent value="data" className="pt-3">
        <Accordion type="multiple">
          {entities.map((entity) => (
            <AccordionItem key={entity.localId} value={entity.localId}>
              <AccordionTrigger>
                {entity.name} ({entity.fields.length} campos)
              </AccordionTrigger>
              <AccordionContent>
                <p className="mb-2 text-xs text-muted-foreground">{entity.description}</p>
                <ul className="space-y-1 text-xs">
                  {entity.fields.map((field) => (
                    <li key={field.name}>
                      <span className="font-mono text-foreground">{field.name}</span>{' '}
                      <span className="text-muted-foreground">
                        ({TYPE_LABELS[field.type] ?? field.type}
                        {field.required ? ', obligatorio' : ''}
                        {field.unique ? ', único' : ''})
                      </span>
                    </li>
                  ))}
                </ul>
                {entity.relations.length ? (
                  <p className="mt-2 text-xs text-muted-foreground">
                    Relaciones: {entity.relations.map((relation) => relation.name).join(', ')}
                  </p>
                ) : null}
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
        {!entities.length ? (
          <p className="text-xs text-muted-foreground">Este módulo no define entidades.</p>
        ) : null}
      </TabsContent>
      <TabsContent value="screens" className="pt-3">
        <Accordion type="multiple">
          {routes.map((route) => (
            <AccordionItem key={route.path} value={route.path}>
              <AccordionTrigger>
                {route.screenName} · {route.path}
              </AccordionTrigger>
              <AccordionContent>
                <p className="text-xs text-muted-foreground">
                  {route.actions
                    .map(
                      (action) =>
                        `${action.label}: ${action.operation ? OPERATION_LABELS[action.operation] : action.endpoint}`,
                    )
                    .join(' · ') || 'Sin acciones declaradas'}
                </p>
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
        {!routes.length ? (
          <p className="text-xs text-muted-foreground">Este módulo no define pantallas.</p>
        ) : null}
      </TabsContent>
      <TabsContent value="api" className="pt-3">
        <Accordion type="multiple">
          {endpoints.map((endpoint) => (
            <AccordionItem
              key={`${endpoint.method}-${endpoint.path}`}
              value={`${endpoint.method}-${endpoint.path}`}
            >
              <AccordionTrigger>
                {endpoint.method} {endpoint.path}
              </AccordionTrigger>
              <AccordionContent>
                <p className="text-xs text-muted-foreground">
                  {endpoint.summary}
                  {endpoint.roles.length ? ` · Roles: ${endpoint.roles.join(', ')}` : ''}
                </p>
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
        {!endpoints.length ? (
          <p className="text-xs text-muted-foreground">Este módulo no define endpoints propios.</p>
        ) : null}
      </TabsContent>
      <TabsContent value="files" className="pt-3">
        <Accordion type="multiple">
          {files.map((file) => (
            <AccordionItem key={file.path} value={file.path}>
              <AccordionTrigger>
                <span className="font-mono">{file.path}</span>
              </AccordionTrigger>
              <AccordionContent>
                <p className="text-xs text-muted-foreground">
                  {file.purpose}
                  {file.routePath
                    ? ` · ${file.routePath}`
                    : file.endpoint
                      ? ` · ${file.endpoint}`
                      : ''}
                </p>
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
        {!preview ? (
          <p className="text-xs text-muted-foreground">
            La vista previa de archivos estará disponible al cargar el cálculo de construcción.
          </p>
        ) : !files.length ? (
          <p className="text-xs text-muted-foreground">
            No hay archivos previstos para este módulo.
          </p>
        ) : null}
      </TabsContent>
      <TabsContent value="sources" className="pt-3">
        <Accordion type="single" collapsible>
          <AccordionItem value="sources">
            <AccordionTrigger>Fuentes de planificación</AccordionTrigger>
            <AccordionContent>
              <p className="text-xs text-muted-foreground">
                Las entidades, rutas y endpoints aprobados del plan son la fuente de este módulo.
              </p>
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </TabsContent>
    </Tabs>
  );
}

export function ImplementationPlanDetail({
  content,
  projectId,
  implementationPlanVersionId,
}: {
  content: ImplementationPlanContent;
  projectId?: string;
  implementationPlanVersionId?: string;
}) {
  const modules = content.modules ?? [];
  const auth = content.authentication ?? { required: false, roles: [] };
  const [selectedModuleId, setSelectedModuleId] = useState(modules[0]?.localId);
  const previewErrorNotified = useRef(false);
  const preview = useQuery({
    queryKey: ['construction-preview', projectId, implementationPlanVersionId],
    queryFn: () => api.generationRuns.preview(projectId!, implementationPlanVersionId!),
    enabled: Boolean(projectId && implementationPlanVersionId),
    retry: false,
  });
  useEffect(() => {
    if (preview.error && !previewErrorNotified.current) {
      previewErrorNotified.current = true;
      toast.error(
        preview.error instanceof ApiError
          ? preview.error.message
          : 'No se pudo cargar la vista previa de construcción.',
      );
    }
  }, [preview.error]);
  const previewModules = useMemo(
    () => new Map(preview.data?.modules.map((module) => [module.localId, module])),
    [preview.data],
  );
  return (
    <div className="flex flex-col gap-5 pt-1 text-sm">
      <div className="rounded-xl border border-primary/20 bg-primary/5 p-4">
        <div className="flex items-center gap-2">
          <Code2 className="size-4 text-primary" />
          <div>
            <h4 className="font-semibold text-foreground">
              Plan de Implementación y Arquitectura Física
            </h4>
            <p className="text-xs text-muted-foreground">
              Revise qué se construirá antes de iniciar la construcción.
            </p>
          </div>
        </div>
      </div>
      <Tabs defaultValue="summary">
        <TabsList className="h-auto w-full flex-wrap justify-start">
          <TabsTrigger value="summary">Resumen</TabsTrigger>
          <TabsTrigger value="containers">Contenedores</TabsTrigger>
          <TabsTrigger value="structure">Estructura del proyecto</TabsTrigger>
          <TabsTrigger value="technical">Detalle técnico</TabsTrigger>
        </TabsList>
        <TabsContent value="summary" className="pt-4">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border/80 bg-card p-3">
            <div className="flex items-center gap-2">
              {auth.required ? (
                <Lock className="size-4 text-primary" />
              ) : (
                <Unlock className="size-4 text-primary" />
              )}
              <span className="text-xs font-medium text-foreground">
                {auth.required ? 'Autenticación requerida' : 'Acceso público'}
              </span>
            </div>
            {auth.roles.length ? (
              <span className="flex items-center gap-1 text-xs text-muted-foreground">
                <Key className="size-3" />
                {auth.roles.join(', ')}
              </span>
            ) : null}
          </div>
          <PreviewNotice preview={preview} />
          <div className="mt-4 grid gap-3">
            {modules.map((module) => {
              const counts = previewModules.get(module.localId);
              return (
                <article
                  key={module.localId}
                  className="rounded-xl border border-border/80 bg-card p-4"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-start gap-2">
                      <Package className="mt-0.5 size-4 text-primary" />
                      <div className="min-w-0 flex-1">
                        <h5 className="font-semibold text-foreground">{module.name}</h5>
                        <Description text={module.description} />
                      </div>
                    </div>
                    <Button
                      type="button"
                      variant={selectedModuleId === module.localId ? 'secondary' : 'outline'}
                      size="sm"
                      onClick={() => setSelectedModuleId(module.localId)}
                      aria-pressed={selectedModuleId === module.localId}
                    >
                      {selectedModuleId === module.localId ? 'Detalle abierto' : 'Ver detalle'}
                    </Button>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2 text-xs text-muted-foreground">
                    <span>
                      {counts?.entities ??
                        (content.entities ?? []).filter(
                          (entity) => entity.moduleLocalId === module.localId,
                        ).length}{' '}
                      entidades
                    </span>
                    <span>
                      {counts?.routes ??
                        (content.routes ?? []).filter(
                          (route) => route.moduleLocalId === module.localId,
                        ).length}{' '}
                      pantallas
                    </span>
                    <span>
                      {counts?.endpoints ??
                        (content.customEndpoints ?? []).filter(
                          (endpoint) => endpoint.moduleLocalId === module.localId,
                        ).length}{' '}
                      acciones
                    </span>
                    <span>{counts?.files ?? '—'} archivos</span>
                  </div>
                  {selectedModuleId === module.localId ? (
                    <ModuleDetail module={module} content={content} preview={preview.data} />
                  ) : null}
                </article>
              );
            })}
          </div>
        </TabsContent>
        <TabsContent value="containers" className="pt-4">
          <PreviewNotice preview={preview} />
          {preview.data ? (
            <div className="mt-3">
              <ConstructionContainerCards containers={preview.data.containers} />
            </div>
          ) : null}
        </TabsContent>
        <TabsContent value="structure" className="pt-4">
          <PreviewNotice preview={preview} />
          {preview.data ? (
            <div className="mt-3">
              <ProjectStructureTree files={preview.data.files} modules={preview.data.modules} />
            </div>
          ) : null}
        </TabsContent>
        <TabsContent value="technical" className="pt-4">
          <TechnicalDetail content={content} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function TechnicalDetail({ content }: { content: ImplementationPlanContent }) {
  const endpoints = content.customEndpoints ?? [];
  const routes = content.routes ?? [];
  const envVars = content.envVars ?? [];
  const tests = content.tests ?? [];
  return (
    <Accordion type="multiple">
      <AccordionItem value="endpoints">
        <AccordionTrigger>
          <span className="flex items-center gap-2">
            <Globe className="size-4" />
            Endpoints ({endpoints.length})
          </span>
        </AccordionTrigger>
        <AccordionContent>
          {endpoints.map((endpoint) => (
            <p key={`${endpoint.method}-${endpoint.path}`} className="py-1 text-xs">
              <span className="font-mono font-medium">
                {endpoint.method} {endpoint.path}
              </span>{' '}
              <span className="text-muted-foreground">{endpoint.summary}</span>
            </p>
          ))}
        </AccordionContent>
      </AccordionItem>
      <AccordionItem value="routes">
        <AccordionTrigger>
          <span className="flex items-center gap-2">
            <Layout className="size-4" />
            Rutas ({routes.length})
          </span>
        </AccordionTrigger>
        <AccordionContent>
          {routes.map((route) => (
            <p key={route.path} className="py-1 text-xs">
              <span className="font-mono font-medium">{route.path}</span>{' '}
              <span className="text-muted-foreground">{route.screenName}</span>
            </p>
          ))}
        </AccordionContent>
      </AccordionItem>
      <AccordionItem value="configuration">
        <AccordionTrigger>Variables de entorno y pruebas</AccordionTrigger>
        <AccordionContent>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              {envVars.map((variable) => (
                <p key={variable.name} className="py-1 text-xs">
                  <span className="font-mono font-medium">{variable.name}</span>{' '}
                  <span className="text-muted-foreground">
                    {variable.description} ({variable.required ? 'obligatoria' : 'opcional'})
                  </span>
                </p>
              ))}
            </div>
            <div>
              {tests.map((test, index) => (
                <p key={index} className="py-1 text-xs">
                  <TestTube className="mr-1 inline size-3" />
                  {test.kind}: {test.description}
                </p>
              ))}
            </div>
          </div>
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  );
}

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
    <div className="mt-4 flex flex-col gap-3 rounded-xl border border-border/80 bg-card p-4 shadow-2xs">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/40 pb-2.5">
        <div className="flex items-center gap-2">
          <Database className="size-4 text-primary" />
          <h5 className="font-semibold text-xs text-foreground">
            Vista Previa de Esquemas Derivados
          </h5>
        </div>
        <div className="flex gap-2">
          {(
            [
              ['prisma', 'Esquema Prisma (schema.prisma)'],
              ['openapi', 'Contrato OpenAPI (openapi.json)'],
            ] as const
          ).map(([key, label]) => (
            <Button
              key={key}
              type="button"
              variant={open === key ? 'secondary' : 'outline'}
              size="sm"
              onClick={() => setOpen(open === key ? null : key)}
            >
              {label}
            </Button>
          ))}
        </div>
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
        <pre className="max-h-96 overflow-auto rounded-lg border border-border/80 bg-muted/40 p-3 text-xs">
          {text}
        </pre>
      )}
    </div>
  );
}
