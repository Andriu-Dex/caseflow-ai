'use client';

import { BATCHED_STRUCTURED_KINDS } from '@caseflow-ai/contracts';
import { GenerationOverlay } from './generation-overlay';
import { BatchedGenerationPanel } from './batched-generation-panel';
import { useQueries, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  NAVIGATION_NODE_KINDS,
  type ClassDiagramContent,
  type ConceptualDomainModelContent,
  type DesignThemeContent,
  type DiagramResponse,
  type GenerationPlanContent,
  type ImplementationPlanContent,
  type NavigationTreeContent,
  type SoftwareArchitectureContent,
  type StructuredAnalysisKind,
  type StructuredAnalysisResponse,
  type SystemArchitectureContent,
  type UiBlueprintContent,
} from '@caseflow-ai/contracts';
import {
  ArrowRight,
  Box,
  CheckCircle2,
  Compass,
  CornerDownRight,
  Cpu,
  Database,
  Eye,
  EyeOff,
  FileCode,
  FileEdit,
  FileText,
  FolderTree,
  Globe,
  Home,
  Layers,
  Layout,
  Link2,
  ListFilter,
  Pencil,
  Plus,
  Search,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { Button, Card, CardContent, CardHeader, CardTitle } from '@caseflow-ai/ui';
import { api, ApiError, type ArtifactVersionStatus, type GenerationResult } from '../lib/api';
import { QueryState } from './query-state';
import { ArchivedArtifacts } from './archived-artifacts';
import { PageHeading } from './page-heading';
import { StatusBadge } from './status-badge';
import { CandidateReview } from './candidate-review';
import {
  NavigationManualForm,
  SoftwareArchitectureManualForm,
  SystemArchitectureManualForm,
  UiBlueprintManualForm,
} from './structured-manual-forms';
import {
  CLASS_RELATIONSHIP_LABELS,
  CLASS_STEREOTYPE_LABELS,
  ClassDiagramManualForm,
  ConceptualDomainModelManualForm,
  GenerationPlanManualForm,
} from './construction-manual-forms';
import { ImplementationPlanManualForm } from './implementation-plan-manual-form';
import { DesignThemeManualForm, DesignThemePreview } from './design-theme';
import {
  ImplementationPlanArtifacts,
  ImplementationPlanDetail,
} from './implementation-plan-detail';
import { DiagramViewer } from './diagram-viewer';
import {
  AiUnavailableHint,
  ApproveAllButton,
  ArchiveButton,
  EmptyState,
  approveDirectly,
  isPendingApproval,
} from './artifact-actions';

const MANUAL_FORMS: Record<
  StructuredAnalysisKind,
  (props: {
    projectId: string;
    initial?: StructuredAnalysisResponse;
    onCreated: () => void;
    onCancel: () => void;
  }) => React.JSX.Element
> = {
  NAVIGATION_TREE: NavigationManualForm,
  SOFTWARE_ARCHITECTURE: SoftwareArchitectureManualForm,
  SYSTEM_ARCHITECTURE: SystemArchitectureManualForm,
  UI_BLUEPRINT: UiBlueprintManualForm,
  GENERATION_PLAN: GenerationPlanManualForm,
  CONCEPTUAL_DOMAIN_MODEL: ConceptualDomainModelManualForm,
  IMPLEMENTATION_PLAN: ImplementationPlanManualForm,
  DESIGN_THEME: DesignThemeManualForm,
  CLASS_DIAGRAM: ClassDiagramManualForm,
};

type SourceType =
  | 'REQUIREMENT'
  | 'USE_CASE'
  | 'DATA_MODEL'
  | 'CLASS_DIAGRAM'
  | 'NAVIGATION_TREE'
  | 'SOFTWARE_ARCHITECTURE'
  | 'SYSTEM_ARCHITECTURE'
  | 'UI_BLUEPRINT'
  | 'GENERATION_PLAN';

// Mirrors the backend's ELIGIBLE_SOURCE_TYPES (structured-analysis.service.ts),
// which stays the authority: it rejects anything outside this set.
const ELIGIBLE_SOURCES: Record<StructuredAnalysisKind, SourceType[]> = {
  NAVIGATION_TREE: ['REQUIREMENT', 'USE_CASE', 'DATA_MODEL'],
  SOFTWARE_ARCHITECTURE: ['REQUIREMENT', 'USE_CASE', 'DATA_MODEL', 'NAVIGATION_TREE'],
  SYSTEM_ARCHITECTURE: ['REQUIREMENT', 'USE_CASE', 'DATA_MODEL', 'NAVIGATION_TREE'],
  UI_BLUEPRINT: [
    'NAVIGATION_TREE',
    'USE_CASE',
    'DATA_MODEL',
    'SOFTWARE_ARCHITECTURE',
    'SYSTEM_ARCHITECTURE',
  ],
  GENERATION_PLAN: [
    'REQUIREMENT',
    'USE_CASE',
    'DATA_MODEL',
    'CLASS_DIAGRAM',
    'NAVIGATION_TREE',
    'SOFTWARE_ARCHITECTURE',
    'SYSTEM_ARCHITECTURE',
    'UI_BLUEPRINT',
  ],
  CONCEPTUAL_DOMAIN_MODEL: [
    'GENERATION_PLAN',
    'REQUIREMENT',
    'USE_CASE',
    'DATA_MODEL',
    'CLASS_DIAGRAM',
  ],
  // Sources come from the chosen Design Baseline, not from this picker.
  IMPLEMENTATION_PLAN: [],
  DESIGN_THEME: ['REQUIREMENT', 'UI_BLUEPRINT'],
  CLASS_DIAGRAM: ['REQUIREMENT', 'USE_CASE', 'DATA_MODEL'],
};

const SOURCE_LABELS: Record<SourceType, string> = {
  REQUIREMENT: 'Requisitos',
  USE_CASE: 'Casos de uso',
  DATA_MODEL: 'Modelo de datos',
  CLASS_DIAGRAM: 'Diagrama de clases',
  NAVIGATION_TREE: 'Navegación',
  SOFTWARE_ARCHITECTURE: 'Arquitectura de software',
  SYSTEM_ARCHITECTURE: 'Arquitectura de sistema',
  UI_BLUEPRINT: 'Plano de interfaz',
  GENERATION_PLAN: 'Plan de generación',
};

// Kinds whose backend renders a diagram (structured-analysis.service KIND_CONFIG).
const KINDS_WITH_DIAGRAM: ReadonlySet<StructuredAnalysisKind> = new Set([
  'CLASS_DIAGRAM',
  'NAVIGATION_TREE',
  'SOFTWARE_ARCHITECTURE',
  'SYSTEM_ARCHITECTURE',
]);

export const NAVIGATION_NODE_LABELS: Record<
  (typeof NAVIGATION_NODE_KINDS)[number],
  { label: string; color: string; icon: React.ComponentType<{ className?: string }> }
> = {
  HOME: {
    label: 'Inicio',
    color: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/20',
    icon: Home,
  },
  SECTION: {
    label: 'Sección',
    color: 'bg-indigo-500/10 text-indigo-700 dark:text-indigo-400 border-indigo-500/20',
    icon: FolderTree,
  },
  LIST: {
    label: 'Listado',
    color: 'bg-purple-500/10 text-purple-700 dark:text-purple-400 border-purple-500/20',
    icon: ListFilter,
  },
  DETAIL: {
    label: 'Detalle',
    color: 'bg-sky-500/10 text-sky-700 dark:text-sky-400 border-sky-500/20',
    icon: FileText,
  },
  FORM: {
    label: 'Formulario',
    color: 'bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/20',
    icon: FileEdit,
  },
  VIEW: {
    label: 'Vista',
    color: 'bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-500/20',
    icon: Layout,
  },
  AUTH: {
    label: 'Autenticación',
    color: 'bg-rose-500/10 text-rose-700 dark:text-rose-400 border-rose-500/20',
    icon: ShieldCheck,
  },
  OTHER: {
    label: 'Otro',
    color: 'bg-slate-500/10 text-slate-700 dark:text-slate-400 border-slate-500/20',
    icon: Compass,
  },
};

interface SourceOption {
  versionId: string;
  code: string;
  name: string;
}

async function loadApprovedSources(projectId: string, type: SourceType): Promise<SourceOption[]> {
  const approved = <T extends { version: { status: string } }>(items: T[]) =>
    items.filter((i) => i.version.status === 'APPROVED');
  switch (type) {
    case 'REQUIREMENT':
      return approved((await api.requirements.list(projectId)).items).map((r) => ({
        versionId: r.version.id,
        code: r.code,
        name: r.requirement.name,
      }));
    case 'USE_CASE':
      return approved((await api.useCases.list(projectId)).items).map((u) => ({
        versionId: u.version.id,
        code: u.code,
        name: u.useCase.name,
      }));
    case 'DATA_MODEL':
      return approved((await api.dataModels.list(projectId)).items).map((m) => ({
        versionId: m.version.id,
        code: m.code,
        name: m.dataModel.title,
      }));
    default:
      return approved((await api.structuredAnalysis.list(projectId, type)).items).map((s) => ({
        versionId: s.version.id,
        code: s.code,
        name: s.title,
      }));
  }
}

interface ArtifactMetric {
  singular: string;
  plural: string;
  count: number;
  icon: React.ComponentType<{ className?: string }>;
}

function getArtifactMetrics(kind: StructuredAnalysisKind, content: unknown): ArtifactMetric[] {
  if (!content || typeof content !== 'object') return [];
  if (kind === 'CLASS_DIAGRAM') {
    const cd = content as ClassDiagramContent;
    return [
      { singular: 'clase', plural: 'clases', count: cd.classes?.length ?? 0, icon: Box },
      {
        singular: 'relación',
        plural: 'relaciones',
        count: cd.relationships?.length ?? 0,
        icon: Link2,
      },
    ];
  }
  if (kind === 'NAVIGATION_TREE') {
    const nt = content as NavigationTreeContent;
    const nodes = nt.nodes ?? [];
    const routesCount = nodes.filter((n) => Boolean(n.route)).length;
    const metrics: ArtifactMetric[] = [
      {
        singular: 'pantalla o nodo',
        plural: 'pantallas y nodos',
        count: nodes.length,
        icon: Layers,
      },
    ];
    if (routesCount > 0) {
      metrics.push({
        singular: 'ruta web',
        plural: 'rutas web',
        count: routesCount,
        icon: Globe,
      });
    }
    return metrics;
  }
  if (kind === 'SOFTWARE_ARCHITECTURE') {
    const sa = content as SoftwareArchitectureContent;
    const metrics: ArtifactMetric[] = [
      {
        singular: 'componente',
        plural: 'componentes',
        count: sa.components?.length ?? 0,
        icon: Box,
      },
      {
        singular: 'dependencia',
        plural: 'dependencias',
        count: sa.dependencies?.length ?? 0,
        icon: Link2,
      },
    ];
    if (sa.decisions && sa.decisions.length > 0) {
      metrics.push({
        singular: 'decisión',
        plural: 'decisiones',
        count: sa.decisions.length,
        icon: ShieldCheck,
      });
    }
    return metrics;
  }
  if (kind === 'SYSTEM_ARCHITECTURE') {
    const sa = content as SystemArchitectureContent;
    return [
      { singular: 'nodo', plural: 'nodos', count: sa.nodes?.length ?? 0, icon: Box },
      { singular: 'enlace', plural: 'enlaces', count: sa.links?.length ?? 0, icon: Link2 },
    ];
  }
  if (kind === 'UI_BLUEPRINT') {
    const ub = content as UiBlueprintContent;
    return [
      { singular: 'pantalla', plural: 'pantallas', count: ub.screens?.length ?? 0, icon: Layers },
    ];
  }
  return [];
}

type NavigationNode = NavigationTreeContent['nodes'][number];

function NavigationNodeCard({
  node,
  isRoot,
  parentLabel,
}: {
  node: NavigationNode;
  isRoot?: boolean;
  parentLabel?: string;
}) {
  const meta = NAVIGATION_NODE_LABELS[node.kind] ?? NAVIGATION_NODE_LABELS.OTHER;
  const Icon = meta.icon;

  return (
    <div
      className={`flex flex-col gap-1.5 rounded-lg border border-border/80 bg-card p-3 shadow-2xs transition-colors hover:border-border ${
        isRoot ? 'ring-1 ring-primary/10' : ''
      }`}
    >
      <div className="flex flex-wrap items-center justify-between gap-1.5">
        <div className="flex items-center gap-1.5 min-w-0">
          <Icon className="size-4 text-primary shrink-0" aria-hidden="true" />
          <span className="font-semibold text-sm text-foreground truncate">{node.label}</span>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <span
            className={`inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px] font-semibold ${meta.color}`}
          >
            <Icon className="size-3" aria-hidden="true" />
            {meta.label}
          </span>
          {node.route ? (
            <span
              className="inline-flex items-center gap-1 rounded bg-muted px-1.5 py-0.5 font-mono text-[11px] font-medium text-foreground border border-border/40"
              title={`Ruta URL: ${node.route}`}
            >
              <Globe className="size-3 text-muted-foreground" aria-hidden="true" />
              {node.route}
            </span>
          ) : null}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
        <span className="flex items-center gap-1 font-mono text-xs text-muted-foreground">
          <FileCode className="size-3 text-muted-foreground/70" aria-hidden="true" />
          {node.viewName}
        </span>
        {parentLabel ? (
          <span className="text-muted-foreground">
            En sección: <strong className="text-foreground font-normal">{parentLabel}</strong>
          </span>
        ) : null}
      </div>

      {node.description ? (
        <p className="text-xs text-muted-foreground line-clamp-2">{node.description}</p>
      ) : null}

      {node.relatedUseCaseCodes?.length > 0 || (node.relatedSourceCodes?.length ?? 0) > 0 ? (
        <div className="flex flex-wrap items-center gap-2 pt-1.5 border-t border-border/30 text-[11px]">
          {node.relatedUseCaseCodes?.length > 0 ? (
            <div className="flex flex-wrap items-center gap-1">
              <span className="text-muted-foreground">Casos de uso:</span>
              {node.relatedUseCaseCodes.map((code) => (
                <span
                  key={code}
                  className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-mono font-medium text-primary border border-primary/20"
                >
                  {code}
                </span>
              ))}
            </div>
          ) : null}
          {node.relatedSourceCodes && node.relatedSourceCodes.length > 0 ? (
            <div className="flex flex-wrap items-center gap-1">
              <span className="text-muted-foreground">Fuentes:</span>
              {node.relatedSourceCodes.map((code) => (
                <span
                  key={code}
                  className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-mono font-medium text-muted-foreground"
                >
                  {code}
                </span>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function NavigationTreeDetail({ content }: { content: NavigationTreeContent }) {
  const [query, setQuery] = useState('');
  const nodes = content.nodes ?? [];

  const nodeMap = new Map(nodes.map((n) => [n.localId, n]));
  const childrenMap = new Map<string, typeof nodes>();
  const rootNodes: typeof nodes = [];

  for (const node of nodes) {
    if (node.parentLocalId && nodeMap.has(node.parentLocalId)) {
      const list = childrenMap.get(node.parentLocalId) ?? [];
      list.push(node);
      childrenMap.set(node.parentLocalId, list);
    } else {
      rootNodes.push(node);
    }
  }

  const trimmed = query.trim().toLowerCase();
  const isFiltering = trimmed.length > 0;
  const filteredNodes = isFiltering
    ? nodes.filter((n) => {
        const text = [
          n.label,
          n.route ?? '',
          n.viewName,
          n.description ?? '',
          n.kind,
          NAVIGATION_NODE_LABELS[n.kind]?.label ?? '',
          ...(n.relatedUseCaseCodes ?? []),
          ...(n.relatedSourceCodes ?? []),
        ]
          .join(' ')
          .toLowerCase();
        return text.includes(trimmed);
      })
    : [];

  return (
    <div className="mt-4 flex flex-col gap-3 border-t border-border/60 pt-4 text-xs">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
          <FolderTree className="size-3.5 text-primary" aria-hidden="true" />
          Estructura de navegación ({nodes.length} {nodes.length === 1 ? 'nodo' : 'nodos'})
        </h4>
        {nodes.length > 2 ? (
          <div className="relative w-full sm:w-64">
            <Search
              className="pointer-events-none absolute left-2.5 top-2.5 size-3.5 text-muted-foreground"
              aria-hidden="true"
            />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar por nombre, ruta, vista o CU…"
              className="h-8 w-full rounded-md border border-input bg-background pl-8 pr-3 text-xs placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            />
          </div>
        ) : null}
      </div>

      {isFiltering ? (
        <div className="flex flex-col gap-2">
          <div className="text-xs text-muted-foreground">
            {filteredNodes.length === 1
              ? '1 coincidencia'
              : `${filteredNodes.length} coincidencias`}
          </div>
          {filteredNodes.length === 0 ? (
            <p className="rounded-md border border-dashed border-border p-4 text-center text-xs text-muted-foreground">
              No se encontraron nodos ni pantallas que coincidan con «{query}».
            </p>
          ) : (
            <div className="grid gap-2 sm:grid-cols-2">
              {filteredNodes.map((node) => (
                <NavigationNodeCard
                  key={node.localId}
                  node={node}
                  parentLabel={
                    node.parentLocalId ? nodeMap.get(node.parentLocalId)?.label : undefined
                  }
                />
              ))}
            </div>
          )}
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {rootNodes.map((root) => {
            const children = childrenMap.get(root.localId) ?? [];
            return (
              <div
                key={root.localId}
                className="rounded-lg border border-border/80 bg-muted/20 p-3 shadow-2xs transition-colors hover:border-border"
              >
                <NavigationNodeCard node={root} isRoot />

                {children.length > 0 ? (
                  <div className="mt-2.5 flex flex-col gap-2 border-l-2 border-border/70 pl-3 sm:pl-4 ml-2 sm:ml-3">
                    {children.map((child) => (
                      <div key={child.localId} className="flex items-start gap-1.5">
                        <CornerDownRight
                          className="size-3.5 text-muted-foreground mt-2 shrink-0"
                          aria-hidden="true"
                        />
                        <div className="flex-1 min-w-0">
                          <NavigationNodeCard node={child} parentLabel={root.label} />
                        </div>
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function SoftwareArchitectureDetail({ content }: { content: SoftwareArchitectureContent }) {
  const [query, setQuery] = useState('');
  const { style, components = [], dependencies = [], decisions = [] } = content;

  const componentNames = new Map(components.map((c) => [c.localId, c.name]));

  const trimmed = query.trim().toLowerCase();
  const isFiltering = trimmed.length > 0;
  const filteredComponents = isFiltering
    ? components.filter((c) => {
        const text = [
          c.name,
          c.layerLocalId ?? '',
          ...(c.responsibilities ?? []),
          ...(c.relatedSourceCodes ?? []),
        ]
          .join(' ')
          .toLowerCase();
        return text.includes(trimmed);
      })
    : components;

  return (
    <div className="mt-4 flex flex-col gap-4 border-t border-border/60 pt-4 text-xs">
      {/* Architectural Style Banner */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-primary/20 bg-primary/5 p-3 sm:p-3.5 shadow-2xs">
        <div className="flex items-center gap-2.5">
          <div className="rounded-md bg-primary/10 p-2 text-primary">
            <Cpu className="size-4" aria-hidden="true" />
          </div>
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Estilo arquitectónico
            </div>
            <div className="text-sm font-bold text-foreground">{style}</div>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="rounded-md bg-background px-2 py-1 font-medium text-muted-foreground border border-border/60">
            {components.length} componentes
          </span>
          <span className="rounded-md bg-background px-2 py-1 font-medium text-muted-foreground border border-border/60">
            {dependencies.length} dependencias
          </span>
          {decisions.length > 0 ? (
            <span className="rounded-md bg-background px-2 py-1 font-medium text-muted-foreground border border-border/60">
              {decisions.length} decisiones
            </span>
          ) : null}
        </div>
      </div>

      {/* Components Section */}
      <div>
        <div className="mb-2.5 flex flex-wrap items-center justify-between gap-2">
          <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
            <Box className="size-3.5 text-primary" aria-hidden="true" />
            Componentes del software ({components.length})
          </h4>
          {components.length > 1 ? (
            <div className="relative w-full sm:w-64">
              <Search
                className="pointer-events-none absolute left-2.5 top-2.5 size-3.5 text-muted-foreground"
                aria-hidden="true"
              />
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Buscar componente, capa o función…"
                className="h-8 w-full rounded-md border border-input bg-background pl-8 pr-3 text-xs placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              />
            </div>
          ) : null}
        </div>

        {isFiltering && filteredComponents.length === 0 ? (
          <p className="rounded-md border border-dashed border-border p-4 text-center text-xs text-muted-foreground">
            No se encontraron componentes que coincidan con «{query}».
          </p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {filteredComponents.map((component) => (
              <div
                key={component.localId}
                className="flex flex-col rounded-lg border border-border/80 bg-muted/20 p-3 shadow-2xs transition-colors hover:border-border"
              >
                <div className="flex flex-wrap items-center justify-between gap-1.5 pb-2 border-b border-border/40">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <Box className="size-3.5 text-primary shrink-0" aria-hidden="true" />
                    <span className="font-semibold text-sm text-foreground truncate">
                      {component.name}
                    </span>
                  </div>
                  {component.layerLocalId ? (
                    <span className="inline-flex items-center gap-1 rounded-md border border-indigo-500/20 bg-indigo-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-indigo-700 dark:text-indigo-400">
                      <Layers className="size-2.5" aria-hidden="true" />
                      {component.layerLocalId}
                    </span>
                  ) : null}
                </div>

                {component.responsibilities.length > 0 ? (
                  <div className="mt-2.5 flex flex-col gap-1.5">
                    <span className="text-[11px] font-medium text-muted-foreground">
                      Responsabilidades:
                    </span>
                    <ul className="flex flex-col gap-1 text-xs text-muted-foreground">
                      {component.responsibilities.map((resp, ri) => (
                        <li key={ri} className="flex items-start gap-1.5">
                          <CheckCircle2
                            className="size-3 text-primary mt-0.5 shrink-0"
                            aria-hidden="true"
                          />
                          <span className="text-foreground/90">{resp}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}

                {component.relatedSourceCodes && component.relatedSourceCodes.length > 0 ? (
                  <div className="mt-2.5 flex flex-wrap items-center gap-1 pt-1.5 border-t border-border/30 text-[11px]">
                    <span className="text-muted-foreground">Fuentes:</span>
                    {component.relatedSourceCodes.map((sc) => (
                      <span
                        key={sc}
                        className="rounded bg-muted px-1.5 py-0.5 font-mono font-medium text-foreground"
                      >
                        {sc}
                      </span>
                    ))}
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Dependencies Section */}
      {dependencies.length > 0 ? (
        <div>
          <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
            <Link2 className="size-3.5 text-primary" aria-hidden="true" />
            Dependencias entre componentes ({dependencies.length})
          </h4>
          <div className="flex flex-col gap-2">
            {dependencies.map((dep, di) => {
              const fromName = componentNames.get(dep.fromLocalId) ?? dep.fromLocalId;
              const toName = componentNames.get(dep.toLocalId) ?? dep.toLocalId;
              return (
                <div
                  key={di}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border/70 bg-muted/20 px-3 py-2 text-xs"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-md bg-background px-2 py-0.5 border border-border font-semibold text-foreground">
                      {fromName}
                    </span>
                    <div className="flex items-center gap-1 text-muted-foreground">
                      <span className="h-px w-3 bg-border" />
                      <span className="rounded-full bg-primary/10 px-2 py-0.5 text-primary text-[11px] font-medium">
                        {dep.description || 'Depende de'}
                      </span>
                      <ArrowRight className="size-3 text-primary" aria-hidden="true" />
                      <span className="h-px w-3 bg-border" />
                    </div>
                    <span className="rounded-md bg-background px-2 py-0.5 border border-border font-semibold text-foreground">
                      {toName}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : null}

      {/* Decisions Section (ADRs) */}
      {decisions.length > 0 ? (
        <div>
          <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
            <ShieldCheck className="size-3.5 text-primary" aria-hidden="true" />
            Decisiones arquitectónicas ({decisions.length})
          </h4>
          <div className="flex flex-col gap-2">
            {decisions.map((decision, di) => (
              <div
                key={di}
                className="flex items-start gap-2.5 rounded-lg border border-border/70 bg-muted/20 p-3 text-xs"
              >
                <span className="shrink-0 rounded bg-primary/10 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-primary">
                  ADR-{String(di + 1).padStart(3, '0')}
                </span>
                <p className="flex-1 text-foreground leading-relaxed">{decision}</p>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function renderContentDetail(kind: StructuredAnalysisKind, content: unknown) {
  switch (kind) {
    case 'NAVIGATION_TREE': {
      return <NavigationTreeDetail content={content as NavigationTreeContent} />;
    }
    case 'SOFTWARE_ARCHITECTURE': {
      return <SoftwareArchitectureDetail content={content as SoftwareArchitectureContent} />;
    }
    case 'SYSTEM_ARCHITECTURE': {
      const { boundary, nodes, links } = content as SystemArchitectureContent;
      return (
        <div className="mt-2 flex flex-col gap-2 border-t border-border pt-2 text-sm">
          <p>
            <strong>Límite del sistema:</strong> {boundary}
          </p>
          <ul className="flex flex-col gap-1">
            {nodes.map((node) => (
              <li key={node.localId}>
                <strong>{node.name}</strong>{' '}
                <span className="text-muted-foreground">({node.kind})</span>
                {node.responsibilities.length > 0 ? (
                  <span className="text-muted-foreground">
                    {' '}
                    — {node.responsibilities.join('; ')}
                  </span>
                ) : null}
                {node.relatedSourceCodes?.length ? (
                  <span className="text-muted-foreground">
                    {' '}
                    · Fuentes: {node.relatedSourceCodes.join(', ')}
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
          {links.length > 0 ? (
            <ul className="flex flex-col gap-1 text-muted-foreground">
              {links.map((link, i) => (
                <li key={i}>
                  {link.fromLocalId} → {link.toLocalId}
                  {link.protocol ? ` (${link.protocol})` : ''}
                  {link.description ? `: ${link.description}` : ''}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      );
    }
    case 'UI_BLUEPRINT': {
      const { screens } = content as UiBlueprintContent;
      return (
        <ul className="mt-2 flex flex-col gap-2 border-t border-border pt-2 text-sm">
          {screens.map((screen) => (
            <li key={screen.localId}>
              <strong>{screen.name}</strong> — {screen.purpose}
              {screen.relatedSourceCodes?.length ? (
                <div className="text-muted-foreground">
                  Fuentes: {screen.relatedSourceCodes.join(', ')}
                </div>
              ) : null}
              {screen.targetActors.length > 0 ? (
                <div className="text-muted-foreground">
                  Actores: {screen.targetActors.join(', ')}
                </div>
              ) : null}
              {screen.sections.length > 0 ? (
                <div className="text-muted-foreground">Secciones: {screen.sections.join(', ')}</div>
              ) : null}
              {screen.primaryActions.length > 0 ? (
                <div className="text-muted-foreground">
                  Acciones principales: {screen.primaryActions.join(', ')}
                </div>
              ) : null}
              {screen.secondaryActions.length > 0 ? (
                <div className="text-muted-foreground">
                  Acciones secundarias: {screen.secondaryActions.join(', ')}
                </div>
              ) : null}
              {screen.principalData.length > 0 ? (
                <div className="text-muted-foreground">
                  Datos principales: {screen.principalData.join(', ')}
                </div>
              ) : null}
              {screen.forms.length > 0 ? (
                <div className="text-muted-foreground">Formularios: {screen.forms.join(', ')}</div>
              ) : null}
              {screen.states.length > 0 ? (
                <div className="text-muted-foreground">Estados: {screen.states.join(', ')}</div>
              ) : null}
            </li>
          ))}
        </ul>
      );
    }
    case 'GENERATION_PLAN': {
      const plan = content as GenerationPlanContent;
      const muted = 'text-muted-foreground';
      return (
        <div className="mt-2 flex flex-col gap-3 border-t border-border pt-2 text-sm">
          <p>{plan.summary}</p>
          <div>
            <strong>Módulos</strong>
            <ul className="mt-1 flex flex-col gap-1">
              {plan.modules.map((module) => (
                <li key={module.localId}>
                  <strong>{module.name}</strong> — {module.purpose}
                  {module.entityNames.length > 0 ? (
                    <div className={muted}>Entidades: {module.entityNames.join(', ')}</div>
                  ) : null}
                  {module.relatedRequirementCodes.length + module.relatedUseCaseCodes.length > 0 ? (
                    <div className={muted}>
                      Trazabilidad:{' '}
                      {[...module.relatedRequirementCodes, ...module.relatedUseCaseCodes].join(
                        ', ',
                      )}
                    </div>
                  ) : null}
                </li>
              ))}
            </ul>
          </div>
          {plan.actors.length > 0 ? (
            <div>
              <strong>Actores</strong>
              <ul className="mt-1">
                {plan.actors.map((actor) => (
                  <li key={actor.name}>
                    {actor.name}
                    {actor.permissions.length > 0 ? (
                      <span className={muted}> — {actor.permissions.join(', ')}</span>
                    ) : null}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {plan.workflows.length > 0 ? (
            <div>
              <strong>Flujos principales</strong>
              <ul className="mt-1">
                {plan.workflows.map((workflow) => (
                  <li key={workflow.localId}>
                    {workflow.name}
                    <span className={muted}> — {workflow.steps.join(' → ')}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {plan.screens.length > 0 ? (
            <div className={muted}>
              <strong className="text-foreground">Pantallas:</strong>{' '}
              {plan.screens.map((screen) => screen.name).join(', ')}
            </div>
          ) : null}
          <div className={muted}>
            <strong className="text-foreground">Autenticación:</strong>{' '}
            {plan.authentication.required
              ? [plan.authentication.strategy, plan.authentication.roles.join(', ')]
                  .filter(Boolean)
                  .join(' · ') || 'Requerida'
              : 'No requerida'}
          </div>
          {plan.integrations.length > 0 ? (
            <div className={muted}>
              <strong className="text-foreground">Integraciones:</strong>{' '}
              {plan.integrations.map((integration) => integration.name).join(', ')}
            </div>
          ) : null}
          {plan.technicalConstraints.length > 0 ? (
            <div className={muted}>
              <strong className="text-foreground">Restricciones técnicas:</strong>{' '}
              {plan.technicalConstraints.join('; ')}
            </div>
          ) : null}
          {plan.risks.length > 0 ? (
            <div>
              <strong>Riesgos</strong>
              <ul className="mt-1">
                {plan.risks.map((risk) => (
                  <li key={risk.description}>
                    {risk.description}
                    {risk.mitigation ? (
                      <span className={muted}> — Mitigación: {risk.mitigation}</span>
                    ) : null}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      );
    }
    case 'CLASS_DIAGRAM': {
      const { classes, relationships } = content as ClassDiagramContent;
      const names = new Map(classes.map((cls) => [cls.localId, cls.name]));
      return (
        <div className="mt-4 flex flex-col gap-4 border-t border-border/60 pt-4 text-xs">
          <div>
            <h4 className="mb-2.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
              <Box className="size-3.5 text-primary" aria-hidden="true" />
              Clases del dominio ({classes.length})
            </h4>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {classes.map((cls) => {
                const stereotypeColor =
                  cls.stereotype === 'ENTITY'
                    ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/20'
                    : cls.stereotype === 'VALUE_OBJECT'
                      ? 'bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-500/20'
                      : cls.stereotype === 'ABSTRACT'
                        ? 'bg-purple-500/10 text-purple-700 dark:text-purple-400 border-purple-500/20'
                        : 'bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/20';

                return (
                  <div
                    key={cls.localId}
                    className="flex flex-col rounded-lg border border-border/80 bg-muted/20 p-3 shadow-2xs transition-colors hover:border-border"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-1.5 pb-2 border-b border-border/40">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <Box className="size-3.5 text-primary shrink-0" aria-hidden="true" />
                        <span className="font-semibold text-sm text-foreground truncate">
                          {cls.name}
                        </span>
                      </div>
                      <span
                        className={`rounded-md border px-1.5 py-0.5 text-[10px] font-semibold ${stereotypeColor}`}
                      >
                        {CLASS_STEREOTYPE_LABELS[cls.stereotype]}
                      </span>
                    </div>

                    {cls.dataModelEntityName ? (
                      <div className="mt-2 flex items-center gap-1 text-[11px] text-muted-foreground">
                        <Database className="size-3 text-primary/70 shrink-0" aria-hidden="true" />
                        <span>Entidad:</span>
                        <span className="font-semibold text-foreground font-mono">
                          {cls.dataModelEntityName}
                        </span>
                      </div>
                    ) : null}

                    {cls.description ? (
                      <p className="mt-1 text-xs text-muted-foreground line-clamp-2">
                        {cls.description}
                      </p>
                    ) : null}

                    {cls.attributes.length > 0 ? (
                      <div className="mt-2.5 flex flex-col gap-1">
                        <span className="text-[11px] font-medium text-muted-foreground">
                          Atributos ({cls.attributes.length}):
                        </span>
                        <ul className="flex flex-col gap-1 text-xs">
                          {cls.attributes.map((attr, ai) => {
                            const visSymbol =
                              attr.visibility === 'PUBLIC'
                                ? '+'
                                : attr.visibility === 'PRIVATE'
                                  ? '-'
                                  : '#';
                            const visColor =
                              attr.visibility === 'PUBLIC'
                                ? 'text-emerald-600 dark:text-emerald-400'
                                : attr.visibility === 'PRIVATE'
                                  ? 'text-red-500 dark:text-red-400'
                                  : 'text-amber-500 dark:text-amber-400';
                            return (
                              <li
                                key={ai}
                                className="flex flex-wrap items-center justify-between gap-1 rounded bg-background/80 px-2 py-1 border border-border/40 font-mono text-xs"
                              >
                                <div className="flex items-center gap-1">
                                  <span className={`font-bold ${visColor}`}>{visSymbol}</span>
                                  <span className="font-medium text-foreground">{attr.name}</span>
                                </div>
                                <div className="flex items-center gap-1 text-[10px]">
                                  <span className="rounded bg-muted px-1 py-0.5 text-muted-foreground">
                                    {attr.type}
                                  </span>
                                  {attr.required ? (
                                    <span
                                      className="rounded bg-blue-500/15 text-blue-700 dark:text-blue-400 font-semibold px-1"
                                      title="Requerido"
                                    >
                                      REQ
                                    </span>
                                  ) : null}
                                </div>
                              </li>
                            );
                          })}
                        </ul>
                      </div>
                    ) : null}

                    {cls.methods.length > 0 ? (
                      <div className="mt-2 flex flex-col gap-1">
                        <span className="text-[11px] font-medium text-muted-foreground">
                          Métodos ({cls.methods.length}):
                        </span>
                        <ul className="flex flex-col gap-1 text-xs">
                          {cls.methods.map((method, mi) => {
                            const visSymbol =
                              method.visibility === 'PUBLIC'
                                ? '+'
                                : method.visibility === 'PRIVATE'
                                  ? '-'
                                  : '#';
                            const visColor =
                              method.visibility === 'PUBLIC'
                                ? 'text-emerald-600 dark:text-emerald-400'
                                : method.visibility === 'PRIVATE'
                                  ? 'text-red-500 dark:text-red-400'
                                  : 'text-amber-500 dark:text-amber-400';
                            const paramsText = method.parameters
                              .map((p) => `${p.name}: ${p.type}`)
                              .join(', ');
                            return (
                              <li
                                key={mi}
                                className="flex flex-wrap items-center justify-between gap-1 rounded bg-background/80 px-2 py-1 border border-border/40 font-mono text-xs"
                              >
                                <div className="flex items-center gap-1">
                                  <span className={`font-bold ${visColor}`}>{visSymbol}</span>
                                  <span className="font-medium text-foreground">
                                    {method.name}({paramsText})
                                  </span>
                                </div>
                                {method.returnType ? (
                                  <span className="text-primary font-semibold text-[11px]">
                                    : {method.returnType}
                                  </span>
                                ) : null}
                              </li>
                            );
                          })}
                        </ul>
                      </div>
                    ) : null}

                    {cls.relatedSourceCodes?.length ? (
                      <div className="mt-2.5 flex flex-wrap items-center gap-1 pt-1.5 border-t border-border/30 text-[11px]">
                        <span className="text-muted-foreground">Fuentes:</span>
                        {cls.relatedSourceCodes.map((sc) => (
                          <span
                            key={sc}
                            className="rounded bg-muted px-1.5 py-0.5 font-mono font-medium text-foreground"
                          >
                            {sc}
                          </span>
                        ))}
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </div>

          {relationships.length > 0 ? (
            <div>
              <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                <Link2 className="size-3.5 text-primary" aria-hidden="true" />
                Relaciones UML ({relationships.length})
              </h4>
              <div className="flex flex-col gap-2">
                {relationships.map((rel, ri) => {
                  const fromName = names.get(rel.fromLocalId) ?? rel.fromLocalId;
                  const toName = names.get(rel.toLocalId) ?? rel.toLocalId;
                  return (
                    <div
                      key={ri}
                      className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border/70 bg-muted/20 px-3 py-2 text-xs"
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <div className="flex items-center gap-1.5 font-medium">
                          <span className="rounded-md bg-background px-2 py-0.5 border border-border font-semibold text-foreground">
                            {fromName}
                          </span>
                          {rel.fromMultiplicity ? (
                            <span className="font-mono text-muted-foreground text-[11px] font-semibold">
                              [{rel.fromMultiplicity}]
                            </span>
                          ) : null}
                        </div>
                        <div className="flex items-center gap-1 text-muted-foreground">
                          <span className="h-px w-3 bg-border" />
                          <span className="rounded-full bg-primary/10 px-2 py-0.5 text-primary text-[11px] font-medium">
                            {CLASS_RELATIONSHIP_LABELS[rel.kind]}
                            {rel.label ? ` · ${rel.label}` : ''}
                          </span>
                          <span className="text-primary font-bold">→</span>
                          <span className="h-px w-3 bg-border" />
                        </div>
                        <div className="flex items-center gap-1.5 font-medium">
                          {rel.toMultiplicity ? (
                            <span className="font-mono text-muted-foreground text-[11px] font-semibold">
                              [{rel.toMultiplicity}]
                            </span>
                          ) : null}
                          <span className="rounded-md bg-background px-2 py-0.5 border border-border font-semibold text-foreground">
                            {toName}
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : null}
        </div>
      );
    }
    case 'DESIGN_THEME':
      return <DesignThemePreview content={content as DesignThemeContent} />;
    case 'IMPLEMENTATION_PLAN':
      return <ImplementationPlanDetail content={content as ImplementationPlanContent} />;
    case 'CONCEPTUAL_DOMAIN_MODEL': {
      const { entities, relationships } = content as ConceptualDomainModelContent;
      const names = new Map(entities.map((entity) => [entity.localId, entity.name]));
      const CARDINALITY: Record<string, string> = {
        ONE_TO_ONE: '1 a 1',
        ONE_TO_MANY: '1 a muchos',
        MANY_TO_MANY: 'muchos a muchos',
      };
      return (
        <div className="mt-2 flex flex-col gap-3 border-t border-border pt-2 text-sm">
          <ul className="flex flex-col gap-2">
            {entities.map((entity) => (
              <li key={entity.localId}>
                <strong>{entity.name}</strong>
                {entity.moduleName ? (
                  <span className="text-muted-foreground"> · {entity.moduleName}</span>
                ) : null}
                {entity.classLocalId ? (
                  <span className="text-muted-foreground"> · clase {entity.classLocalId}</span>
                ) : null}{' '}
                — {entity.description}
                <div className="text-muted-foreground">
                  Atributos:{' '}
                  {entity.attributes
                    .map(
                      (attribute) => `${attribute.name}${attribute.required ? '' : ' (opcional)'}`,
                    )
                    .join(', ')}
                </div>
              </li>
            ))}
          </ul>
          {relationships.length > 0 ? (
            <div>
              <strong>Relaciones</strong>
              <ul className="mt-1 text-muted-foreground">
                {relationships.map((relationship) => (
                  <li
                    key={`${relationship.fromLocalId}-${relationship.toLocalId}-${relationship.name}`}
                  >
                    {names.get(relationship.fromLocalId)} {relationship.name}{' '}
                    {names.get(relationship.toLocalId)} (
                    {CARDINALITY[relationship.cardinality] ?? relationship.cardinality})
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      );
    }
  }
}

// Shared page for the four StructuredAnalysis kinds (Navegación,
// Arquitectura de software, Arquitectura de sistema, UI Blueprint).
// What each kind generated in batches is called in the progress card.
const BATCHED_LABELS: Partial<Record<StructuredAnalysisKind, string>> = {
  CLASS_DIAGRAM: 'el diagrama de clases',
  UI_BLUEPRINT: 'el plano de interfaz',
  CONCEPTUAL_DOMAIN_MODEL: 'el modelo conceptual',
  GENERATION_PLAN: 'el plan de generación',
  IMPLEMENTATION_PLAN: 'el plan de implementación',
};

export function StructuredKindPage({
  kind,
  title,
  projectId,
}: {
  kind: StructuredAnalysisKind;
  title: string;
  projectId: string;
}) {
  const queryClient = useQueryClient();
  const list = useQuery({
    queryKey: ['structured-analysis', kind, projectId],
    queryFn: () => api.structuredAnalysis.list(projectId, kind),
  });
  const sourceTypes = ELIGIBLE_SOURCES[kind];
  const sourceQueries = useQueries({
    queries: sourceTypes.map((type) => ({
      queryKey: ['eligible-sources', type, projectId],
      queryFn: () => loadApprovedSources(projectId, type),
    })),
  });
  const sourceGroups = sourceTypes
    .map((type, i) => ({ type, options: sourceQueries[i]?.data ?? [] }))
    .filter((g) => g.options.length > 0);
  const allSourceIds = sourceGroups.flatMap((g) => g.options.map((o) => o.versionId));

  const [selected, setSelected] = useState<string[] | null>(null);
  const selectedIds = selected ?? allSourceIds;
  const [generation, setGeneration] = useState<GenerationResult | null>(null);
  const [diagrams, setDiagrams] = useState<Record<string, DiagramResponse>>({});
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [showManualForm, setShowManualForm] = useState(false);
  const [editing, setEditing] = useState<StructuredAnalysisResponse | null>(null);
  const [generating, setGenerating] = useState(false);
  const [approvingId, setApprovingId] = useState<string | null>(null);
  // Optional adjustment the AI applies to every proposal (theme only).
  const [instruction, setInstruction] = useState('');
  const isTheme = kind === 'DESIGN_THEME';
  // DEC-142: some kinds are generated in batches, in the background.
  const batched = (BATCHED_STRUCTURED_KINDS as readonly string[]).includes(kind);
  const ManualForm = MANUAL_FORMS[kind];
  // An Implementation Plan starts from an approved Design Baseline (the
  // backend resolves its frozen versions as sources), not a free selection.
  const usesBaseline = kind === 'IMPLEMENTATION_PLAN';
  const baselines = useQuery({
    queryKey: ['design-baselines', projectId],
    queryFn: () => api.designBaselines.list(projectId),
    enabled: usesBaseline,
  });
  const [baselineId, setBaselineId] = useState<string | null>(null);
  const chosenBaselineId = baselineId ?? baselines.data?.items[0]?.id ?? null;

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: ['structured-analysis', kind, projectId] });
    queryClient.invalidateQueries({ queryKey: ['eligible-sources'] });
    queryClient.invalidateQueries({ queryKey: ['readiness', projectId] });
    queryClient.invalidateQueries({ queryKey: ['archived-artifacts', projectId] });
    setDiagrams({});
    setExpandedId(null);
  }

  function toggleSource(id: string) {
    setSelected(
      selectedIds.includes(id) ? selectedIds.filter((x) => x !== id) : [...selectedIds, id],
    );
  }

  async function generate() {
    if (usesBaseline) {
      if (!chosenBaselineId) return;
      setGenerating(true);
      try {
        setGeneration(
          await api.structuredAnalysis.generateImplementationPlan(projectId, chosenBaselineId),
        );
      } catch (err) {
        toast.error(err instanceof ApiError ? err.message : 'No se pudo generar la propuesta.');
      } finally {
        setGenerating(false);
      }
      return;
    }
    if (!selectedIds.length) {
      toast.info('Seleccione al menos un elemento aprobado como base para la generación.');
      return;
    }
    setGenerating(true);
    try {
      setGeneration(
        await api.structuredAnalysis.generate(
          projectId,
          kind,
          selectedIds,
          isTheme ? instruction.trim() || undefined : undefined,
        ),
      );
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'No se pudo generar la propuesta.');
    } finally {
      setGenerating(false);
    }
  }

  const transitionFor = (item: StructuredAnalysisResponse) => (status: ArtifactVersionStatus) =>
    api.structuredAnalysis.transition(projectId, kind, item.id, item.version.id, status);

  async function approveOne(item: StructuredAnalysisResponse) {
    setApprovingId(item.id);
    try {
      await approveDirectly(transitionFor(item));
      toast.success(`${item.code} aprobado.`);
      invalidate();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'No se pudo aprobar.');
    } finally {
      setApprovingId(null);
    }
  }

  async function transition(item: StructuredAnalysisResponse, status: ArtifactVersionStatus) {
    try {
      await transitionFor(item)(status);
      invalidate();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'No se pudo cambiar el estado.');
    }
  }

  async function toggleDiagram(id: string) {
    if (diagrams[id]) {
      setDiagrams((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
      return;
    }
    try {
      const diagram = await api.structuredAnalysis.getDiagram(projectId, kind, id);
      setDiagrams((prev) => ({ ...prev, [id]: diagram }));
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'No se pudo mostrar el diagrama.');
    }
  }

  const items = list.data?.items ?? [];
  const pending = items.filter((i) => isPendingApproval(i.version.status));
  const loadingSources = sourceQueries.some((q) => q.isLoading);

  return (
    <div className="flex flex-col gap-6">
      <PageHeading title={title} projectId={projectId} />

      <Card className="rounded-xl border border-border/80 bg-card shadow-2xs">
        <CardHeader>
          <CardTitle className="flex flex-wrap items-center justify-between gap-2 text-sm">
            <span className="flex items-center gap-2">
              <Sparkles className="size-4 text-primary" aria-hidden="true" />
              Generar con IA
            </span>
            <ApproveAllButton
              pending={pending}
              approve={(id) => approveDirectly(transitionFor(items.find((i) => i.id === id)!))}
              onDone={invalidate}
            />
          </CardTitle>
        </CardHeader>
        <CardContent>
          {usesBaseline ? (
            baselines.isLoading ? (
              <p className="text-sm text-muted-foreground">Cargando diseños aprobados…</p>
            ) : baselines.data?.items.length ? (
              <label className="flex flex-col gap-1 text-sm">
                <span className="text-xs text-muted-foreground">
                  La IA propone el plan a partir de las versiones congeladas en el diseño aprobado:
                </span>
                <select
                  className="rounded-md border border-input bg-background px-2 py-1.5"
                  value={chosenBaselineId ?? ''}
                  onChange={(e) => setBaselineId(e.target.value)}
                >
                  {baselines.data.items.map((baseline, index) => (
                    <option key={baseline.id} value={baseline.id}>
                      {baseline.label}
                      {index === 0 ? ' (vigente)' : ''}
                    </option>
                  ))}
                </select>
              </label>
            ) : (
              <p className="text-sm text-muted-foreground">
                Primero apruebe y congele el diseño en «Aprobación de diseño»; el plan de
                implementación siempre parte de un diseño aprobado.
              </p>
            )
          ) : loadingSources ? (
            <p className="text-sm text-muted-foreground">Cargando información aprobada…</p>
          ) : sourceGroups.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              La IA trabaja a partir de lo ya aprobado en{' '}
              {sourceTypes.map((t) => SOURCE_LABELS[t].toLowerCase()).join(', ')}. Cuando haya
              elementos aprobados, aparecerán aquí para elegirlos.
            </p>
          ) : (
            <>
              <div className="mb-1 flex items-center justify-between">
                <p className="text-xs text-muted-foreground">
                  Elija qué información aprobada usar como base:
                </p>
                <Button
                  variant="link"
                  size="sm"
                  type="button"
                  className="text-xs font-medium"
                  onClick={() =>
                    setSelected(selectedIds.length === allSourceIds.length ? [] : allSourceIds)
                  }
                >
                  {selectedIds.length === allSourceIds.length
                    ? 'Quitar selección'
                    : 'Seleccionar todo'}
                </Button>
              </div>
              <div className="flex max-h-72 flex-col gap-3 overflow-y-auto rounded-lg border border-border/70 bg-muted/20 p-3 text-xs">
                {sourceGroups.map((group) => (
                  <fieldset key={group.type}>
                    <legend className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      {SOURCE_LABELS[group.type]}
                    </legend>
                    <ul className="flex flex-col gap-1 text-sm">
                      {group.options.map((o) => (
                        <li key={o.versionId}>
                          <label className="flex cursor-pointer items-center gap-2">
                            <input
                              type="checkbox"
                              checked={selectedIds.includes(o.versionId)}
                              onChange={() => toggleSource(o.versionId)}
                            />
                            <span>
                              <span className="font-mono text-xs text-muted-foreground">
                                {o.code}
                              </span>{' '}
                              {o.name}
                            </span>
                          </label>
                        </li>
                      ))}
                    </ul>
                  </fieldset>
                ))}
              </div>
            </>
          )}
          {isTheme ? (
            <label className="mt-3 flex flex-col gap-1 text-sm">
              <span className="text-xs text-muted-foreground">
                Ajuste opcional para las tres propuestas:
              </span>
              <input
                className="rounded-md border border-input bg-background px-2 py-1.5"
                maxLength={500}
                placeholder="Por ejemplo: más cálida, verde corporativo, tonos sobrios"
                value={instruction}
                onChange={(e) => setInstruction(e.target.value)}
              />
            </label>
          ) : null}
          {sourceGroups.length > 0 ? (
            <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-border/50 pt-2.5 text-xs text-muted-foreground">
              <span>Insumos para generación:</span>
              {sourceGroups.map((group) => (
                <span
                  key={group.type}
                  className="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-0.5 font-medium text-foreground"
                >
                  <CheckCircle2
                    className="size-3 text-emerald-600 dark:text-emerald-400"
                    aria-hidden="true"
                  />
                  {group.options.length} {SOURCE_LABELS[group.type].toLowerCase()}
                </span>
              ))}
            </div>
          ) : null}
          <div className="mt-3 flex flex-wrap gap-2">
            {batched ? (
              <BatchedGenerationPanel
                queryKey={['structured-generation-job', kind, projectId]}
                latest={() => api.structuredAnalysis.latestGenerationJob(projectId, kind)}
                start={() =>
                  usesBaseline
                    ? api.structuredAnalysis.startImplementationPlanJob(
                        projectId,
                        chosenBaselineId!,
                      )
                    : api.structuredAnalysis.startGenerationJob(projectId, kind, selectedIds)
                }
                fetchGeneration={(generationId) =>
                  api.structuredAnalysis.generation(projectId, kind, generationId)
                }
                jobSelection={(job) =>
                  usesBaseline
                    ? job.designBaselineId
                      ? [job.designBaselineId]
                      : []
                    : job.sourceVersionIds
                }
                selection={
                  usesBaseline ? (chosenBaselineId ? [chosenBaselineId] : []) : selectedIds
                }
                onCompleted={setGeneration}
                title={`Generando ${BATCHED_LABELS[kind] ?? 'el artefacto'} por lotes`}
                progressLabel={`Lotes de ${BATCHED_LABELS[kind] ?? 'el artefacto'} validados`}
                startLabel={() => 'Generar'}
              >
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="gap-1.5 h-9 px-4"
                  onClick={() => {
                    setEditing(null);
                    setShowManualForm((v) => !v);
                  }}
                >
                  <Plus className="size-4" aria-hidden="true" />
                  Crear manualmente
                </Button>
              </BatchedGenerationPanel>
            ) : (
              <>
                <Button
                  type="button"
                  variant="default"
                  size="sm"
                  disabled={
                    generating || (usesBaseline ? !chosenBaselineId : sourceGroups.length === 0)
                  }
                  onClick={generate}
                  className="gap-2 bg-primary text-primary-foreground hover:bg-primary/90 h-9 px-4"
                >
                  <Sparkles className="size-4" aria-hidden="true" />
                  {generating ? 'Generando…' : 'Generar'}
                </Button>
                <GenerationOverlay open={generating} />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="gap-1.5 h-9 px-4"
                  onClick={() => {
                    setEditing(null);
                    setShowManualForm((v) => !v);
                  }}
                >
                  <Plus className="size-4" aria-hidden="true" />
                  Crear manualmente
                </Button>
              </>
            )}
          </div>
          <AiUnavailableHint />
        </CardContent>
      </Card>

      {showManualForm || editing ? (
        <ManualForm
          key={editing?.id ?? 'new'}
          projectId={projectId}
          initial={editing ?? undefined}
          onCreated={() => {
            invalidate();
            setShowManualForm(false);
            setEditing(null);
          }}
          onCancel={() => {
            setShowManualForm(false);
            setEditing(null);
          }}
        />
      ) : null}

      {generation ? (
        <CandidateReview
          generation={generation}
          describe={(c) => String(c.title ?? c.name ?? c.candidateId)}
          renderDetail={
            isTheme
              ? (c) => <DesignThemePreview content={c.content as DesignThemeContent} />
              : undefined
          }
          // Theme proposals are alternatives: the user keeps one of them.
          defaultSelected={isTheme ? generation.candidates.slice(0, 1).map((c) => c.id) : undefined}
          onAccept={async (ids) => {
            await api.structuredAnalysis.accept(projectId, kind, generation.id, ids);
            invalidate();
          }}
          onDismiss={() => setGeneration(null)}
        />
      ) : null}

      <QueryState isLoading={list.isLoading} error={list.error}>
        {items.length === 0 ? (
          <EmptyState title={`Aún no hay ${title.toLowerCase()}`}>
            Genérela con IA a partir de lo aprobado en pasos anteriores, o créela manualmente.
          </EmptyState>
        ) : (
          <ul className="flex flex-col gap-3">
            {items.map((item) => {
              const metrics = getArtifactMetrics(kind, item.content);
              return (
                <li key={item.id}>
                  <Card className="overflow-hidden border border-border/80 shadow-2xs transition-all hover:border-border">
                    <CardContent className="p-4 sm:p-5">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="space-y-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="inline-flex items-center rounded-md bg-muted px-2 py-0.5 font-mono text-xs font-semibold text-foreground border border-border/60">
                              {item.code}
                            </span>
                            <h3 className="text-base font-semibold text-foreground">
                              {item.title}
                            </h3>
                          </div>
                          {metrics.length > 0 ? (
                            <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                              {metrics.map((m) => {
                                const Icon = m.icon;
                                return (
                                  <span
                                    key={m.singular}
                                    className="inline-flex items-center gap-1 rounded-full bg-primary/5 px-2.5 py-0.5 text-xs font-medium text-primary border border-primary/10"
                                  >
                                    <Icon className="size-3 text-primary/80" aria-hidden="true" />
                                    <span>
                                      {m.count} {m.count === 1 ? m.singular : m.plural}
                                    </span>
                                  </span>
                                );
                              })}
                            </div>
                          ) : null}
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          <StatusBadge status={item.version.status} />
                          {isPendingApproval(item.version.status) ? (
                            <Button
                              type="button"
                              size="sm"
                              className="bg-emerald-600 text-white hover:bg-emerald-700 shadow-2xs"
                              disabled={approvingId === item.id}
                              onClick={() => approveOne(item)}
                            >
                              <CheckCircle2 className="mr-1 size-3.5" aria-hidden="true" />
                              {approvingId === item.id ? 'Aprobando…' : 'Aprobar'}
                            </Button>
                          ) : null}
                          {item.version.status === 'IN_REVIEW' ? (
                            <>
                              <Button
                                type="button"
                                size="sm"
                                className="bg-emerald-600 text-white hover:bg-emerald-700 shadow-2xs"
                                onClick={() => transition(item, 'APPROVED')}
                              >
                                <CheckCircle2 className="mr-1 size-3.5" aria-hidden="true" />
                                Aprobar
                              </Button>
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                className="border-destructive/40 text-destructive hover:bg-destructive/5"
                                onClick={() => transition(item, 'CHANGES_REQUESTED')}
                              >
                                Solicitar cambios
                              </Button>
                            </>
                          ) : null}
                          <Button
                            variant="outline"
                            size="sm"
                            type="button"
                            onClick={() => {
                              setShowManualForm(false);
                              setEditing(item);
                            }}
                            className="inline-flex items-center gap-1 rounded-md text-xs text-muted-foreground hover:bg-muted/60"
                          >
                            <Pencil className="size-3.5" aria-hidden="true" />
                            Editar
                          </Button>
                          <ArchiveButton
                            projectId={projectId}
                            artifactId={item.id}
                            code={item.code}
                            onDone={invalidate}
                          />
                        </div>
                      </div>

                      <div className="mt-3 flex flex-wrap items-center gap-2 pt-2 border-t border-border/50">
                        {isTheme ? null : (
                          <Button
                            variant={expandedId === item.id ? 'secondary' : 'outline'}
                            size="sm"
                            type="button"
                            onClick={() => setExpandedId(expandedId === item.id ? null : item.id)}
                            aria-expanded={expandedId === item.id}
                            className="h-8 gap-1.5 text-xs"
                          >
                            <Layers className="size-3.5 text-muted-foreground" aria-hidden="true" />
                            {expandedId === item.id ? 'Ocultar detalle' : 'Ver detalle'}
                          </Button>
                        )}
                        {/* UI Blueprint has no diagram: its visual form is the Mockup step. */}
                        {KINDS_WITH_DIAGRAM.has(kind) ? (
                          <Button
                            variant={diagrams[item.id] ? 'secondary' : 'outline'}
                            size="sm"
                            type="button"
                            onClick={() => toggleDiagram(item.id)}
                            className="h-8 gap-1.5 text-xs text-primary"
                          >
                            {diagrams[item.id] ? (
                              <EyeOff className="size-3.5" aria-hidden="true" />
                            ) : (
                              <Eye className="size-3.5" aria-hidden="true" />
                            )}
                            {diagrams[item.id] ? 'Ocultar diagrama' : 'Ver diagrama'}
                          </Button>
                        ) : null}
                      </div>

                      {/* A theme is judged by looking at it: its preview is always shown. */}
                      {expandedId === item.id || isTheme ? (
                        <div className="mt-3">{renderContentDetail(kind, item.content)}</div>
                      ) : null}
                      {expandedId === item.id && kind === 'IMPLEMENTATION_PLAN' ? (
                        <ImplementationPlanArtifacts projectId={projectId} planId={item.id} />
                      ) : null}
                      {diagrams[item.id] ? (
                        <div className="mt-4 pt-3 border-t border-border/60">
                          <DiagramViewer
                            svg={diagrams[item.id]!.svg}
                            source={diagrams[item.id]!.source}
                            sourceFormat={diagrams[item.id]!.sourceFormat}
                            code={item.code}
                            caption={`${title} — ${item.code}`}
                            pngUrl={api.structuredAnalysis.diagramPngUrl(projectId, kind, item.id)}
                          />
                        </div>
                      ) : null}
                    </CardContent>
                  </Card>
                </li>
              );
            })}
          </ul>
        )}
      </QueryState>

      <ArchivedArtifacts projectId={projectId} types={[kind]} onRestored={invalidate} />
    </div>
  );
}
