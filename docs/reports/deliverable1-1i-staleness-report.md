# Increment 1I — Potential-impact / staleness analysis (Phase E)

Date: 2026-09-23

## 1. Implemented

`GET /projects/{projectId}/staleness`: a bounded, deterministic analysis (`requirements.md` Phase E) that detects when newer approved project knowledge exists outside an artifact's exact approved provenance. No AI, no semantic comparison, no mutation of historical `APPROVED` `ArtifactVersion`s.

## 2. Impact states and reasons

Three states, matching the domain vocabulary from `requirements.md`/`instruction.md`:

- `CURRENT` — no relevant newer knowledge detected.
- `NEWER_APPROVED_KNOWLEDGE_AVAILABLE` — the current `APPROVED` Project Context itself is affected.
- `POTENTIALLY_AFFECTED` — a downstream artifact was derived from a context version that is now flagged.

Two reason types produce the context-level flag:

- `NEWER_APPROVED_SOURCE_VERSION` — a Project Source already linked to the context has a newer `APPROVED` version than the one linked (the exact `SRC-001 v1 → v2` example from the spec).
- `NEW_APPROVED_SOURCE_NOT_LINKED` — an `APPROVED` Project Source exists that the context never linked at all (the exact `SRC-007` "entirely new source" example from the spec).

## 3. Bounded propagation (two hops, not a general Impact Analysis engine)

1. Project Context (current `APPROVED` version) — checked directly.
2. Requirements whose `RequirementDetail.sourceContextVersionId` points at that exact context version — flagged `POTENTIALLY_AFFECTED` with reason `CONTEXT_POTENTIALLY_AFFECTED` when the context itself is flagged.
3. Use Cases whose `UseCaseRequirementLink` points at a flagged Requirement version — flagged `POTENTIALLY_AFFECTED` with reason `REQUIREMENT_POTENTIALLY_AFFECTED`.

This exactly matches both worked examples in `requirements.md`/`instruction.md` (`SRC-001 → Context → RF-001 → CU-001`). Deeper stages (Data Model, Navigation/Architecture, UI Blueprint, Mockup) are **not** covered by this pass — a deliberate, documented scope boundary, not a silent gap, consistent with the explicit instruction not to build a large Impact Analysis subsystem. Every relevant Context/Requirement/Use Case is reported, not only the flagged ones, so the endpoint gives a complete deterministic picture (`CURRENT` for the majority in the normal case) rather than a warnings-only view.

## 4. No new persistence for derived state

The analysis is computed on demand from existing tables (`project_context_sources`, `RequirementDetail.sourceContextVersionId`, `UseCaseRequirementLink`, plus each artifact's own version history) — nothing new is stored, per the explicit "prefer a derived analysis rather than mutating historical Artifact status" instruction.

## 5. API / contract

`stalenessAnalysisResponseSchema`: `{ projectId, generatedAt, entries: [{ artifactId, artifactVersionId, artifactType, code, versionNumber, status, impactState, reasons: [{ type, sourceArtifactId, sourceVersionId, message }] }] }`. No secrets or internal identifiers beyond artifact/version IDs and codes are exposed.

## 6. Tests

- Unit (`staleness.service.spec.ts`, 5 tests): no-context project returns empty; all-current case; the two reason types individually; confirms the service never calls `artifactVersion.update` (read-only analysis).
- Integration (`staleness.integration.spec.ts`, 4 tests, real Postgres): full CURRENT baseline; the exact `SRC-001 v1→v2` scenario propagated through a real AI-generated-and-accepted Requirement and a real linked Use Case, asserting the original `APPROVED` Requirement version's DB row is untouched; the "entirely new unlinked source" scenario; project isolation (a project with no context returns no entries, never another project's data).

## 7. Coverage

```
Statements : 82.55% (1443/1748)
Branches   : 73.63% (511/694)
Functions  : 82.67% (420/508)
Lines      : 83.39% (1341/1608)
```

All global thresholds (≥70%) remain cleared.

## 8. Verified

- `pnpm db:validate`, `pnpm db:generate` — passed.
- `pnpm format:check`, `pnpm lint`, `pnpm typecheck` (whole workspace) — passed.
- `pnpm build` (whole workspace) — passed.
- `pnpm test` (unit, 42 files / 251 tests) — passed.
- `pnpm test:coverage` — passed, all thresholds met.
- `pnpm test:integration` against real local PostgreSQL 18 (16 files / 101 tests) — passed.
- `pnpm verify` and `pnpm verify:integration` — both passed end-to-end.
- `pnpm openapi:generate` — passed, no diff.
- `git diff --check` — no whitespace issues.

## 9. Not verified / not yet done

Phase F (global traceability), Phase G (readiness), Phase H (export), Phase I (frontend), E2E, and push/PR/CI remain outstanding. This increment closes Phase E only.

## 10. Git status

- Branch: `feature/first-deliverable-completion`.
- Commit: `bbb1a4b` — `feat(traceability): add bounded deterministic project staleness analysis` (11 files changed).
- Not pushed; no PR opened yet.
