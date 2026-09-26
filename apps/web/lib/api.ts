import type {
  DataModelInput,
  DataModelResponse,
  DiagramResponse,
  FirstDeliverableExport,
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

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  // FormData bodies (multipart file uploads) must never get an explicit
  // Content-Type here — the browser sets its own multipart boundary, and
  // overriding it to application/json breaks the backend's multipart parser.
  const isFormData = typeof FormData !== 'undefined' && init?.body instanceof FormData;
  try {
    response = await fetch(`${BASE_URL}${path}`, {
      ...init,
      headers: {
        ...(init?.body && !isFormData ? { 'Content-Type': 'application/json' } : {}),
        ...init?.headers,
      },
    });
  } catch {
    throw new ApiError('No se pudo conectar con el servidor de CASEFlow AI.', 0);
  }
  if (!response.ok) {
    const message = await extractErrorMessage(response);
    throw new ApiError(message, response.status);
  }
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
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

export const api = {
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
  },
  sources: {
    list: (projectId: string) => get<{ items: SourceResponse[] }>(`/projects/${projectId}/sources`),
    get: (projectId: string, sourceId: string) =>
      get<SourceResponse>(`/projects/${projectId}/sources/${sourceId}`),
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
    get: (projectId: string, id: string) =>
      get<DiagramResponse>(`/projects/${projectId}/diagrams/use-cases/${id}`),
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
    list: (projectId: string) => get<{ items: MockupResponse[] }>(`/projects/${projectId}/mockups`),
    getPreview: (projectId: string, id: string) =>
      get<MockupPreviewResponse>(`/projects/${projectId}/mockups/${id}/preview`),
    create: (projectId: string, uiBlueprintVersionId: string) =>
      post<MockupResponse>(`/projects/${projectId}/mockups`, { uiBlueprintVersionId }),
    transition: (projectId: string, id: string, versionId: string, status: ArtifactVersionStatus) =>
      post(`/projects/${projectId}/mockups/${id}/versions/${versionId}/transition`, { status }),
  },
  export: {
    url: (projectId: string, format: 'json' | 'html') =>
      `${BASE_URL}/projects/${projectId}/export?format=${format}`,
    getJson: (projectId: string) =>
      get<FirstDeliverableExport>(`/projects/${projectId}/export?format=json`),
  },
};
