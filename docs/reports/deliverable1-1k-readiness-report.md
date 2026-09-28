# Increment 1K — First Deliverable readiness evaluation (Phase G)

Date: 2026-09-23

## 1. Implemented

`GET /projects/{projectId}/readiness` (`requirements.md` Phase G): a read-only, deterministic evaluation of persisted authoritative state across 13 stages. It never creates, approves, or mutates anything, and never fabricates readiness — the same DB state always produces the same result except `generatedAt`.

## 2. Authoritative version selection policy (documented)

For each artifact, the authoritative version is the highest-`versionNumber` version with `status=APPROVED` — never "latest version regardless of status." A newer `DRAFT` edit of an already-`APPROVED` artifact never displaces the approved evidence used by readiness (verified directly by a dedicated test). When multiple artifacts of the same type exist (Data Model, Navigation, Architecture, UI Blueprint), they are ordered by `code` ascending and the first one with a qualifying `APPROVED` version is used — a documented, deterministic tie-break, not a semantic choice, since the specification does not define a "primary" artifact among several of the same type.

## 3. Stages and key rules

`SOURCES`, `CONTEXT` (requires ≥1 linked `APPROVED` Source — a source-less `APPROVED` Context does not satisfy this stage, mirroring Increment 1H's Requirements gate), `REQUIREMENTS` (RF/RNF counts; quality findings are **warnings**, never blockers), `USE_CASES` (academic minimum 4, evaluated against `APPROVED` count only, never candidates), `USE_CASE_DIAGRAM` (this artifact has no approval capability of its own — satisfied by existence + exact sourcing to the currently-`APPROVED` Use Cases), `DATA_MODEL`, `ER_DIAGRAM` (must belong to the exact selected `APPROVED` Data Model version), `NAVIGATION`, `SOFTWARE_ARCHITECTURE`, `SYSTEM_ARCHITECTURE` (each also requires its own generated diagram), `UI_BLUEPRINT`, `MOCKUPS` (must point at the exact selected `APPROVED` UI Blueprint version and be itself `APPROVED`), `IMPACT`.

## 4. IMPACT stage policy

Reuses Phase E (`StalenessService`) directly: the Context's own `NEWER_APPROVED_KNOWLEDGE_AVAILABLE` state is the only hard blocker (a project may not report fully ready while its Context knowingly excludes newer approved source knowledge). `POTENTIALLY_AFFECTED` entries (Requirements/Use Cases) are surfaced as warnings, then a bounded (max 5 hops) walk over the Phase F traceability graph extends this into `DOWNSTREAM_REVIEW_RECOMMENDED` warnings for further downstream artifacts — never claiming semantic incorrectness, never escalating to a blocker.

## 5. A real gap discovered and fixed: Data Model had no approval path at all

While testing the `DATA_MODEL` stage, `DataModelsService` was found to have **no `transition()` method** — every other lifecycle-managed artifact type (Requirement, Use Case, Structured Analysis, Mockup) had one, but Data Model did not, meaning a Data Model could be created/accepted (`GENERATED`) but could never reach `APPROVED` through the real API. Since Phase G explicitly requires an `APPROVED` Data Model, this stage would have been permanently unsatisfiable. Fixed by adding `DataModelsService.transition()` and `POST /projects/{projectId}/data-models/{dataModelId}/versions/{versionId}/transition`, mirroring the existing pattern exactly (unit + integration tested).

## 6. Tests

- Integration (`readiness.integration.spec.ts`, real Postgres, 7 tests): empty project; unapproved source; approved source with no Context; source-less approved Context; the full authoritative chain built incrementally end-to-end (Source → Context → Requirement → 4× Use Case → Use Case Diagram → Data Model (`GENERATED` rejected, then `APPROVED` accepted) → Navigation → Software Architecture → System Architecture → UI Blueprint → Mockup) reaching `ready: true` with zero blockers, then a brand-new approved Source reintroducing the IMPACT blocker; historical `APPROVED` v1 remaining authoritative over a newer `DRAFT` v2; project isolation.
- Unit (`readiness.service.spec.ts`, 5 tests; plus 3 new thin controller-delegation specs for Readiness/Staleness/Traceability): empty-project stage-by-stage state; no mutation side effects; quality findings as warnings; every "satisfied" branch across all 13 stages with mocked authoritative evidence, including the downstream-warning propagation; the Context-level staleness blocker.
- `data-models.service.spec.ts`: added lifecycle-transition-rule coverage for the new `transition()` method.

## 7. Coverage

```
Statements : 82.85% (1633/1971)
Branches   : 74.25% (620/835)
Functions  : 82.09% (463/564)
Lines      : 83.58% (1512/1809)
```

All global thresholds (≥70%) remain cleared; `readiness.service.ts` itself is at 99.16% branch coverage.

## 8. Verified

- `pnpm db:validate`, `pnpm db:generate` — passed.
- `pnpm format:check`, `pnpm lint`, `pnpm typecheck` (whole workspace) — passed.
- `pnpm build` (whole workspace) — passed.
- `pnpm test` (unit, 47 files / 263 tests) — passed.
- `pnpm test:coverage` — passed, all thresholds met.
- `pnpm test:integration` against real local PostgreSQL 18 (18 files / 111 tests) — passed.
- `pnpm verify` and `pnpm verify:integration` — both passed end-to-end.
- `pnpm openapi:generate` — passed, no diff.
- `git diff --check` — no whitespace issues.

## 9. Not verified / not yet done

Phase H (export), Phase I (frontend), E2E, and push/PR/CI remain outstanding. This increment closes Phase G. The two Phase F closure items noted in `instruction.md` (bounded traceability response, explicit Software/System Architecture edge tests) are also still outstanding and were not folded into this commit.

## 10. Git status

- Branch: `feature/first-deliverable-completion`.
- Commit: `b8751b9` — `feat(readiness): add First Deliverable readiness evaluation` (17 files changed).
- Not pushed; no PR opened yet.
