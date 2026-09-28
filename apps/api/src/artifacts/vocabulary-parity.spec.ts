import { ARTIFACT_ORIGINS, ARTIFACT_VERSION_STATUSES } from '@caseflow-ai/contracts';
import {
  ARTIFACT_ORIGINS as DOMAIN_ORIGINS,
  ARTIFACT_VERSION_STATUSES as DOMAIN_STATUSES,
} from '@caseflow-ai/domain';
import { describe, expect, it } from 'vitest';
import { ArtifactOrigin, ArtifactVersionStatus } from '../generated/prisma/enums';

// The lifecycle vocabulary exists in three places (domain, contracts, Prisma
// schema). This guards against silent drift between them.
describe('artifact vocabulary parity', () => {
  it('keeps version statuses identical in domain, contracts and the Prisma schema', () => {
    expect([...ARTIFACT_VERSION_STATUSES]).toEqual([...DOMAIN_STATUSES]);
    expect(Object.values(ArtifactVersionStatus)).toEqual([...DOMAIN_STATUSES]);
  });

  it('keeps origins identical in domain, contracts and the Prisma schema', () => {
    expect([...ARTIFACT_ORIGINS]).toEqual([...DOMAIN_ORIGINS]);
    expect(Object.values(ArtifactOrigin)).toEqual([...DOMAIN_ORIGINS]);
  });
});
