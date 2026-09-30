import type {
  DataModelInput,
  DataModelResponse,
  DiagramResponse,
  FirstDeliverableExport,
  MockupDeviceType,
  MockupJobResponse,
  MockupPreviewResponse,
  MockupResponse,
  ProjectContextCandidate,
  ProjectContextRequest,
  ProjectContextResponse,
  ProjectListResponse,
  ProjectResponse,
  ReadinessResponse,
  RequirementInput,
  RequirementResponse,
  SourceMetadataInput,
  SourceReportCandidate,
  SourceReportResponse,
  SourceResponse,
  StalenessAnalysisResponse,
  StructuredAnalysisKind,
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
export interface GenerationResult {
  id: string;
  candidates: GenerationCandidate[];
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
  let response: Response;
  try {
    response = await send();
  } catch {
    // A GET is safe to repeat once: in development the API restarts on every
    // file change (node --watch), dropping in-flight requests. Never retry a
    // POST — it could duplicate an AI generation or a created artifact.
    if (method !== 'GET') throw new ApiError(NETWORK_ERROR_MESSAGE, 0);
    await new Promise((resolve) => setTimeout(resolve, 1_000));
    try {
      response = await send();
    } catch {
      throw new ApiError(NETWORK_ERROR_MESSAGE, 0);
    }
  }
  if (response.ok) return response;
  if (response.status === 401 && allowRefresh && !isAuthPath) {
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
const del = <T>(path: string) => request<T>(path, { method: 'DELETE' });

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
    list: (workspaceId: string) => get<ProjectListResponse>(`/projects?workspaceId=${workspaceId}`),
    create: (input: { workspaceId: string; name: string; description?: string }) =>
      post<ProjectResponse>('/projects', input),
    get: (projectId: string) => get<ProjectResponse>(`/projects/${projectId}`),
    delete: (projectId: string) => del<void>(`/projects/${projectId}`),
    archive: (projectId: string) => post<ProjectResponse>(`/projects/${projectId}/archive`),
    updateLanguage: (projectId: string, language: 'ES' | 'EN') =>
      post<ProjectResponse>(`/projects/${projectId}/language`, { language }),
  },
  artifacts: {
    archive: (projectId: string, artifactId: string) =>
      post<{ archivedAt: string }>(`/projects/${projectId}/artifacts/${artifactId}/archive`),
  },
  readiness: {
    get: (projectId: string) => get<ReadinessResponse>(`/projects/${projectId}/readiness`),
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
    list: (projectId: string) => get<{ items: SourceResponse[] }>(`/projects/${projectId}/sources`),
    get: (projectId: string, sourceId: string) =>
      get<SourceResponse>(`/projects/${projectId}/sources/${sourceId}`),
    getText: (projectId: string, sourceId: string) =>
      get<{ sourceVersionId: string; text: string }>(
        `/projects/${projectId}/sources/${sourceId}/text`,
      ),
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
    edit: (projectId: string, sourceId: string, metadata: SourceMetadataInput) =>
      post<SourceResponse>(`/projects/${projectId}/sources/${sourceId}/edit`, metadata),
    delete: (projectId: string, sourceId: string) =>
      del<void>(`/projects/${projectId}/sources/${sourceId}`),
    archive: (projectId: string, sourceId: string) =>
      post<SourceResponse>(`/projects/${projectId}/sources/${sourceId}/archive`),
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
    generateReport: (projectId: string, sourceId: string) =>
      post<SourceReportCandidate>(`/projects/${projectId}/sources/${sourceId}/report/generate`),
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
    transition: (projectId: string, versionId: string, status: ArtifactVersionStatus) =>
      post(`/projects/${projectId}/context/versions/${versionId}/transition`, { status }),
  },
  requirements: {
    list: (projectId: string) =>
      get<{ items: RequirementResponse[] }>(`/projects/${projectId}/requirements`),
    exportUrl: (projectId: string, format: 'pdf' | 'docx') =>
      `${BASE_URL}/projects/${projectId}/requirements/export?format=${format}`,
    qualityReport: (projectId: string) =>
      get<{ issues: { requirementId: string; code: string; rule: string; message: string }[] }>(
        `/projects/${projectId}/requirements/quality-report`,
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
    generate: (projectId: string, kind: StructuredAnalysisKind, sourceVersionIds: string[]) =>
      post<GenerationResult>(
        `/projects/${projectId}/${api.structuredAnalysis.basePath(kind)}/generate`,
        { sourceVersionIds },
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
};
