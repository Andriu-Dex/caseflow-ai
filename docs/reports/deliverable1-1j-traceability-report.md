# Increment 1J — Global provenance/traceability graph (Phase F)

Date: 2026-09-23

## 1. Implemented

`GET /projects/{projectId}/traceability` (`requirements.md` Phase F): a project-scoped node/edge provenance graph. Every returned node and edge is read directly from persisted exact-version data — nothing is inferred from stage adjacency.

## 2. Nodes

One node per `ArtifactVersion` across all 11 traced types (`PROJECT_SOURCE`, `PROJECT_CONTEXT`, `REQUIREMENT`, `USE_CASE`, `DATA_MODEL`, `USE_CASE_DIAGRAM`, `NAVIGATION_TREE`, `SOFTWARE_ARCHITECTURE`, `SYSTEM_ARCHITECTURE`, `UI_BLUEPRINT`, `MOCKUP`). Each node carries `artifactId`, `code`, `versionNumber`, `status`, `origin`, `title`, `isCurrent` (highest version number for that artifact), and one of:

- `generation` — for AI-generated artifacts: `generationId`, `candidateId`, `aiRunId`, `promptKey`, `promptVersion`, `provider`, `model`, `latencyMs`, `totalTokens`. Sourced from each artifact's own detail row plus `AIRun`; never exposes API keys or raw provider diagnostics. `provider`/`model` are reported exactly as recorded (e.g. `openai_compatible` + a requested route) without claiming this proves the physical upstream provider.
- `generator` — for deterministic artifacts (diagrams, mockups): `sourceFormat`, `generatorVersion`.

## 3. Edges (controlled vocabulary, every one backed by a real join row)

`SOURCE_SUPPORTS_CONTEXT` (`project_context_sources`), `CONTEXT_SOURCE_FOR_REQUIREMENT` (`RequirementDetail.sourceContextVersionId`), `REQUIREMENT_SOURCE_FOR_USE_CASE` (`UseCaseRequirementLink`), `SOURCE_FOR_DATA_MODEL` (`DataModelGenerationSource`, resolved via each Data Model's own `generationId`), `SOURCE_FOR_DIAGRAM` (`DiagramSourceVersion`, Use Case Diagram only — see §4), `SOURCE_FOR_STRUCTURED_ANALYSIS` (`StructuredAnalysisGenerationSource`, resolved the same way for Navigation/Architecture/UI Blueprint), `UI_BLUEPRINT_SOURCE_FOR_MOCKUP` (`MockupDetail.uiBlueprintVersionId`).

## 4. A real discovery while building this: self-referencing diagram "source" rows are not provenance

`DiagramSourceVersion` rows for ER, Navigation, Software Architecture and System Architecture diagrams are self-referencing by design (`source_artifact_version_id = diagram_version_id`) — a DB-level bookkeeping/immutability mechanism from Increments 1F.1/1F.2, not a cross-artifact dependency (those diagrams are embedded in the same artifact version they describe). Rendering them as graph edges would have produced meaningless self-loops. `SOURCE_FOR_DIAGRAM` explicitly filters `sourceArtifactVersionId !== diagramVersionId`, so it only ever fires for the one genuine cross-artifact case: Use Case Diagram, a separate artifact from the Use Case(s) it depicts. This is verified directly in tests (`edges.every((e) => e.fromId !== e.toId)`).

## 5. Verified end-to-end chain

The integration test builds a real 9-node chain — `PROJECT_SOURCE → PROJECT_CONTEXT → REQUIREMENT → USE_CASE → DATA_MODEL`, `USE_CASE → USE_CASE_DIAGRAM`, `REQUIREMENT → NAVIGATION_TREE → UI_BLUEPRINT → MOCKUP` — using real AI generation/acceptance (fake provider) and real deterministic diagram/mockup rendering, and asserts every expected edge is present with the correct type and endpoints, with no self-loops.

## 6. Tests

- Unit (`traceability.service.spec.ts`, 3 tests): empty project short-circuits with zero follow-up queries; `isCurrent` correctly distinguishes historical vs. latest version; a Requirement with no `sourceContextVersionId` produces no edge (never inferred).
- Integration (`traceability.integration.spec.ts`, 3 tests, real Postgres): the full 9-node/9-edge chain with generation/generator provenance assertions; project isolation (empty graph for an unrelated project); an `APPROVED` v1 remaining independently visible and distinct from a newer `DRAFT` v2 of the same artifact (`isCurrent` correctly tracks the latest version only).

## 7. Coverage

```
Statements : 81.5% (1498/1838)
Branches   : 72.58% (527/726)
Functions  : 80.71% (427/529)
Lines      : 82.31% (1392/1691)
```

All global thresholds (≥70%) remain cleared.

## 8. Verified

- `pnpm db:validate`, `pnpm db:generate` — passed.
- `pnpm format:check`, `pnpm lint`, `pnpm typecheck` (whole workspace) — passed.
- `pnpm build` (whole workspace) — passed.
- `pnpm test` (unit, 43 files / 254 tests) — passed.
- `pnpm test:coverage` — passed, all thresholds met.
- `pnpm test:integration` against real local PostgreSQL 18 (17 files / 104 tests) — passed.
- `pnpm verify` and `pnpm verify:integration` — both passed end-to-end.
- `pnpm openapi:generate` — passed, no diff.
- `git diff --check` — no whitespace issues.

## 9. Not verified / not yet done

Phase G (readiness), Phase H (export), Phase I (frontend), E2E, and push/PR/CI remain outstanding. This increment closes Phase F only. No pagination/filters (`artifactVersionId`, `artifactType`, `direction`) were added yet — the current project-scoped graph size is small enough for the First Deliverable scope; noted as a possible follow-up if a project grows large enough to need bounding.

## 10. Git status

- Branch: `feature/first-deliverable-completion`.
- Commit: `0f89885` — `feat(traceability): expose first-deliverable provenance graph` (10 files changed).
- Not pushed; no PR opened yet.
