import { describe, expect, it } from 'vitest';
import { projectResponseSchema, updateProjectLanguageRequestSchema } from './project.contract';

const project = {
  id: '7b1d3c4e-5f60-4a71-8b92-a3b4c5d6e7f8',
  workspaceId: '2f0c5f5e-3c7d-4a8e-9a55-1f6f0f3f6a11',
  name: 'Proyecto',
  description: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  archivedAt: null,
  hasApprovedArtifacts: false,
};

describe('project language contract', () => {
  it('requires the selected language in project responses', () => {
    expect(projectResponseSchema.safeParse({ ...project, language: 'ES' }).success).toBe(true);
    expect(projectResponseSchema.safeParse({ ...project, language: 'EN' }).success).toBe(true);
    expect(projectResponseSchema.safeParse(project).success).toBe(false);
  });

  it('accepts only a single ES or EN update field', () => {
    expect(updateProjectLanguageRequestSchema.safeParse({ language: 'EN' }).success).toBe(true);
    expect(updateProjectLanguageRequestSchema.safeParse({ language: 'FR' }).success).toBe(false);
    expect(
      updateProjectLanguageRequestSchema.safeParse({ language: 'ES', extra: true }).success,
    ).toBe(false);
  });
});
