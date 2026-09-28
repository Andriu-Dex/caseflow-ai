# Increment 1F.2 — Navigation Tree, Software/System Architecture, UI Blueprint

Date: 2026-09-22

## 1. Implemented

Structured, versioned, candidate-first AI-generated artifacts for `NAVIGATION_TREE`, `SOFTWARE_ARCHITECTURE`, `SYSTEM_ARCHITECTURE` and `UI_BLUEPRINT`, each with manual creation, immutable versions, stage-gated lifecycle transitions, exact-APPROVED-source AI candidate generation/acceptance, and — for the three diagrammable kinds — deterministic Mermaid flowchart / PlantUML component / PlantUML deployment diagrams rendered through the existing self-hosted Kroki pipeline. `UI_BLUEPRINT` has no diagram (no visual notation defined for it in this increment); Mockup derivation from an approved UI Blueprint was not started.

## 2. Data model

One shared `StructuredAnalysisKind`-discriminated table family mirrors the existing `DiagramDetail` precedent instead of four bespoke schemas:

- `structured_analysis_generations` / `structured_analysis_generation_sources` / `structured_analysis_candidates`: AI review batches, exact sources, and candidate payloads (JSONB, schema-validated at the application layer, never persisted unvalidated).
- `structured_analysis_details`: the official per-version content (JSONB), one row per `ArtifactVersion`.
- `diagram_details` (existing table): extended with `NAVIGATION_TREE`, `SOFTWARE_ARCHITECTURE`, `SYSTEM_ARCHITECTURE` diagram kinds and `MERMAID_FLOWCHART` / `PLANTUML_COMPONENT` / `PLANTUML_DEPLOYMENT` source formats.
- `mockup_details` (Prisma model only; no service/controller yet).

Content is intentionally JSONB per kind (genuinely variable structured payload, not a relational core entity), matching AGENTS.md §31.1's exception for auxiliary/variable data — the surrounding Artifact/ArtifactVersion/lifecycle/provenance model remains fully relational.

## 3. Migrations

- `20260924000000_structured_analysis`: new tables, triggers, constraints, and a fix for a genuine pre-existing bug — `SOFTWARE_ARCHITECTURE` and `SYSTEM_ARCHITECTURE` shared the `ARQ` code prefix (would have produced ambiguous artifact codes); `SYSTEM_ARCHITECTURE` was reassigned `SARQ` additively.
- `20260924010000_structured_analysis_diagrams`: adds the three new `diagram_kind`/`diagram_source_format` enum values (kept separate — Postgres forbids using a new enum value in the same transaction that added it).
- `20260924020000_structured_analysis_diagram_rules`: updates the `diagram_details` CHECK constraint and the `diagram_validate_detail()` / `diagram_validate_source()` trigger functions for the three new self-referencing kinds. All three migrations are additive; no historical migration was rewritten.

A bug was found and fixed during integration testing: the first draft of `diagram_validate_detail()`/`diagram_validate_source()` incorrectly compared the new kinds' artifact type the same way as `ER`/`USE_CASE` diagrams, which actually live on a _different_ artifact type (`DATA_MODEL`, `USE_CASE_DIAGRAM`) than their own kind name. This broke the pre-existing Data Model / Use Case diagram flow; both local databases were reset and the migration corrected before re-verifying.

## 4. Manual workflow

`POST /projects/{projectId}/{navigation|software-architecture|system-architecture|ui-blueprint}` creates a `MANUAL/DRAFT` artifact with its own allocated prefix (`NAV`, `ARQ`, `SARQ`, `UI`). The generic `POST /projects/{projectId}/artifacts` route now rejects all five structured-subtype-adjacent codes it didn't already reject (`NAVIGATION_TREE`, `SOFTWARE_ARCHITECTURE`, `SYSTEM_ARCHITECTURE`, `UI_BLUEPRINT`, `MOCKUP`) with 422, same as every other first-deliverable type.

## 5. AI generation

`generate()` accepts 1..N exact `APPROVED` source versions of an eligible type per kind (Navigation: Requirement/Use Case/Data Model; Software/System Architecture: those plus Navigation Tree; UI Blueprint: Navigation/Use Case/Data Model/Software Architecture/System Architecture), sends them to `AIOrchestrator` against a per-kind versioned prompt (`navigation.generate@1`, `software-architecture.generate@1`, `system-architecture.generate@1`, `ui-blueprint.generate@1`), Zod-validates the structured output, and persists exactly one reviewable candidate — never an official artifact. `accept()` renders required diagrams _before_ opening the write transaction (so a render failure aborts the whole batch with nothing written), then creates the artifact as `AI_GENERATED/GENERATED` — still not `APPROVED`; an explicit `transition()` call is required.

## 6. Diagram generation

New `DiagramEngine` methods (`generateNavigationFlowchart`, `generateSoftwareComponentDiagram`, `generateSystemDeploymentDiagram`) reuse the existing deterministic-source + real-Kroki-render + `sanitizeDiagramSvg()` pipeline unchanged. A real bug was found while integration-testing against local Kroki: the pre-existing `validate()` pre-check blocked any `>` character for `MERMAID_FLOWCHART`, which rejected the format's own required `-->` arrow syntax on every non-trivial navigation tree. Fixed by dropping that blanket block for `MERMAID_FLOWCHART` only (matching the already-lax `PLANTUML` branch's posture) — real rendering + `sanitizeDiagramSvg()` remain the actual security/compatibility authority, exactly as documented on `validate()`; `MERMAID_ER`'s stricter check was left untouched.

