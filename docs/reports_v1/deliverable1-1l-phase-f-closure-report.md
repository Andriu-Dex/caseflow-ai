# Increment 1L — Phase F/G closure items (A–D)

Date: 2026-09-23

## 1. Implemented

The four mandatory pre-final closure items from `instruction.md`.

**A — Traceability bounding.** `GET /projects/{projectId}/traceability` now caps at `TRACEABILITY_MAX_NODES` (500) / `TRACEABILITY_MAX_EDGES` (1000), returning `truncated: true` explicitly rather than an unbounded or silently-dropped response. Verified by a unit test (501 mocked versions → exactly 500 nodes, `truncated: true`) and an integration test confirming `truncated: false` for a normal-size project.

**B/C — Software/System Architecture edge evidence.** The full-chain traceability integration test previously exercised `NAVIGATION_TREE`/`UI_BLUEPRINT` generation but not `SOFTWARE_ARCHITECTURE`/`SYSTEM_ARCHITECTURE`. Both are now generated and accepted for real in that test, with explicit `SOURCE_FOR_STRUCTURED_ANALYSIS` edge assertions from `NAVIGATION_TREE` to each — backed by a real persisted `StructuredAnalysisGenerationSource` row, not inferred.

**D — Readiness authoritative selection policy.** Previously, when several artifacts of the same type each had an `APPROVED` version, `ReadinessService` picked the lexicographically-first `code` — arbitrary. Now it picks the **most recently approved** one (`approvedAt` descending), applied uniformly to Data Model, Navigation, Software/System Architecture and UI Blueprint. This is still fully deterministic (`approvedAt` is set once, at the exact transition, never mutated afterward) and preserves the existing rule that a newer `DRAFT` never displaces an artifact's own `APPROVED` version.

## 2. Tests

- `traceability.service.spec.ts`: bounding unit test.
- `traceability.integration.spec.ts`: untruncated-graph test; Software/System Architecture edges folded into the existing full-chain test.
- `readiness.service.spec.ts`: multiple-same-type-artifacts test proving the most-recently-approved one is selected, not the first by code.

## 3. Coverage

```
Statements : 82.78% (1640/1981)
Branches   : 74.79% (632/845)
Functions  : 82.09% (463/564)
Lines      : 83.56% (1520/1819)
```

All global thresholds (≥70%) remain cleared.

## 4. Verified

- `pnpm db:validate`, `pnpm db:generate` — passed.
- `pnpm format:check`, `pnpm lint`, `pnpm typecheck` (whole workspace) — passed.
- `pnpm build` (whole workspace) — passed.
- `pnpm test` (unit, 47 files / 265 tests) — passed.
- `pnpm test:coverage` — passed, all thresholds met.
- `pnpm test:integration` against real local PostgreSQL 18 (18 files / 112 tests) — passed.
- `pnpm verify` and `pnpm verify:integration` — both passed end-to-end.
- `pnpm openapi:generate` — passed, no diff.
- `git diff --check` — no whitespace issues.

## 5. Not verified / not yet done

Phase H (export), Phase I (frontend), E2E, documentation updates, and push/PR/CI remain outstanding.

## 6. Git status

- Branch: `feature/first-deliverable-completion`.
- Commit: `7f087e0` — `fix(traceability): bound graph response; refine readiness selection policy` (7 files changed).
- Not pushed; no PR opened yet.
