# CASEFlow AI — Increment 1B Project Context Report

Date: 2026-09-21
Branch: `feature/project-context`

## 1. Implemented

Implemented a manual, canonical, structured and versioned Project Context as the input for later requirements/design generation. No AI, requirement subtype, RBAC or speculative frontend was added.

`PROJECT_CONTEXT` was added to the controlled artifact vocabulary with default prefix `CTX`. Generic `POST /artifacts` creation rejects this type; clients use the semantic Project Context API.

## 2. Project Context model

Each project has at most one canonical `PROJECT_CONTEXT` Artifact. Its complete state belongs to an immutable `ArtifactVersion` and contains:

- `problemStatement`;
- `objective`;
- ordered `IN_SCOPE` / `OUT_OF_SCOPE` items;
- ordered actors (`name`, optional `description`);
- ordered needs;
- ordered constraints;
- ordered business rules;
- optional `additionalContext`.

Every collection row has an explicit zero-based `position`. API responses are always ordered by it.

## 3. Database schema and migration

Migration: `20260921190000_project_context`.

Added PostgreSQL enum:

- `project_context_scope_type`: `IN_SCOPE`, `OUT_OF_SCOPE`.

Added physical tables/columns:

- `project_context_details`: `artifact_version_id` (PK/FK), `problem_statement`, `objective`, `additional_context`;
- `project_context_actors`: `id`, `artifact_version_id`, `position`, `name`, `description`;
- `project_context_needs`: `id`, `artifact_version_id`, `position`, `description`;
- `project_context_constraints`: `id`, `artifact_version_id`, `position`, `description`;
- `project_context_business_rules`: `id`, `artifact_version_id`, `position`, `description`;
- `project_context_scope_items`: `id`, `artifact_version_id`, `position`, `type`, `description`.

All child tables use UUID identifiers, restrictive FKs, nonblank/position checks and unique `(artifact_version_id, position)` constraints. The migration inserts `artifact_types(code='PROJECT_CONTEXT', default_code_prefix='CTX')`.

One context per project is enforced by the partial unique index `artifacts_one_project_context_per_project_key` on `artifacts(project_id) WHERE artifact_type_code = 'PROJECT_CONTEXT'`. The service also returns HTTP 409 deterministically, including database uniqueness races.

## 4. Artifact/version integration

Creation atomically allocates `CTX-001`, creates the canonical Artifact, creates version 1 with `MANUAL` / `DRAFT`, and inserts the full relational snapshot.

Editing locks the canonical Artifact row with `FOR NO KEY UPDATE`, computes the next version and atomically inserts a complete snapshot. Eight concurrent requests produced versions 2–9 without gaps or duplicates.

Historical safety is enforced by:

- the existing immutable `artifact_versions` trigger;
- one subtype root per `artifact_version_id`;
- restrictive ownership FKs;
- `project_context_details_validate_artifact_type`, which only accepts a `PROJECT_CONTEXT` version;
- update/delete rejection triggers on the root and every child table;
- no API/application path for appending to an existing snapshot.

## 5. API

Implemented routes:

- `POST /projects/{projectId}/context` — create the canonical context and version 1;
- `GET /projects/{projectId}/context` — return the latest complete snapshot;
- `POST /projects/{projectId}/context/versions` — create the next complete version.

All routes are scoped by `projectId`. Cross-project reads/version attempts return 404 without revealing whether another project owns a context.

## 6. Validation contracts

Shared strict Zod contracts were added to `@caseflow-ai/contracts`; they trim strings, reject unknown properties, blank required text, blank actor names, invalid scope types and oversized collections.

Limits:

- 100 entries per collection;
- 10,000 characters for `problemStatement` and `additionalContext`;
- 5,000 for `objective`;
- 2,000 per collection description;
- 200 for actor names.

These bounds allow substantial real project descriptions while limiting abusive payload size.

## 7. OpenAPI

The three semantic routes, request bodies, responses, parameters and 400/404/409 errors derive from the shared Zod schemas through the existing single-source mechanism. The exact route and operation-id set is asserted.

`pnpm openapi:generate` succeeded twice. Both outputs had SHA-256 `7EB602D5EDD96A2CD6CAF1E2FA942248FB115F6AE44B5AF2887A79FD0D879074`; `apps/api/openapi/openapi.json` remains ignored.

## 8. Tests

- Unit/OpenAPI: 85 tests across 16 files, all passing.
- Integration: 49 tests across 7 files, all passing.

Coverage includes creation, type/prefix/status/origin, uniqueness and generic bypass prevention, sequential/concurrent versions, byte-for-byte preservation, subtype immutability, collection ordering, validation, project isolation, PostgreSQL constraints, migrations, HTTP contract conformance and safe errors.

## 9. Coverage

- Statements: 83.48%.
- Branches: 83.33%.
- Functions: 88.46%.
- Lines: 84.65%.

All global 70% thresholds remain unchanged and pass.

## 10. Development/test parity

Both schemas derive from the same three official Prisma migrations. The isolated disposable PostgreSQL 18 + pgvector instance used `caseflow` and `caseflow_test` on port 55432. The public-schema table count in `caseflow` was `0` before integration, `0` after the direct integration run and `0` after `verify:integration`, proving integration did not migrate or mutate the development database. `caseflow_test` received all three migrations.

## 11. Verified

Commands executed successfully:

- `pnpm install --frozen-lockfile`;
- `pnpm format:check`;
- `pnpm lint`;
- `pnpm typecheck`;
- `pnpm build`;
- `pnpm test`;
- `pnpm test:coverage`;
- `pnpm verify`;
- `pnpm db:validate`;
- `pnpm db:test:prepare`;
- `pnpm db:test:migrate`;
- `pnpm test:integration`;
- `pnpm verify:integration`;
- `pnpm openapi:generate` twice;
- `git diff --check`;
- generated/local-file tracking check.

The initial full verification found a formatting issue in the newly updated MVP document; `pnpm format` corrected it and the complete gate passed afterward. The first integration run exposed two stale test expectations (generic acceptance of all artifact types and response comparison retaining internal FK fields); both were corrected without weakening invariants, then direct integration and `verify:integration` passed.

## 12. Not verified

- GitHub Actions was not run.
- No browser-rendered Swagger UI review was performed.
- No frontend workflow was added; it was deliberately deferred because there is no coherent project-selection UI yet, and production code must not hardcode workspace/project IDs.

## 13. Relevant decisions

The authoritative specification now records the canonical artifact, relational version-owned subtype, limits, semantic API, immutable snapshots, manual fallback and frontend deferral. `docs/FIRST_DELIVERABLE_MVP.md` and README were aligned without duplicating the full specification.

AI generation remains Increment 1C. Requirement modeling remains Increment 1D.

## 14. Git branch/status

- Branch: `feature/project-context`, created from synchronized `origin/develop` at merge commit `cfc0544`.
- No commit, push or merge was performed.
- The previous `deliverable1-1a-final-review-pr-report.md` was preserved outside this feature in `stash@{0}` with message `preserve prior 1A final review report`.
- The working tree contains only Increment 1B implementation/documentation plus this report; generated Prisma/OpenAPI/build/coverage outputs remain ignored.
