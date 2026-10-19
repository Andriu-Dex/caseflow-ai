'use client';

import { api, type GenerationResult } from '../lib/api';
import { BatchedGenerationPanel } from './batched-generation-panel';

// Generates use cases in the background, a few requirements per batch
// (DEC-139), and hands the proposals over for review when the job finishes.
export function UseCaseGenerationPanel({
  projectId,
  requirementVersionIds,
  onCompleted,
}: {
  projectId: string;
  requirementVersionIds: string[];
  onCompleted: (generation: GenerationResult) => void;
}) {
  return (
    <BatchedGenerationPanel
      queryKey={['use-case-generation-job', projectId]}
      latest={() => api.useCases.latestGeneration(projectId)}
      start={() => api.useCases.startGeneration(projectId, requirementVersionIds)}
      cancel={(jobId) => api.useCases.cancelGeneration(projectId, jobId)}
      fetchGeneration={(generationId) => api.useCases.generation(projectId, generationId)}
      jobSelection={(job) => job.requirementVersionIds}
      selection={requirementVersionIds}
      onCompleted={onCompleted}
      title="Generando casos de uso por lotes"
      progressLabel="Lotes de casos de uso validados"
      startLabel={(count) => `Generar con ${count} ${count === 1 ? 'requisito' : 'requisitos'}`}
    />
  );
}
