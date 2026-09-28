# Increment 1M — Readiness Hardening Closure + First Deliverable Export (Phase H)

## Implemented

### Hardening checks (pre-Phase H, requested in instruction.md)

1. **Authoritative-selection tie-break.** Extracted the "current authoritative
   version" selection logic out of `ReadinessService` into a new shared
   `FirstDeliverableSnapshotService` (`apps/api/src/first-deliverable/`), so
   Export can reuse the exact same policy instead of re-implementing it.
   Added an explicit deterministic tie-break for identical `approvedAt`
   timestamps: `approvedAt DESC → versionNumber DESC → artifactId ASC`
   (never a fallback to lexicographic code order).
2. **Traceability dangling-edge invariant.** Added a regression test proving
   every edge returned by `TraceabilityService.buildGraph()` has both
   endpoints present in the (possibly truncated) node set.

### Phase H — First Deliverable Export

- `GET /projects/:projectId/export?format=json|html` (`apps/api/src/export/`).
- `ExportService.buildSnapshot(projectId)` composes the export by calling
  each feature service's own `.list()`/`.get()`-style methods, never
  re-querying Prisma for content that already has an owning service.
  Authoritative version selection for every project-level singleton type
  (`PROJECT_CONTEXT`, `DATA_MODEL`, `NAVIGATION_TREE`,
  `SOFTWARE_ARCHITECTURE`, `SYSTEM_ARCHITECTURE`, `UI_BLUEPRINT`) is
  delegated exclusively to `FirstDeliverableSnapshotService` — the same
  policy Readiness uses, never duplicated.
- Use Case Diagram and Mockup selection are small, bounded lookups kept
  local to `ExportService` (mirroring `ReadinessService`'s own matching),
  since these artifact types have an existence-plus-match rule rather than
  a simple "most recently approved" rule.
- Added exact-version lookup methods — `getVersion`,
  `getDiagramForVersion`, `getERDiagramForVersion` — to
  `ProjectContextService`, `DataModelsService` and
  `StructuredAnalysisService`, because their existing `get()`/`getDiagram()`
  always resolve the _latest_ version regardless of status. That is
  correct for editing UIs but wrong for Export, which must never let a
  newer DRAFT displace a previously APPROVED version.
- Added `listApproved()` (Requirements, Use Cases) and
  `listApprovedForBlueprint()` (Mockups) collection methods for the same
  reason — each returns, per artifact, its own highest APPROVED version.
- `export-html.ts`: escapes every project-controlled/AI-generated string
  before interpolation (`escapeHtml`); embeds only diagram/mockup SVG that
  already passed the trusted `sanitizeDiagramSvg()` boundary.
- The controller validates the composed snapshot against
  `firstDeliverableExportSchema` before returning it, and sets a
  deterministic `Content-Disposition` filename derived only from
  `projectId` (never from the project's own untrusted display name).
- PDF was explicitly not added (spec: optional, P1).

## Key design decisions

- Reuse over re-querying: every export field comes from an existing
  service's mapped response type, wired through `ExportModule`'s imports,
  to avoid a second field-mapping surface that could drift from the
  editing APIs.
- Small additive service methods rather than exposing internal mapping
  functions: each new method (`getVersion`, `listApproved`, etc.) mirrors
  an existing sibling method's shape/pattern in its own file.

## Tests

- Unit: `first-deliverable-snapshot.service.spec.ts` (3 tests — most-recent
  wins, tie-break, null-when-none-approved), `export.service.spec.ts` (6
  tests — empty project, no quality-report call when no approved
  requirements, snapshot-service reuse, exact-version fetch, unknown
  project rejection, mockup-blueprint matching), `export-html.spec.ts` (7
  tests — escaping of the exact XSS payloads named in the spec, trusted SVG
  passthrough).
- Traceability: added the dangling-edge invariant test.
- Readiness: updated to construct a real `FirstDeliverableSnapshotService`
  against the same mocked Prisma object (no behavior change; all prior
  assertions pass unmodified).
- Integration (`export.integration.spec.ts`, 5 tests, live Postgres): empty
  project; cross-project isolation; newer DRAFT context not displacing the
  APPROVED one; no binary/`storageKey` leakage in JSON; HTML escaping of a
  malicious project name end-to-end through the real DB and schema
  validation.

## Verified

- `pnpm run typecheck` — clean.
- `pnpm run lint` — clean.
- `pnpm run format` / `format:check` — clean.
- `pnpm run build` — all workspaces build.
- `pnpm run test` — 50 files / 282 tests passed.
- `pnpm run test:coverage` — global 80.36% stmts / 72.26% branches / 78.77%
  funcs / 81.14% lines (threshold ≥70% on all four, met).
- `pnpm run verify` (format:check+lint+typecheck+build+test+coverage) — passed end to end.
- `pnpm run db:validate` — schema valid.
- `pnpm run openapi:generate` — regenerated successfully with the new route.
- `pnpm run verify:integration` (db:test:prepare+migrate+integration suite) —
  19 files / 117 tests passed against live Postgres.
- `git diff --check` — no whitespace issues.

## Not verified

- Remote CI (Quality/Integration workflows) — not triggered; branch not
  yet pushed.
- Frontend (Phase I) — out of scope for this increment; `apps/web` is
  still the default scaffold.

## Notes

- Two commits: `refactor(readiness): centralize authoritative-version
selection with deterministic tie-break` (hardening checks) and
  `feat(export): add First Deliverable JSON/HTML export (Phase H)`.
- Remaining scope per instruction.md: Phase I (Frontend), E2E/hardening
  audit, final documentation sync (`CASEFLOW_AI_SPEC.md`,
  `docs/FIRST_DELIVERABLE_MVP.md`, `README.md`), full verification, and
  push/PR to `develop`.
