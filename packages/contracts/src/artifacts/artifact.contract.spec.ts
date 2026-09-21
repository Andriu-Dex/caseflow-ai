import { describe, expect, it } from 'vitest';
import { createProjectRequestSchema, listProjectsQuerySchema } from '../projects/project.contract';
import {
  createArtifactRequestSchema,
  createArtifactVersionRequestSchema,
} from './artifact.contract';

const workspaceId = '2f0c5f5e-3c7d-4a8e-9a55-1f6f0f3f6a11';

describe('project contracts', () => {
  it('accepts a minimal project and trims the name', () => {
    const parsed = createProjectRequestSchema.parse({ workspaceId, name: '  Mi proyecto  ' });

    expect(parsed.name).toBe('Mi proyecto');
  });

  it.each([
    [{ workspaceId: 'no-uuid', name: 'x' }],
    [{ workspaceId, name: '   ' }],
    [{ workspaceId, name: 'x'.repeat(201) }],
    [{ workspaceId, name: 'x', unexpected: true }],
  ])('rejects invalid project payload %#', (payload) => {
    expect(createProjectRequestSchema.safeParse(payload).success).toBe(false);
  });

  it('coerces and bounds list pagination', () => {
    expect(listProjectsQuerySchema.parse({ workspaceId })).toMatchObject({ limit: 50, offset: 0 });
    expect(listProjectsQuerySchema.parse({ workspaceId, limit: '10', offset: '5' })).toMatchObject({
      limit: 10,
      offset: 5,
    });
    expect(listProjectsQuerySchema.safeParse({ workspaceId, limit: '1000' }).success).toBe(false);
    expect(listProjectsQuerySchema.safeParse({}).success).toBe(false);
  });
});

describe('artifact contracts', () => {
  it('defaults metadataAuxiliary to an empty object', () => {
    const parsed = createArtifactRequestSchema.parse({ type: 'REQUIREMENT', title: 'RF' });

    expect(parsed.metadataAuxiliary).toEqual({});
  });

  it('does not let callers choose origin or status', () => {
    expect(
      createArtifactRequestSchema.safeParse({ type: 'REQUIREMENT', title: 'RF', origin: 'MANUAL' })
        .success,
    ).toBe(false);
    expect(
      createArtifactVersionRequestSchema.safeParse({ title: 'v2', status: 'APPROVED' }).success,
    ).toBe(false);
  });

  it.each([
    [{ type: 'requirement', title: 'x' }],
    [{ type: 'REQUIREMENT', title: '' }],
    [{ type: 'REQUIREMENT', title: 'x', metadataAuxiliary: [1] }],
    [{ title: 'x' }],
  ])('rejects invalid artifact payload %#', (payload) => {
    expect(createArtifactRequestSchema.safeParse(payload).success).toBe(false);
  });

  it('does not expose the code prefix: clients cannot choose a code namespace', () => {
    for (const codePrefix of ['RNF', 'ZZZ', 'r', '']) {
      expect(
        createArtifactRequestSchema.safeParse({ type: 'REQUIREMENT', title: 'x', codePrefix })
          .success,
      ).toBe(false);
    }
  });
});
