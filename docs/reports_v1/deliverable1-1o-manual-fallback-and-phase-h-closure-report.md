# Increment 1O — Manual Non-AI Fallback Closure + Phase H Closure Evidence

## Context

`instruction.md` marked the remaining task as "FINAL CLOSURE" covering 11
items (manual fallbacks, expanded test coverage, Playwright E2E, Phase H
closure, hardening, documentation sync, full verification, push, PR, remote
CI, and the FINAL COMPLETION REPORT). It explicitly called out one item as a
**critical blocker**: the frontend required a configured AI provider to
create Use Cases, Data Models, Navigation, Software Architecture, System
Architecture, and UI Blueprints, violating AGENTS.md §4.6 ("Core CASE
functionality must remain usable when external AI... [is] unavailable").

This increment closes that blocker and the Phase H closure evidence gap.
The remaining FINAL CLOSURE items (broader test coverage, Playwright E2E,
further hardening, documentation sync, push/PR/CI) are not yet done — see
"Not verified" below. The FINAL COMPLETION REPORT format is intentionally
not used here for the same reason as the previous increment: claiming it
before the full Definition of Done is met would violate AGENTS.md's
prohibition on claiming verification that was not performed.

## Implemented

### Manual non-AI creation (critical blocker closure)

- `UseCaseManualForm` — name/objective/primary actor/secondary actors/
  preconditions/postconditions/main-flow-step editor; approved Requirements
  offered as selectable cards, never an ArtifactVersion UUID field.
- `DataModelManualForm` — entity/attribute editor (name, conceptual type,
  required/PK/unique) and a relationship editor referencing entities by
  name; never Mermaid authoring. The existing deterministic `DiagramEngine`
  still produces the ER diagram automatically on manual `create()`,
  unchanged.
- `NavigationManualForm`, `SoftwareArchitectureManualForm`,
  `SystemArchitectureManualForm`, `UiBlueprintManualForm` — structured row
  editors (nodes/components/screens), never PlantUML/Mermaid/raw JSON.
  Wired into the existing shared `StructuredKindPage`, so all four kinds
  gained the fallback through one integration point.
- Every affected page now shows "Generar con IA" and "Crear manualmente"
  side by side, with a short note that AI generation requires a configured
  provider — addressing the "AI DISABLED UX" requirement without needing to
  detect provider configuration client-side (the manual path is simply
  always available, per spec: "AI is assistance, not a mandatory
  dependency").
- All six call the backend's existing manual `create()` endpoint directly
  (`origin=MANUAL`, `status=DRAFT`), with no generation/candidate step.

### Phase H closure evidence (backend, `export.integration.spec.ts`)

Added the specific evidence instruction.md called out as missing:

- Readiness, staleness, and traceability summaries present in every export
  (including an empty project).
- The ER diagram bound to the exact selected authoritative Data Model
  version when two Data Models are both APPROVED — proving the shared
  `FirstDeliverableSnapshotService` selection policy (most-recently-approved
  wins), not a second/duplicated rule.
- A Mockup bound to the exact selected authoritative UI Blueprint version.
- HTTP-level `Content-Type` and deterministic `Content-Disposition`
  assertions for both JSON and HTML export responses, including a project
  named with `Content-Disposition`-injection-shaped characters, proving the
  filename never derives from the project's own untrusted name.

### TrustedSvg hardening

- A static test (`trusted-svg-boundary.spec.ts`) scans every frontend
  source file and asserts `dangerouslySetInnerHTML` appears only in
  `trusted-svg.tsx`, so a future component cannot silently add its own raw
  SVG insertion point.

### Small contract addition

- Exported `ConceptualAttributeType`/`DataModelCardinality` types from the
  Data Model contract (previously only the const arrays were exported), so
  the new manual form types against the same source of truth as the
  backend rather than a locally re-declared union.

## Tests

- Frontend: 3 new files — `manual-fallback.spec.tsx` (6 tests, one per
  manual-creation path, asserting the backend manual `create()` call shape
  with no AI provider invoked), `trusted-svg-boundary.spec.ts` (2 tests).
  Frontend suite: 8 files / 19 tests (up from 6/11).
- Backend: 5 new tests in `export.integration.spec.ts` (summaries present,
  Data Model/ER diagram correspondence with multi-approved selection,
  Mockup/UI Blueprint correspondence, JSON headers, HTML headers). Export
  integration suite: 10 tests (up from 5).

## Verified

- `pnpm run typecheck` (whole workspace) — clean.
- `pnpm run lint` (whole workspace) — clean.
- `pnpm run format` / `format:check` — clean.
- `pnpm run build` (whole workspace, `apps/web` production build, 13 routes)
  — clean.
- `pnpm run test` (backend) — 51 files / 283 tests passed.
- `pnpm --filter @caseflow-ai/web run test` — 8 files / 19 tests passed.
- `pnpm run test:coverage` — global 80.35% stmts / 72.1% branches / 78.78%
  funcs / 81.12% lines (threshold ≥70% on all four, met).
- `pnpm run db:validate` — schema valid.
- `pnpm run openapi:generate` — regenerated successfully.
- `pnpm run verify:integration` — 19 files / 122 tests passed against live
  Postgres.
- `git diff --check` — no whitespace issues.

## Not verified (remaining FINAL CLOSURE scope)

- Only 6 of the ~22 behaviors from instruction.md's "COMPLETE WEB BEHAVIOR
  TEST COVERAGE" list gained new automated coverage this increment (manual
  fallback paths). The remaining unlisted-but-implemented behaviors (Source
  semantic form, manual extraction fallback, Context source selection,
  ISO quality-warning display, lifecycle controls, Use Case academic
  progress ratio, Mockup preview, locked-stage explanation) still lack a
  dedicated automated assertion.
- Playwright E2E (both Scenario A — manual/no-AI path — and Scenario B —
  generated visual) not implemented.
- Accessibility hardening pass, CORS/API-base-URL production-mode audit,
  and the loading/empty/error state audit across all 13 primary pages were
  not performed as a dedicated pass this increment (each page does have
  basic handling from the previous increment, but no fresh audit was run
  against instruction.md's specific checklist).
- Documentation sync (`CASEFLOW_AI_SPEC.md`, `docs/FIRST_DELIVERABLE_MVP.md`,
  `README.md`) not done.
- No interactive/browser smoke verification was performed (no browser tool
  available in this session); this remains an explicit gap, not a claimed
  pass.
- Not pushed; no PR opened; remote Quality/Integration CI not run.

## Notes

- Two commits: `fix(web): add manual non-AI creation for Use Cases, Data
Model and structured analysis` and `test(export): close Phase H evidence;
add TrustedSvg boundary hardening check`.
- Given the remaining scope (Playwright setup and scenarios, full
  behavior-test coverage, hardening passes, documentation sync, and the
  publish sequence) is substantial, the next increment should continue in
  the same priority order instruction.md gave: complete remaining
  high-value frontend tests, then Playwright E2E, then hardening, then
  documentation, then full verification and publish — only then is the
  FINAL COMPLETION REPORT appropriate.
