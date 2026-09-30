# Increment 1G — Project Context ↔ Sources provenance

Date: 2026-09-23

## 1. Implemented

`requirements.md` Phase B: Project Context can now record which exact `APPROVED` `PROJECT_SOURCE` versions support it, answering "which approved source versions support this Project Context?" This also closes the remaining gap in Phase C's target provenance chain, since `RequirementGeneration.sourceContextVersionId` already existed from prior work.

## 2. Prior-state audit

Before this increment, `Project Source` intake (upload, extraction, AI-assisted report with candidate/review, manual transcription/report fallback, explicit approval) and ISO/IEC/IEEE 29148:2018-aligned Requirements generation + the deterministic Requirement Quality Report were already implemented and committed in earlier session work (`3d3801f`, `e13b4bd`), predating this continuation. This was verified by direct inspection of `SourcesService`, the source contract, and `requirements.service.ts` before starting new work, to avoid duplicating already-correct functionality. The one confirmed gap was: Project Context had no reference to Sources at all.

## 3. Data model / migration

`20260925000000_project_context_sources` (additive): a new `project_context_sources` join table (`project_context_version_id`, `source_version_id`), insert-only (immutability trigger, matching every other provenance join table in the schema), with a validating trigger requiring the source version to be an exact `APPROVED` `PROJECT_SOURCE` version in the same project as the context version.

## 4. API / contract

`projectContextRequestSchema` gained an optional `sourceVersionIds` (defaults to `[]`); `projectContextResponseSchema` gained a resolved `sources: [{id, versionId, code, title}]` array. No new routes — `POST /projects/{projectId}/context` and `.../context/versions` both accept the new field, and `GET /projects/{projectId}/context` now returns it.

## 5. Provenance chain now traceable

```
Project Source version (APPROVED)
  -> Project Context version (via project_context_sources)
  -> RequirementGeneration (via sourceContextVersionId, pre-existing)
  -> RequirementCandidate
  -> Requirement ArtifactVersion (via RequirementDetail.sourceContextVersionId, pre-existing)
```

No change was needed in `RequirementsService` itself — it already threaded the context version through; only the missing Source-to-Context link was added.

## 6. Constraints preserved

- Adding a source later never mutates an existing approved Project Context version — a new context version must be created to add source links (Project Context is a full-snapshot-per-version artifact, consistent with its pre-existing versioning model).
- `PROJECT_SOURCE`/`PROJECT_CONTEXT` remain fully isolated per project; the trigger rejects cross-project source references, and the service pre-validates the same to return a clean 422 instead of a raw DB error.

## 7. Tests

- Unit: 2 new `project-context.service.spec.ts` tests (exact-APPROVED-source validation + rejection, response mapping of the `sources` array).
- Integration (real Postgres): 2 new `project-context.integration.spec.ts` tests — real Source creation → approval → Context linkage with a real HTTP-contract-valid response, and rejection of a draft (unapproved) or cross-project source.

## 8. Coverage

```
Statements : 83.04% (1406/1693)
Branches   : 74.43% (492/661)
Functions  : 82.66% (415/502)
Lines      : 83.82% (1306/1558)
```

All global thresholds (≥70%) remain cleared.

## 9. Verified

- `pnpm db:validate`, `pnpm db:generate` — passed.
- `pnpm format:check`, `pnpm lint`, `pnpm typecheck` (whole workspace) — passed.
- `pnpm build` (whole workspace) — passed.
- `pnpm test` (unit, 41 files / 246 tests) — passed.
- `pnpm test:coverage` — passed, all thresholds met.
- `pnpm test:integration` against real local PostgreSQL 18 (15 files / 94 tests) — passed.
- `pnpm verify` and `pnpm verify:integration` — both passed end-to-end.
- `pnpm openapi:generate` — passed, no diff.
- `git diff --check` — no whitespace issues.
- Migration applied cleanly to both the local dev and test databases from the existing history (13 migrations total, zero to current).

## 10. Not verified / not yet done

Everything else in `instruction.md`'s remaining phase list is still outstanding: cross-stage approval-gate audit with dedicated tests (Phase D), staleness/potential-impact warnings (Phase E), traceability query endpoint (Phase F), readiness endpoint (Phase G), export (Phase H), the entire frontend (Phase I), E2E tests, and push/PR/CI. This increment closes Phase B only (and, as a side effect, the last open piece of Phase C's provenance requirement).

## 11. Git status

- Branch: `feature/first-deliverable-completion`.
- Commit: `657487f` — `feat(traceability): link Project Context to its exact approved Sources` (6 files changed).
- Not pushed; no PR opened yet.