## 7. Stage-gated lifecycle

Transitions reuse the shared `canTransitionArtifactVersionStatus` rules (`DRAFT/GENERATED → IN_REVIEW → APPROVED`, change-request paths). `APPROVED` cannot be reached directly from `DRAFT`; editing an approved version creates version N+1 and never mutates history.

## 8. API

Per kind (`navigation`, `software-architecture`, `system-architecture`, `ui-blueprint`; base path `/projects/{projectId}/{kind}`):

`POST /`, `GET /`, `POST /generate`, `GET /generations/{generationId}`, `POST /generations/{generationId}/accept`, `GET /{id}`, `POST /{id}/versions`, `POST /{id}/versions/{versionId}/transition`, and — for all but `ui-blueprint` — `GET /{id}/diagram`. 35 routes total; all documented in OpenAPI with unique `operationId`s derived from the shared Zod contracts.

## 9. Tests

- Unit: `structured-analysis.service.spec.ts` (10 tests: manual create+diagram, no-diagram kind, list/get/version/project-isolation, generation source eligibility, AI error normalization, accept without auto-approval, re-acceptance rejection, render-failure-aborts-batch, lifecycle gate, diagram 404 for non-diagram kinds), `structured-analysis.controller.spec.ts` (4 tests, one per controller, asserting every route delegates to the service with correctly-typed arguments), `structured-analysis.contract.spec.ts` (14 tests covering every `superRefine` validation branch: duplicate IDs, dangling references, self-parent, navigation-tree cycle detection), plus 3 new `DiagramEngine` unit tests for the new generator methods.
- Integration (real Postgres): `structured-analysis.integration.spec.ts` (7 tests — manual creation + diagram for all four kinds, code-prefix-collision regression check, AI generation/acceptance with full provenance and no auto-approval, cross-project/draft-source rejection, stage-gated transition enforcement, kind/project isolation).
- Integration (real local Kroki): extended `diagram-rendering.integration.spec.ts` with 3 new tests rendering the new Mermaid flowchart / PlantUML component / PlantUML deployment sources through the actual self-hosted engine.
- Fixed 4 pre-existing integration test files that used now-blocked types (`NAVIGATION_TREE`, `MOCKUP`) as generic stand-ins for exercising the base Artifact/ArtifactVersion mechanism; introduced one shared `GENERIC_TEST_TYPE` fixture (idempotent `upsert`, since `artifact_types` is intentionally left untruncated between test files) and excluded it explicitly from the migration-seed-catalog invariant test.

## 10. Coverage

```
Statements : 81.89% (1294/1580)
Branches   : 73.92% (462/625)
Functions  : 81.52% (384/471)
Lines      : 82.71% (1201/1452)
```

All global thresholds (≥70%) pass; none were lowered or bypassed to reach them — the branch/function gap was closed with real tests for previously-untested new code (contract validation branches, new diagram generator branches, controller delegation), not padding.

## 11. Verified

- `pnpm db:generate`, `pnpm db:validate` — passed.
- `pnpm format:check`, `pnpm lint`, `pnpm typecheck` (whole workspace) — passed.
- `pnpm build` (whole workspace, including `apps/web` Next.js build) — passed.
- `pnpm test` (unit, 38 files / 234 tests) — passed.
- `pnpm test:coverage` — passed, all thresholds met.
- `pnpm test:integration` against real local PostgreSQL 18 (14 files / 88 tests, including the real-Kroki diagram-rendering suite) — passed.
- `pnpm verify` and `pnpm verify:integration` (full pipelines) — both passed end-to-end.
- `pnpm openapi:generate` — passed, no diff.
- `git diff --check` on the commit — no whitespace issues.
- Local dev and test databases were reset once (dropped/recreated) after discovering the trigger-function regression described in §3; both were re-migrated from the full official history (12 migrations, zero to current) and re-verified green before committing.

## 12. Not verified

- Real external AI provider behavior/quality (only `FakeAIProvider`/disabled provider were exercised, per policy — ordinary tests never depend on live LLM services).
- Mockup generation (not started this increment).
- Traceability, Impact Analysis, Consistency Engine, baselines, readiness/export endpoints (not started).
- Any frontend (`apps/web` still has no application UI; only the default Next.js scaffold).
- Generality validation across a second, unrelated domain (only this repository's own fixtures were exercised).

## 13. Relevant decisions

- Kept the 4 new artifact kinds in one shared table family rather than four bespoke schemas, matching the existing `DiagramDetail` precedent — a deliberate DRY choice, not scope creep.
- `UI_BLUEPRINT` has no diagram; `getDiagram()` returns 404 with an explicit message rather than silently succeeding with an empty payload.
- Content columns are JSONB by design (genuinely variable structured payloads); the Artifact/ArtifactVersion/lifecycle/provenance skeleton around them stays fully relational, per AGENTS.md §31.1.
- Did not attempt Mockup, traceability, or the frontend in this same commit — the vertical slice was kept to what could be fully tested end-to-end (including against real Postgres and real Kroki) in one pass.

## 14. Git status

- Branch: `feature/first-deliverable-completion`.
- Commit: `9d312b1` — `feat(structured-analysis): add Navigation, Software/System Architecture and UI Blueprint` (31 files changed).
- Not pushed; no PR opened yet.
- The pre-existing local git stash was not touched.
