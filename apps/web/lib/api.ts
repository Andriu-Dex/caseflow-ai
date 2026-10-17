import { toast } from 'sonner';
import type {
  CreateDesignBaselineRequest,
  DataModelInput,
  DesignBaselineResponse,
  GeneratedFileResponse,
  GeneratedFileSummary,
  GenerationRunResponse,
  SandboxRunResponse,
  ImplementationPlanArtifactsResponse,
  DataModelResponse,
  DiagramResponse,
  FirstDeliverableExport,
  MockupDeviceType,
  MockupJobResponse,
  MockupPreviewResponse,
  MockupResponse,
  ProjectContextCandidate,
  ProjectContextGenerationJob,
  RequirementGenerationJob,
  ProjectContextRequest,
  ProjectContextResponse,
  ListProjectsQuery,
  ProjectListResponse,
  ProjectResponse,
  ReadinessResponse,
  RequirementContextCoverageResponse,
  RequirementCoverageItem,
  RequirementInput,
  RequirementResponse,
  SourceMetadataInput,
  SourceCapabilitiesResponse,
  SourceReportJob,
  SourceReportResponse,
  SourceResponse,
  SourceListResponse,
  RequirementBulkAction,
  UseCaseBulkAction,
  UseCaseGenerationJob,
  StructuredGenerationJob,
  UseCaseBulkResponse,
  RequirementBulkResponse,
  ListSourcesQuery,
  StalenessAnalysisResponse,
  StructuredAnalysisKind,
  WorkflowRoute,
  WorkflowReviewItem,
  WorkflowRunResponse,
  StructuredAnalysisResponse,
  TraceabilityDiagramResponse,
  TraceabilityGraphResponse,
  UseCaseInput,
  UseCaseResponse,
  WorkspaceListResponse,
} from '@caseflow-ai/contracts';

const BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

export type ArtifactVersionStatus =
  'DRAFT' | 'GENERATED' | 'IN_REVIEW' | 'APPROVED' | 'CHANGES_REQUESTED';

// AI generation candidates are DB rows keyed by their own `id` (used by
// accept()), distinct from the model-assigned `candidateId` label the
// backend uses only to express dependencies within one generation batch —
// never confuse the two (spec: "AI CANDIDATE != ARTIFACT VERSION").
export interface GenerationCandidate {
  id: string;
  candidateId: string;
  name?: string;
  qualityFindings?: { severity: 'ERROR' | 'WARNING'; code: string; message: string }[];
  [key: string]: unknown;
}
// DEC-127: whether AI is configured, and what each provider can take now.
export interface AIStatus {
  available: boolean;
  providers: {
    id: string;
    maxInputTokens?: number;
    unavailableUntil?: string;
    quota?: 'MINUTE' | 'DAY';
  }[];
}

export interface GenerationResult {
  id: string;
  candidates: GenerationCandidate[];
  // Requirements only (DEC-126): how the proposals cover the context.
  coverage?: RequirementCoverageItem[];
}

// Normalized error shape for the whole app: every non-2xx response, and
// every network failure, is translated into this before reaching UI code,
// so components never need to inspect raw fetch/Response internals.
export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

let accessToken: string | null = null;
let refreshInFlight: Promise<void> | null = null;
let refreshTimer: ReturnType<typeof setTimeout> | null = null;
if (typeof window !== 'undefined') localStorage.removeItem('caseflow_token');

// Refresh one minute before the short-lived access token expires, so a long
// AI generation never starts with a token that dies mid-flight.
const REFRESH_MARGIN_MS = 60_000;
function tokenExpiryMs(token: string): number | null {
  try {
    const payload = JSON.parse(atob(token.split('.')[1]!.replace(/-/g, '+').replace(/_/g, '/')));
    return typeof payload.exp === 'number' ? payload.exp * 1000 : null;
  } catch {
    return null;
  }
}

// The signed-in user's id, read from the access token (no verification: it
// only keys per-user browser preferences such as dismissed hints).
export function currentUserId(): string | null {
  try {
    const payload = JSON.parse(
      atob(accessToken!.split('.')[1]!.replace(/-/g, '+').replace(/_/g, '/')),
    ) as { sub?: unknown };
    return typeof payload.sub === 'string' ? payload.sub : null;
  } catch {
    return null;
  }
}

export function setAccessToken(token: string | null) {
  accessToken = token;
  if (refreshTimer) clearTimeout(refreshTimer);
  refreshTimer = null;
  const expiry = token ? tokenExpiryMs(token) : null;
  if (expiry && typeof window !== 'undefined') {
    const delay = Math.max(expiry - Date.now() - REFRESH_MARGIN_MS, 0);
    refreshTimer = setTimeout(() => void refreshSession(), delay);
  }
}

