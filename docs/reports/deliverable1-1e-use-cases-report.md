# Increment 1E — Use Cases completion report

Date: 2026-09-21

## 1. Implemented

Increment 1E implements project-scoped structured Use Cases (`USE_CASE`, prefix `CU`) with manual creation, immutable versions, lifecycle, exact Requirement-version traceability, AI candidate generation/review/acceptance, academic validation and deterministic OpenAPI documentation. No diagram or frontend was added.

## 2. Use Case model

`Artifact` remains the stable identity and `ArtifactVersion` the immutable historical state. `UseCaseDetail` owns `name`, `objective`, `primaryActor` and provenance foreign keys. Ordered child records model all repeating semantic data.

## 3. Main/alternative flow representation

- Main flow: ordered `UseCaseMainFlowStep(position, actor, action)` rows; 1–100 steps.
- Alternatives: up to 25 ordered `UseCaseAlternativeFlow(position, name, condition)` rows, each with 1–50 ordered `UseCaseAlternativeFlowStep(position, actor, action)` rows.
- Secondary actors: ordered, maximum 25.
- Preconditions/postconditions: ordered, maximum 50 each.

## 4. Requirement traceability

`UseCaseRequirementLink` connects every Use Case version to one or more exact `ArtifactVersion` records. Service validation requires `REQUIREMENT` type and same project; database triggers repeat type/project enforcement. Manual creation accepts any valid exact Requirement version. AI generation accepts only exact `APPROVED` Requirement versions from the same project.

## 5. Manual workflow

`POST /projects/{projectId}/use-cases` allocates `CU-xxx` internally and creates `MANUAL/DRAFT`. Generic artifact creation rejects `USE_CASE`, preventing subtype bypass. Manual operation remains available with `AI_PROVIDER=disabled`.

## 6. AI generation

Generation accepts 1–50 exact approved Requirement-version IDs, sends structured source records, validates provider output, rejects invented source IDs with `AI_INVALID_OUTPUT`, and only then persists a review batch. No official artifact is created before human acceptance.

## 7. Prompt/schema

- Prompt: `use-cases.generate@1`.
- Candidate limit: 1–20.
- Unique, nonblank `candidateId` (max 80).
- Candidate requires name, objective, primary actor, ordered main flow and at least one unique supplied Requirement source.
- Limits: 100 main steps, 25 alternatives, 50 steps per alternative, 25 secondary actors, 50 preconditions, 50 postconditions.

## 8. Candidate persistence

`UseCaseGeneration`, `UseCaseGenerationSource`, `UseCaseCandidate` and `UseCaseCandidateSource` persist reloadable batches, exact sources and candidate-to-source membership separately from official artifacts. Variable candidate payload collections remain candidate-stage JSON; accepted official snapshots are relational.

## 9. Acceptance

`POST .../generations/{generationId}/accept` creates only selected candidates as `AI_GENERATED/GENERATED`. The operation and all selected creations run in one Prisma transaction. Re-acceptance and foreign candidate IDs are rejected.

## 10. Lifecycle

Use Cases reuse the shared lifecycle transition rules. `DRAFT/GENERATED → IN_REVIEW → APPROVED` and change-request paths are unchanged. An approved current version cannot be edited; editing otherwise creates version N+1 and leaves previous detail/flow rows immutable.

## 11. Provenance

Exact chain:

`UseCase ArtifactVersion → UseCaseDetail → accepted UseCaseCandidate → UseCaseGeneration → AIRun → use-cases.generate@1`, plus `UseCaseCandidateSource → UseCaseGenerationSource → exact Requirement ArtifactVersion` for every supporting source. Database validation prevents partial or mismatched candidate/generation/AI-run chains.

## 12. Academic four-use-case validation

`GET /projects/{projectId}/use-cases/academic-validation` returns `{ acceptedCount, minimumRequired: 4, satisfied }`. It counts official project Use Case artifacts, supports N cases, reports fewer than four without blocking normal use, and never fabricates candidates.

## 13. Database migration

Migration: `20260922010000_use_cases`.

Physical tables and principal columns:

