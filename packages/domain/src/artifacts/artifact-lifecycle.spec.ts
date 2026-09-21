import { describe, expect, it } from 'vitest';
import {
  ARTIFACT_ORIGINS,
  ARTIFACT_VERSION_STATUSES,
  canTransitionArtifactVersionStatus,
  initialStatusForOrigin,
  isArtifactVersionFrozen,
} from './artifact-lifecycle';
import { FIRST_DELIVERABLE_ARTIFACT_TYPE_CODES, formatArtifactCode } from './artifact-types';

describe('artifact lifecycle', () => {
  it('uses exactly the approved status and origin names', () => {
    expect(ARTIFACT_VERSION_STATUSES).toEqual([
      'DRAFT',
      'GENERATED',
      'IN_REVIEW',
      'APPROVED',
      'CHANGES_REQUESTED',
    ]);
    expect(ARTIFACT_ORIGINS).toEqual(['MANUAL', 'AI_GENERATED', 'AI_ASSISTED', 'IMPORTED']);
  });

  it.each([
    ['DRAFT', 'GENERATED'],
    ['DRAFT', 'IN_REVIEW'],
    ['GENERATED', 'IN_REVIEW'],
    ['IN_REVIEW', 'APPROVED'],
    ['IN_REVIEW', 'CHANGES_REQUESTED'],
    ['CHANGES_REQUESTED', 'DRAFT'],
  ] as const)('allows %s -> %s', (from, to) => {
    expect(canTransitionArtifactVersionStatus(from, to)).toBe(true);
  });

  it('never leaves APPROVED and never skips review', () => {
    for (const to of ARTIFACT_VERSION_STATUSES) {
      expect(canTransitionArtifactVersionStatus('APPROVED', to)).toBe(false);
    }
    expect(canTransitionArtifactVersionStatus('DRAFT', 'APPROVED')).toBe(false);
    expect(canTransitionArtifactVersionStatus('GENERATED', 'APPROVED')).toBe(false);
    expect(canTransitionArtifactVersionStatus('CHANGES_REQUESTED', 'APPROVED')).toBe(false);
  });

  it('starts AI_GENERATED versions as GENERATED and every other origin as DRAFT', () => {
    expect(initialStatusForOrigin('AI_GENERATED')).toBe('GENERATED');
    expect(initialStatusForOrigin('MANUAL')).toBe('DRAFT');
    expect(initialStatusForOrigin('AI_ASSISTED')).toBe('DRAFT');
    expect(initialStatusForOrigin('IMPORTED')).toBe('DRAFT');
  });

  it('freezes only APPROVED versions', () => {
    expect(ARTIFACT_VERSION_STATUSES.filter(isArtifactVersionFrozen)).toEqual(['APPROVED']);
  });
});

describe('artifact types and codes', () => {
  it('names the nine first-deliverable artifact types', () => {
    expect([...FIRST_DELIVERABLE_ARTIFACT_TYPE_CODES]).toEqual([
      'REQUIREMENT',
      'USE_CASE',
      'DATA_MODEL',
      'USE_CASE_DIAGRAM',
      'NAVIGATION_TREE',
      'SOFTWARE_ARCHITECTURE',
      'SYSTEM_ARCHITECTURE',
      'UI_BLUEPRINT',
      'MOCKUP',
    ]);
  });

  it('formats project codes with a minimum of three digits', () => {
    expect(formatArtifactCode('RF', 1)).toBe('RF-001');
    expect(formatArtifactCode('RNF', 42)).toBe('RNF-042');
    expect(formatArtifactCode('CU', 1000)).toBe('CU-1000');
  });
});