// Single-flight: concurrent 401s (or the proactive timer) share one refresh,
// so the rotating refresh cookie is never presented twice.
function refreshSession(): Promise<void> {
  refreshInFlight ??= api.auth
    .refresh()
    .then(() => undefined)
    .finally(() => {
      refreshInFlight = null;
    });
  return refreshInFlight;
}

// The access token lives only in memory (never localStorage), so a full page
// reload loses it; restore it from the httpOnly refresh cookie on app start.
export async function restoreSession(): Promise<boolean> {
  if (accessToken) return true;
  try {
    await refreshSession();
    return true;
  } catch {
    return false;
  }
}

// Waits between attempts while the API is unreachable: about 15 s in total,
// enough for a development restart (node --watch) or a brief network drop.
export const RECONNECT_DELAYS_MS = [1_000, 2_000, 3_000, 4_000, 5_000];
const RECONNECT_TOAST_ID = 'api-reconnecting';

// Repeats a request the server never received, telling the user once that
// the app is reconnecting; the notice closes as soon as the API answers.
async function withReconnect(send: () => Promise<Response>): Promise<Response> {
  let notified = false;
  try {
    for (const delay of [0, ...RECONNECT_DELAYS_MS]) {
      if (delay) {
        if (!notified && typeof window !== 'undefined') {
          toast.loading('Reconectando con el servidor…', { id: RECONNECT_TOAST_ID });
          notified = true;
        }
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
      try {
        return await send();
      } catch {
        // Unreachable: try again after the next delay.
      }
    }
    throw new ApiError(NETWORK_ERROR_MESSAGE, 0);
  } finally {
    if (notified) toast.dismiss(RECONNECT_TOAST_ID);
  }
}

const NETWORK_ERROR_MESSAGE =
  'No se pudo conectar con el servidor de CASEFlow AI. Verifique que la API esté en ejecución e intente nuevamente.';

// Every call to the API — JSON, file downloads and images alike — goes
// through here, so the Bearer token, the refresh-on-401 retry and the
// redirect to /login apply uniformly. A raw <img src>/<a href> to the API can
// never carry the Authorization header, which is why those use this too.
async function authedFetch(
  url: string,
  init?: RequestInit,
  allowRefresh = true,
): Promise<Response> {
  const isFormData = typeof FormData !== 'undefined' && init?.body instanceof FormData;
  const isAuthPath = url.startsWith(`${BASE_URL}/auth/`);
  const method = (init?.method ?? 'GET').toUpperCase();
  // After a reload the token is gone: restore it before sending instead of
  // sending without one and retrying on the 401. Page queries start before
  // the provider's restore effect, so this is the one place that sees them
  // all; concurrent calls share the same refresh.
  const restored =
    accessToken !== null || isAuthPath || !allowRefresh ? true : await restoreSession();
  const send = () =>
    fetch(url, {
      ...init,
      credentials: 'include',
      headers: {
        ...(init?.body && !isFormData ? { 'Content-Type': 'application/json' } : {}),
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        ...init?.headers,
      },
    });
  // Reads, and the session refresh that precedes them, are safe to repeat
  // while the API is unreachable (in development it restarts on every file
  // change). Never repeat other writes: they could duplicate an AI
  // generation or a created artifact.
  const repeatable = method === 'GET' || url === `${BASE_URL}/auth/refresh`;
  let response: Response;
  if (repeatable) response = await withReconnect(send);
  else
    try {
      response = await send();
    } catch {
      throw new ApiError(NETWORK_ERROR_MESSAGE, 0);
    }
  if (response.ok) return response;
  // No retry when the restore just failed: there is no session to refresh.
  if (response.status === 401 && allowRefresh && restored && !isAuthPath) {
    try {
      await refreshSession();
      return authedFetch(url, init, false);
    } catch {
      setAccessToken(null);
    }
  }
  if (
    response.status === 401 &&
    typeof window !== 'undefined' &&
    window.location.pathname !== '/login' &&
    window.location.pathname !== '/register'
  ) {
    window.location.href = '/login';
  }
  throw new ApiError(await extractErrorMessage(response), response.status);
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await authedFetch(`${BASE_URL}${path}`, init);
  if (
    typeof window !== 'undefined' &&
    init?.method &&
    init.method !== 'GET' &&
    path.startsWith('/projects/')
  )
    window.dispatchEvent(new CustomEvent('caseflow:readiness-changed'));
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

export async function fetchBlob(url: string): Promise<Blob> {
  return (await authedFetch(url)).blob();
}

// Downloads an authenticated API resource as a file (the browser cannot
// attach the Bearer token to a plain <a href download>).
export async function downloadFile(url: string, filename: string): Promise<void> {
  const blobUrl = URL.createObjectURL(await fetchBlob(url));
  const anchor = document.createElement('a');
  anchor.href = blobUrl;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(blobUrl);
}

// Opens an authenticated API resource (e.g. a PDF) in a new tab, where the
// browser's own viewer previews it. The tab is opened synchronously, before
// the fetch, so pop-up blockers still treat it as a user action.
export async function openFileInNewTab(url: string): Promise<void> {
  const tab = window.open('', '_blank');
  try {
    const blobUrl = URL.createObjectURL(await fetchBlob(url));
    if (tab) tab.location.href = blobUrl;
    else window.location.assign(blobUrl);
    // The viewer has loaded the blob by then; free it afterwards.
    setTimeout(() => URL.revokeObjectURL(blobUrl), 60_000);
  } catch (err) {
    tab?.close();
    throw err;
  }
}

async function extractErrorMessage(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { message?: string | string[] };
    if (Array.isArray(body.message)) return body.message.join(' ');
    if (typeof body.message === 'string') return body.message;
  } catch {
    // Non-JSON error body: fall through to the generic message below.
  }
  return response.status === 404
    ? 'El recurso solicitado no existe.'
    : 'Ocurrió un error al comunicarse con el servidor.';
}

const get = <T>(path: string) => request<T>(path);
const post = <T>(path: string, body?: unknown) =>
  request<T>(path, { method: 'POST', body: body === undefined ? undefined : JSON.stringify(body) });
const patch = <T>(path: string, body: unknown) =>
  request<T>(path, { method: 'PATCH', body: JSON.stringify(body) });
const del = <T>(path: string, body?: unknown) =>
  request<T>(path, {
    method: 'DELETE',
    body: body === undefined ? undefined : JSON.stringify(body),
  });

/* eslint-disable @typescript-eslint/no-explicit-any */
export const api = {
  auth: {
    login: (body: any) =>
      post<any>('/auth/login', body).then((res) => {
        setAccessToken(res.accessToken);
        return res;
      }),
    register: (body: any) =>
      post<any>('/auth/register', body).then((res) => {
        setAccessToken(res.accessToken);
        return res;
      }),
    logout: () => post<any>('/auth/logout').then(() => setAccessToken(null)),
    refresh: () =>
      post<any>('/auth/refresh').then((res) => {
        setAccessToken(res.accessToken);
        return res;
      }),
  },
  workspaces: {
    list: () => get<WorkspaceListResponse>('/workspaces'),
  },
  projects: {
    list: (workspaceId: string, filters: Omit<ListProjectsQuery, 'workspaceId'> = {}) =>
      get<ProjectListResponse>(
        `/projects?${new URLSearchParams(
          Object.entries({ workspaceId, ...filters }).flatMap(([key, value]) =>
            value === undefined || value === '' ? [] : [[key, String(value)]],
          ),
        )}`,
      ),
    create: (input: {
      workspaceId: string;
      name: string;
      description?: string;
      workflowRoute?: WorkflowRoute;
    }) => post<ProjectResponse>('/projects', input),
    get: (projectId: string) => get<ProjectResponse>(`/projects/${projectId}`),
    // DEC-134: the server checks the typed name too.
    delete: (projectId: string, confirmName: string) =>
      del<void>(`/projects/${projectId}`, { confirmName }),
    archive: (projectId: string) => post<ProjectResponse>(`/projects/${projectId}/archive`),
    unarchive: (projectId: string) => post<ProjectResponse>(`/projects/${projectId}/unarchive`),
    update: (projectId: string, input: { name: string; description: string | null }) =>
      patch<ProjectResponse>(`/projects/${projectId}`, input),
    updateLanguage: (projectId: string, language: 'ES' | 'EN') =>
      post<ProjectResponse>(`/projects/${projectId}/language`, { language }),
    upgradeWorkflowRoute: (projectId: string, workflowRoute: WorkflowRoute) =>
      post<ProjectResponse>(`/projects/${projectId}/workflow-route`, { workflowRoute }),
  },
  artifacts: {
    archive: (projectId: string, artifactId: string) =>
      post<{ archivedAt: string }>(`/projects/${projectId}/artifacts/${artifactId}/archive`),
  },
  readiness: {
    get: (projectId: string) => get<ReadinessResponse>(`/projects/${projectId}/readiness`),
    confirm: (projectId: string, stage: string, note?: string) =>
      post<ReadinessResponse>(`/projects/${projectId}/stages/${stage}/confirm`, { note }),
  },
  staleness: {
    get: (projectId: string) => get<StalenessAnalysisResponse>(`/projects/${projectId}/staleness`),
  },
  traceability: {
    get: (projectId: string) =>
      get<TraceabilityGraphResponse>(`/projects/${projectId}/traceability`),
    getDiagram: (projectId: string) =>
      get<TraceabilityDiagramResponse>(`/projects/${projectId}/traceability/diagram`),
    diagramPngUrl: (projectId: string) =>
      `${BASE_URL}/projects/${projectId}/traceability/diagram/png`,
  },
  sources: {
    // Without filters, every source of the project (DEC-137).
    list: (projectId: string, filters: ListSourcesQuery = {}) => {
      const query = new URLSearchParams(
        Object.entries(filters).flatMap(([key, value]) =>
          value === undefined || value === '' ? [] : [[key, String(value)]],
        ),
      ).toString();
      return get<SourceListResponse>(`/projects/${projectId}/sources${query ? `?${query}` : ''}`);
    },
    get: (projectId: string, sourceId: string) =>
      get<SourceResponse>(`/projects/${projectId}/sources/${sourceId}`),
    getText: (projectId: string, sourceId: string) =>
      get<{ sourceVersionId: string; text: string }>(
        `/projects/${projectId}/sources/${sourceId}/text`,
      ),
    capabilities: (projectId: string) =>
      get<SourceCapabilitiesResponse>(`/projects/${projectId}/sources/capabilities`),
    downloadUrl: (projectId: string, sourceId: string) =>
      `${BASE_URL}/projects/${projectId}/sources/${sourceId}/download`,
    reExtract: (projectId: string, sourceId: string) =>
      post<SourceResponse>(`/projects/${projectId}/sources/${sourceId}/re-extract`),
    retryProcessing: (projectId: string, sourceId: string) =>
      post<SourceResponse>(`/projects/${projectId}/sources/${sourceId}/processing/retry`),
    create: (projectId: string, metadata: SourceMetadataInput, file: File | null) => {
      const form = new FormData();
      form.set('title', metadata.title);
      form.set('sourceKind', metadata.sourceKind);
      form.set('purpose', metadata.purpose);
      if (metadata.businessArea) form.set('businessArea', metadata.businessArea);
      form.set('description', metadata.description);
      if (metadata.language) form.set('language', metadata.language);
      if (file) form.set('file', file);
      return request<SourceResponse>(`/projects/${projectId}/sources`, {
        method: 'POST',
        body: form,
      });
    },
    // DEC-137: a new file as the next version of the same source.
    replaceFile: (projectId: string, sourceId: string, file: File) => {
      const form = new FormData();
      form.set('file', file);
      return request<SourceResponse>(`/projects/${projectId}/sources/${sourceId}/file`, {
        method: 'POST',
        body: form,
      });
    },
    edit: (projectId: string, sourceId: string, metadata: SourceMetadataInput) =>
      post<SourceResponse>(`/projects/${projectId}/sources/${sourceId}/edit`, metadata),
    delete: (projectId: string, sourceId: string) =>
      del<void>(`/projects/${projectId}/sources/${sourceId}`),
    archive: (projectId: string, sourceId: string) =>
      post<SourceResponse>(`/projects/${projectId}/sources/${sourceId}/archive`),
    restore: (projectId: string, sourceId: string) =>
      post<SourceResponse>(`/projects/${projectId}/sources/${sourceId}/unarchive`),
    submitManualTranscript: (projectId: string, sourceId: string, transcript: string) =>
      post<SourceResponse>(`/projects/${projectId}/sources/${sourceId}/manual-transcript`, {
        transcript,
      }),
    transition: (
      projectId: string,
      sourceId: string,
      versionId: string,
      status: ArtifactVersionStatus,
    ) =>
      post(`/projects/${projectId}/sources/${sourceId}/versions/${versionId}/transition`, {
        status,
      }),
    getReport: (projectId: string, sourceId: string) =>
      get<SourceReportResponse>(`/projects/${projectId}/sources/${sourceId}/report`),
    // DEC-127: starts (or resumes) the report in the background.
    generateReport: (projectId: string, sourceId: string) =>
      post<{ job: SourceReportJob | null }>(
        `/projects/${projectId}/sources/${sourceId}/report/generate`,
      ),
    reportJob: (projectId: string, sourceId: string) =>
      get<{ job: SourceReportJob | null }>(`/projects/${projectId}/sources/${sourceId}/report-job`),
    acceptReport: (projectId: string, sourceId: string, candidateId: string) =>
      post(`/projects/${projectId}/sources/${sourceId}/report/accept`, { candidateId }),
    submitManualReport: (projectId: string, sourceId: string, summary: string) =>
      post<SourceReportResponse>(`/projects/${projectId}/sources/${sourceId}/report/manual`, {
        content: {
          summary,
          actors: [],
          businessConcepts: [],
          candidateBusinessRules: [],
          candidateConstraints: [],
          needs: [],
          importantFacts: [],
          ambiguities: [],
        },
      }),
  },
  context: {
    getCurrent: (projectId: string) =>
      get<ProjectContextResponse>(`/projects/${projectId}/context`),
    create: (projectId: string, input: ProjectContextRequest) =>
      post<ProjectContextResponse>(`/projects/${projectId}/context`, input),
    createVersion: (projectId: string, input: ProjectContextRequest) =>
      post<ProjectContextResponse>(`/projects/${projectId}/context/versions`, input),
    generate: (projectId: string) =>
      post<ProjectContextCandidate>(`/projects/${projectId}/context/generate`),
    // DEC-132: the proposal is generated in the background and followed here.
    startGeneration: (projectId: string) =>
      post<ProjectContextGenerationJob>(`/projects/${projectId}/context/generation-jobs`),
    latestGeneration: (projectId: string) =>
      get<{ job: ProjectContextGenerationJob | null }>(
        `/projects/${projectId}/context/generation-jobs/latest`,
      ),
    transition: (projectId: string, versionId: string, status: ArtifactVersionStatus) =>
      post(`/projects/${projectId}/context/versions/${versionId}/transition`, { status }),
  },
  requirements: {
    // DEC-138: one action over several requirements, all of them or none.
    bulk: (projectId: string, action: RequirementBulkAction, requirementIds: string[]) =>
      post<RequirementBulkResponse>(`/projects/${projectId}/requirements/bulk`, {
        action,
        requirementIds,
      }),
    list: (projectId: string) =>
      get<{ items: RequirementResponse[] }>(`/projects/${projectId}/requirements`),
    exportUrl: (projectId: string, format: 'pdf' | 'docx') =>
      `${BASE_URL}/projects/${projectId}/requirements/export?format=${format}`,
    qualityReport: (projectId: string) =>
      get<{ issues: { requirementId: string; code: string; rule: string; message: string }[] }>(
        `/projects/${projectId}/requirements/quality-report`,
      ),
    contextCoverage: (projectId: string) =>
      get<RequirementContextCoverageResponse>(
        `/projects/${projectId}/requirements/context-coverage`,
      ),
    create: (projectId: string, input: RequirementInput) =>
      post<RequirementResponse>(`/projects/${projectId}/requirements`, input),
    createVersion: (projectId: string, requirementId: string, input: RequirementInput) =>
      post<RequirementResponse>(
        `/projects/${projectId}/requirements/${requirementId}/versions`,
        input,
      ),
    generate: (projectId: string, sourceContextVersionId: string) =>
      post<GenerationResult>(`/projects/${projectId}/requirements/generate`, {
        sourceContextVersionId,
      }),
    startGeneration: (projectId: string, sourceContextVersionId: string) =>
      post<RequirementGenerationJob>(`/projects/${projectId}/requirements/generation-jobs`, {
        sourceContextVersionId,
      }),
    latestGeneration: (projectId: string) =>
      get<{ job: RequirementGenerationJob | null }>(
        `/projects/${projectId}/requirements/generation-jobs/latest`,
      ),
    generation: (projectId: string, generationId: string) =>
      get<GenerationResult>(`/projects/${projectId}/requirements/generations/${generationId}`),
    accept: (projectId: string, generationId: string, candidateIds: string[]) =>
      post(`/projects/${projectId}/requirements/generations/${generationId}/accept`, {
        candidateIds,
      }),
    transition: (
      projectId: string,
      requirementId: string,
      versionId: string,
      status: ArtifactVersionStatus,
    ) =>
      post(
        `/projects/${projectId}/requirements/${requirementId}/versions/${versionId}/transition`,
        { status },
      ),
  },
  useCases: {
    // DEC-138: one action over several use cases, all of them or none.
    bulk: (projectId: string, action: UseCaseBulkAction, useCaseIds: string[]) =>
      post<UseCaseBulkResponse>(`/projects/${projectId}/use-cases/bulk`, { action, useCaseIds }),
    list: (projectId: string) =>
      get<{ items: UseCaseResponse[] }>(`/projects/${projectId}/use-cases`),
    create: (projectId: string, input: UseCaseInput) =>
      post<UseCaseResponse>(`/projects/${projectId}/use-cases`, input),
    createVersion: (projectId: string, useCaseId: string, input: UseCaseInput) =>
      post<UseCaseResponse>(`/projects/${projectId}/use-cases/${useCaseId}/versions`, input),
    generate: (projectId: string, requirementVersionIds: string[]) =>
      post<GenerationResult>(`/projects/${projectId}/use-cases/generate`, {
        requirementVersionIds,
      }),
    // DEC-139: the use cases are generated in the background, in batches.
    startGeneration: (projectId: string, requirementVersionIds: string[]) =>
      post<UseCaseGenerationJob>(`/projects/${projectId}/use-cases/generation-jobs`, {
        requirementVersionIds,
      }),
    latestGeneration: (projectId: string) =>
      get<{ job: UseCaseGenerationJob | null }>(
        `/projects/${projectId}/use-cases/generation-jobs/latest`,
      ),
    generation: (projectId: string, generationId: string) =>
      get<GenerationResult>(`/projects/${projectId}/use-cases/generations/${generationId}`),
    accept: (projectId: string, generationId: string, candidateIds: string[]) =>
      post(`/projects/${projectId}/use-cases/generations/${generationId}/accept`, {
        candidateIds,
      }),
    transition: (
      projectId: string,
      useCaseId: string,
      versionId: string,
      status: ArtifactVersionStatus,
    ) =>
      post(`/projects/${projectId}/use-cases/${useCaseId}/versions/${versionId}/transition`, {
        status,
      }),
  },
  useCaseDiagrams: {
    generate: (projectId: string, sourceVersionIds: string[]) =>
      post<DiagramResponse>(`/projects/${projectId}/diagrams/use-cases`, { sourceVersionIds }),
    list: (projectId: string) =>
      get<{ items: DiagramResponse[] }>(`/projects/${projectId}/diagrams/use-cases`),
    get: (projectId: string, id: string) =>
      get<DiagramResponse>(`/projects/${projectId}/diagrams/use-cases/${id}`),
    diagramPngUrl: (projectId: string, id: string) =>
      `${BASE_URL}/projects/${projectId}/diagrams/use-cases/${id}/png`,
    createManualVersion: (projectId: string, id: string, source: string) =>
      post<DiagramResponse>(`/projects/${projectId}/diagrams/use-cases/${id}/versions`, {
        source,
      }),
  },
  dataModels: {
    list: (projectId: string) =>
      get<{ items: DataModelResponse[] }>(`/projects/${projectId}/data-models`),
    get: (projectId: string, id: string) =>
      get<DataModelResponse>(`/projects/${projectId}/data-models/${id}`),
    create: (projectId: string, input: DataModelInput) =>
      post(`/projects/${projectId}/data-models`, input),
    createVersion: (projectId: string, id: string, input: DataModelInput) =>
      post(`/projects/${projectId}/data-models/${id}/versions`, input),
    getDiagram: (projectId: string, id: string) =>
      get<DiagramResponse>(`/projects/${projectId}/data-models/${id}/diagram`),
    diagramPngUrl: (projectId: string, id: string) =>
      `${BASE_URL}/projects/${projectId}/data-models/${id}/diagram/png`,
    generate: (projectId: string, requirementVersionIds: string[], useCaseVersionIds: string[]) =>
      post<GenerationResult>(`/projects/${projectId}/data-models/generate`, {
        requirementVersionIds,
        useCaseVersionIds,
      }),
    accept: (projectId: string, generationId: string, candidateIds: string[]) =>
      post(`/projects/${projectId}/data-models/generations/${generationId}/accept`, {
        candidateIds,
      }),
    transition: (projectId: string, id: string, versionId: string, status: ArtifactVersionStatus) =>
      post(`/projects/${projectId}/data-models/${id}/versions/${versionId}/transition`, {
        status,
      }),
  },
  structuredAnalysis: {
    basePath: (kind: StructuredAnalysisKind) =>
      ({
        NAVIGATION_TREE: 'navigation',
        SOFTWARE_ARCHITECTURE: 'software-architecture',
        SYSTEM_ARCHITECTURE: 'system-architecture',
        UI_BLUEPRINT: 'ui-blueprint',
        GENERATION_PLAN: 'generation-plan',
        CONCEPTUAL_DOMAIN_MODEL: 'conceptual-domain-model',
        IMPLEMENTATION_PLAN: 'implementation-plan',
        DESIGN_THEME: 'design-theme',
        CLASS_DIAGRAM: 'class-diagram',
      })[kind],
    list: (projectId: string, kind: StructuredAnalysisKind) =>
      get<{ items: StructuredAnalysisResponse[] }>(
        `/projects/${projectId}/${api.structuredAnalysis.basePath(kind)}`,
      ),
    create: (projectId: string, kind: StructuredAnalysisKind, title: string, content: unknown) =>
      post<StructuredAnalysisResponse>(
        `/projects/${projectId}/${api.structuredAnalysis.basePath(kind)}`,
        { title, content },
      ),
    createVersion: (
      projectId: string,
      kind: StructuredAnalysisKind,
      id: string,
      title: string,
      content: unknown,
    ) =>
      post<StructuredAnalysisResponse>(
        `/projects/${projectId}/${api.structuredAnalysis.basePath(kind)}/${id}/versions`,
        { title, content },
      ),
    getDiagram: (projectId: string, kind: StructuredAnalysisKind, id: string) =>
      get<DiagramResponse>(
        `/projects/${projectId}/${api.structuredAnalysis.basePath(kind)}/${id}/diagram`,
      ),
    diagramPngUrl: (projectId: string, kind: StructuredAnalysisKind, id: string) =>
      `${BASE_URL}/projects/${projectId}/${api.structuredAnalysis.basePath(kind)}/${id}/diagram/png`,
    generate: (
      projectId: string,
      kind: StructuredAnalysisKind,
      sourceVersionIds: string[],
      instruction?: string,
    ) =>
      post<GenerationResult>(
        `/projects/${projectId}/${api.structuredAnalysis.basePath(kind)}/generate`,
        { sourceVersionIds, ...(instruction ? { instruction } : {}) },
      ),
    // DEC-142: some kinds are generated in the background, in batches.
    startGenerationJob: (
      projectId: string,
      kind: StructuredAnalysisKind,
      sourceVersionIds: string[],
    ) =>
      post<StructuredGenerationJob>(
        `/projects/${projectId}/${api.structuredAnalysis.basePath(kind)}/generation-jobs`,
        { sourceVersionIds },
      ),
    latestGenerationJob: (projectId: string, kind: StructuredAnalysisKind) =>
      get<{ job: StructuredGenerationJob | null }>(
        `/projects/${projectId}/${api.structuredAnalysis.basePath(kind)}/generation-jobs/latest`,
      ),
    generation: (projectId: string, kind: StructuredAnalysisKind, generationId: string) =>
      get<GenerationResult>(
        `/projects/${projectId}/${api.structuredAnalysis.basePath(kind)}/generations/${generationId}`,
      ),
    // An Implementation Plan is generated from an approved Design Baseline.
    generateImplementationPlan: (projectId: string, designBaselineId: string) =>
      post<GenerationResult>(`/projects/${projectId}/implementation-plan/generate`, {
        designBaselineId,
      }),
    implementationPlanArtifacts: (projectId: string, id: string) =>
      get<ImplementationPlanArtifactsResponse>(
        `/projects/${projectId}/implementation-plan/${id}/artifacts`,
      ),
    accept: (
      projectId: string,
      kind: StructuredAnalysisKind,
      generationId: string,
      candidateIds: string[],
    ) =>
      post(
        `/projects/${projectId}/${api.structuredAnalysis.basePath(kind)}/generations/${generationId}/accept`,
        { candidateIds },
      ),
    transition: (
      projectId: string,
      kind: StructuredAnalysisKind,
      id: string,
      versionId: string,
      status: ArtifactVersionStatus,
    ) =>
      post(
        `/projects/${projectId}/${api.structuredAnalysis.basePath(kind)}/${id}/versions/${versionId}/transition`,
        { status },
      ),
  },
  mockups: {
    downloadAllUrl: (projectId: string, mockupId: string) =>
      `${BASE_URL}/projects/${projectId}/mockups/${mockupId}/screens/download`,
    screenImageUrl: (projectId: string, mockupId: string, screenId: string) =>
      `${BASE_URL}/projects/${projectId}/mockups/${mockupId}/screens/${screenId}/image`,
    screenHtmlUrl: (projectId: string, mockupId: string, screenId: string) =>
      `${BASE_URL}/projects/${projectId}/mockups/${mockupId}/screens/${screenId}/html`,
    list: (projectId: string) => get<{ items: MockupResponse[] }>(`/projects/${projectId}/mockups`),
    getPreview: (projectId: string, id: string) =>
      get<MockupPreviewResponse>(`/projects/${projectId}/mockups/${id}/preview`),
    create: (projectId: string, uiBlueprintVersionId: string, deviceType: MockupDeviceType) =>
      post<MockupJobResponse>(`/projects/${projectId}/mockups`, {
        uiBlueprintVersionId,
        deviceType,
      }),
    refine: (projectId: string, id: string, prompt: string) =>
      post<MockupJobResponse>(`/projects/${projectId}/mockups/${id}/refine`, { prompt }),
    refineScreen: (projectId: string, id: string, screenId: string, prompt: string) =>
      post<MockupJobResponse>(`/projects/${projectId}/mockups/${id}/screens/${screenId}/refine`, {
        prompt,
      }),
    getJob: (projectId: string, jobId: string) =>
      get<MockupJobResponse>(`/projects/${projectId}/mockups/jobs/${jobId}`),
    transition: (projectId: string, id: string, versionId: string, status: ArtifactVersionStatus) =>
      post(`/projects/${projectId}/mockups/${id}/versions/${versionId}/transition`, { status }),
  },
  export: {
    url: (projectId: string, format: 'json' | 'html') =>
      `${BASE_URL}/projects/${projectId}/export?format=${format}`,
    getJson: (projectId: string) =>
      get<FirstDeliverableExport>(`/projects/${projectId}/export?format=json`),
  },
  impactAnalysis: {
    analyze: (projectId: string, artifactVersionId: string) =>
      get<import('@caseflow-ai/contracts').ImpactAnalysisResponse>(
        `/projects/${projectId}/impact-analysis/${artifactVersionId}`,
      ),
  },
  consistency: {
    get: (projectId: string) =>
      get<import('@caseflow-ai/contracts').ConsistencyReportResponse>(
        `/projects/${projectId}/consistency`,
      ),
  },
  baselines: {
    list: (projectId: string) =>
      get<import('@caseflow-ai/contracts').BaselinesListResponse>(
        `/projects/${projectId}/baselines`,
      ),
    get: (projectId: string, id: string) =>
      get<import('@caseflow-ai/contracts').BaselineResponse>(
        `/projects/${projectId}/baselines/${id}`,
      ),
    create: (projectId: string, data: import('@caseflow-ai/contracts').CreateBaselineRequest) =>
      post<import('@caseflow-ai/contracts').BaselineResponse>(
        `/projects/${projectId}/baselines`,
        data,
      ),
    exportHtmlUrl: (projectId: string, id: string) =>
      `${BASE_URL}/projects/${projectId}/baselines/${id}/export?format=html`,
    exportJsonUrl: (projectId: string, id: string) =>
      `${BASE_URL}/projects/${projectId}/baselines/${id}/export?format=json`,
  },
  designBaselines: {
    list: (projectId: string) =>
      get<{ items: DesignBaselineResponse[] }>(`/projects/${projectId}/design-baselines`),
    create: (projectId: string, data: CreateDesignBaselineRequest) =>
      post<DesignBaselineResponse>(`/projects/${projectId}/design-baselines`, data),
  },
  ai: {
    status: () => get<AIStatus>('/ai/status'),
  },
  construction: {
    sandboxStatus: () => get<{ available: boolean }>('/construction/sandbox-status'),
  },
  // Route orchestration from one prompt (BUILD_ONLY, DEC-116).
  workflowRuns: {
    list: (projectId: string) =>
      get<{ items: WorkflowRunResponse[] }>(`/projects/${projectId}/workflow-runs`),
    start: (projectId: string, prompt: string) =>
      post<WorkflowRunResponse>(`/projects/${projectId}/workflow-runs`, { prompt }),
    retry: (projectId: string, runId: string) =>
      post<WorkflowRunResponse>(`/projects/${projectId}/workflow-runs/${runId}/retry`),
    review: (projectId: string, runId: string) =>
      get<{ items: WorkflowReviewItem[] }>(`/projects/${projectId}/workflow-runs/${runId}/review`),
    approve: (projectId: string, runId: string) =>
      post<WorkflowRunResponse>(`/projects/${projectId}/workflow-runs/${runId}/approve`),
  },
  generationRuns: {
    list: (projectId: string) =>
      get<{ items: GenerationRunResponse[] }>(`/projects/${projectId}/generation-runs`),
    start: (projectId: string, implementationPlanVersionId: string) =>
      post<GenerationRunResponse>(`/projects/${projectId}/generation-runs`, {
        implementationPlanVersionId,
      }),
    files: (projectId: string, runId: string) =>
      get<{ items: GeneratedFileSummary[] }>(
        `/projects/${projectId}/generation-runs/${runId}/files`,
      ),
    file: (projectId: string, runId: string, fileId: string) =>
      get<GeneratedFileResponse>(`/projects/${projectId}/generation-runs/${runId}/files/${fileId}`),
    sandboxRuns: (projectId: string, runId: string) =>
      get<{ items: SandboxRunResponse[] }>(
        `/projects/${projectId}/generation-runs/${runId}/sandbox-runs`,
      ),
    validate: (projectId: string, runId: string) =>
      post<SandboxRunResponse>(`/projects/${projectId}/generation-runs/${runId}/sandbox-runs`),
    snapshotArchiveUrl: (projectId: string, snapshotId: string) =>
      `${BASE_URL}/projects/${projectId}/generated-project-snapshots/${snapshotId}/archive`,
  },
};