- `use_case_details`: `artifact_version_id`, `name`, `objective`, `primary_actor`, `generation_id`, `generation_candidate_id`, `ai_run_id`.
- `use_case_secondary_actors`: version, position, name.
- `use_case_preconditions`, `use_case_postconditions`: version, position, description.
- `use_case_main_flow_steps`: version, position, actor, action.
- `use_case_alternative_flows`: version, position, name, condition.
- `use_case_alternative_flow_steps`: alternative flow, position, actor, action.
- `use_case_requirement_links`: Use Case version + Requirement version.
- `use_case_generations`: project, AI run, creation time.
- `use_case_generation_sources`: generation, exact Requirement version, source ID.
- `use_case_candidates`: generation, candidate ID, semantic candidate payload, accepted artifact ID.
- `use_case_candidate_sources`: candidate + exact generation source.

The migration adds foreign keys, uniqueness/order constraints, nonblank checks, type/project/source/provenance validation triggers and immutability triggers.

## 14. API

- `POST /projects/{projectId}/use-cases`
- `GET /projects/{projectId}/use-cases`
- `GET /projects/{projectId}/use-cases/academic-validation`
- `POST /projects/{projectId}/use-cases/generate`
- `GET /projects/{projectId}/use-cases/generations/{generationId}`
- `POST /projects/{projectId}/use-cases/generations/{generationId}/accept`
- `GET /projects/{projectId}/use-cases/{useCaseId}`
- `POST /projects/{projectId}/use-cases/{useCaseId}/versions`
- `POST /projects/{projectId}/use-cases/{useCaseId}/versions/{versionId}/transition`

No delete route exists.

## 15. OpenAPI

Use Case request/response schemas derive from shared Zod contracts. Route and unique operation-ID assertions were extended. `pnpm openapi:generate` completed deterministically.

## 16. Tests

- Unit/contract/OpenAPI: 26 files, 120 tests passed.
- Integration: 10 files, 61 tests passed.
- Covered behavior includes normalization, manual snapshots, immutable history, lifecycle, project/type isolation, approved generation eligibility, disabled AI, invented references, selected acceptance, provenance, academic threshold and HTTP validation.
- Ordinary tests used only disabled/fake AI providers.

## 17. Coverage

- Statements: 77.34% (495/640)
- Branches: 71.08% (177/249)
- Functions: 79.71% (165/207)
- Lines: 78.15% (465/595)

All global thresholds remain at 70% or higher; none were lowered.

## 18. Frontend decision

The accumulated Context → Requirements → Use Cases workflow now justifies a dedicated coherent frontend vertical slice with real workspace/project selection. A partial 1E-only UI would duplicate navigation/context decisions, so no large or hardcoded frontend was introduced.

## 19. Real-provider verification

NOT VERIFIED. No configured live provider was used. Fake deterministic providers exercised successful/invalid generation and the disabled provider exercised `AI_NOT_CONFIGURED`.

## 20. Verified

- Frozen install succeeded.
- Prisma schema validated.
- Official migration history applied from zero to isolated PostgreSQL 18 + pgvector.
- Unit, contract, OpenAPI and integration suites passed.
- Lint, typecheck, builds, coverage, OpenAPI generation and whitespace checks passed.

## 21. Not verified

- Live external AI behavior/quality.
- Browser UI flow (not in 1E scope).
- Use Case diagram rendering (explicitly deferred to 1F).

## 22. Relevant decisions

- No global Actor catalog was introduced.
- Official snapshots are fully relational; candidate payloads remain isolated review data.
- Requirement generation eligibility is exactly `APPROVED`, same project, exact version.
- Academic cardinality is a report, not a database constraint.
- No Mermaid/PlantUML/diagram engine and no Increment 1F work were started.

Commands run for final verification (including recovered attempts):

- `pnpm install --frozen-lockfile` — passed.
- `pnpm db:generate` / `pnpm typecheck` / `pnpm test` — passed during implementation.
- `pnpm verify:integration` — first attempt failed because the existing local database rejected configured credentials; no local data was changed.
- Disposable `pgvector/pgvector:pg18` container on port 55432 was created; `pnpm verify:integration` then passed against a fresh `caseflow_test` using all six official migrations.
- `pnpm verify` — first final attempt exposed coverage below threshold; tests were expanded, then final run passed.
- `pnpm db:validate` — passed.
- `pnpm openapi:generate` — passed.
- `git diff --check` — passed.

## 23. Git branch/status

- Branch: `feature/use-cases`.
- Working tree: expected uncommitted Increment 1E changes only.
- Existing `stash@{0}: On develop: preserve prior 1A final review report` remains untouched.
- No commit, push or merge performed.
