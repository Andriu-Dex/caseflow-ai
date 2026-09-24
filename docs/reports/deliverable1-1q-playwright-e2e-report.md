# Increment 1Q — Missing Manual Requirement Path + Playwright E2E Scenario A

## Context

Continuing `instruction.md`'s "FINAL VALIDATION AND PUBLICATION" list (A–O).
This increment closes item A's remaining decision (Software Architecture
layer association), adds the field-level test evidence item B asked for,
and — the item repeatedly flagged across the last three increments as the
single largest remaining gap — implements and **actually runs** Playwright
E2E Scenario A against real local infrastructure (Postgres, SeaweedFS,
Kroki were already running in this environment). The FINAL COMPLETION
REPORT is still not used: Scenario B, the G/H/K audits, and the full
publish sequence (push/PR/CI/wait) remain undone.

## Implemented

### A — Software Architecture layer association (final decision)

Inspected `softwareArchitectureContentSchema`: there is no separate Layer
entity anywhere in the contract — `component.layerLocalId` is the *only*
Component→Layer mechanism, and it is typed as a generic string (`localId()`,
not a UUID). Per the instruction, this means it must get a normal UI
control, not stay omitted. Added a text input backed by a browser-native
`<datalist>` populated from layer names already typed on other components
in the same form — the user types a layer name once, then subsequent
components can select it instead of retyping it. The layer's own name is
used directly as its `layerLocalId`, since the schema never distinguishes
a "layer id" from a "layer name."

### Discovered gap — no manual Requirement creation path

While preparing the E2E Scenario A flow (which requires manually creating
a downstream artifact after approving a Context), found that **Requirements
had no manual creation form at all** — only "Generar con IA". Since Use
Cases require an already-approved Requirement to reference, this silently
blocked the entire manual-only workflow at the very first downstream step,
which AGENTS.md §4.6 requires to remain usable without AI. Added
`RequirementManualForm` (type/name/description/priority/actors/
preconditions/postconditions) next to "Generar con IA" on the Requirements
page, calling the backend's existing manual `create()` endpoint.

### B — Field-level test evidence for restored manual-form fields

Extended `manual-fallback.spec.tsx` with representative (not
one-per-field) interactions proving the fields restored in Increment 1P
reach the backend payload: a Use Case alternative flow (name/condition/
steps); a Data Model relationship across two entities (name, both
cardinalities, description) plus entity/attribute descriptions; a
Navigation node's description and related Use Case codes; a Software
Architecture dependency, decision and the new layer association; a System
Architecture communication link with protocol/description; a UI Blueprint
screen's related Use Cases, navigation reference, sections, secondary
actions, principal data, forms and states. Added accessible names to the
relationship/dependency/link controls that had none, both for testability
and because they were the only unlabeled controls in their forms.

### D — Playwright E2E, Scenario A (the mandatory no-AI professor flow)

Added `@playwright/test` (pinned 1.55.0) as repository tooling
(`playwright.config.ts`, `e2e/`), configured against local infrastructure
only:

- an isolated Postgres test database (`caseflow_test`, the same one
  backend integration tests use — `e2e/global-setup.ts` runs the existing
  `db:test:prepare`/`db:test:migrate` scripts, then seeds one workspace);
- the API launched with `AI_PROVIDER=disabled` and `DIAGRAM_RENDERER=disabled`
  (set directly in the webServer `env`, never read from the developer's
  own `.env`);
- no public/hosted service of any kind.

`e2e/scenario-a-no-ai.spec.ts` drives the full mandatory flow through a
real Chromium browser: open the app at zero-project state → create a
project through the UI → create a TEXT/NOTES Source → upload a real file
→ submit/approve it → write its manual interpretation (no AI report
generation) → create a Project Context selecting that Source through the
UI (no raw UUID entry) → submit/approve the Context → manually create a
Requirement (no AI) → submit/approve it → return to Home and verify the
readiness stage grid visibly reflects the progression. No direct API call
stands in for any user-facing step; Playwright's own auto-waiting
locators/assertions are used throughout, no arbitrary `sleep()`.

**This test was run against the real local stack, not just written.**
Running it surfaced a genuine production bug — see below — and, once
fixed, the scenario passes reliably (verified twice in a row).

### Bug found and fixed via the new E2E: broken file uploads

`lib/api.ts`'s shared fetch helper unconditionally set
`Content-Type: application/json` whenever a request had a body — including
Source uploads, whose body is a `FormData` (multipart/form-data). This
stripped the browser's own multipart boundary header, so every real file
upload through the browser failed with a body the backend could parse as
neither JSON nor multipart. No unit test caught this because they all mock
`api.sources.create` directly rather than exercising the fetch helper
itself — exactly the class of defect instruction.md's repeated "browser
smoke verification" requirement exists to catch. Fixed: the helper now
detects a `FormData` body and never sets `Content-Type` for it.

### E (partial) — Playwright wired into CI

Added to the Integration job: `npx playwright install --with-deps chromium`
(deterministic browser install) then `pnpm run test:e2e`, running after the
existing backend integration suite, with the HTML report uploaded only on
failure. Frontend unit tests were already wired into Quality in Increment
1P. Not yet done: confirming this actually passes on a real GitHub Actions
runner (only verified locally in this session).

### Supporting changes

- `e2e/tsconfig.json` + `package.json`'s `typecheck` script now cover
  `e2e/` and `playwright.config.ts` — previously nothing checked files
  outside `apps/*`, `packages/*`, and `tests/`.
- Added `@types/node` as a root devDependency (pinned to the same version
  already used by `apps/api`/`apps/worker`) — needed for `node:child_process`
  in `e2e/global-setup.ts`, and previously absent from the root project.
- Exported `RequirementType`/`RequirementPriority` from the Requirements
  contract (previously only the const arrays were exported), matching the
  pattern already used for the Data Model contract.

## Tests

- Frontend: `manual-fallback.spec.tsx` now 8 tests (up from 6), covering
  the new Requirement manual path and the field-level evidence above.
  Frontend suite: 8 files / 21 tests.
- E2E: 1 Playwright test (Scenario A), run twice locally against real
  infrastructure — both passed.
- Backend: unchanged existing suites.

## Verified

- `pnpm run typecheck` (whole workspace, including the new `e2e/tsconfig.json`)
  — clean.
- `pnpm run lint` — clean.
- `pnpm run format` / `format:check` — clean.
- `pnpm run build` (whole workspace) — clean.
- `pnpm run test` (backend) — 51 files / 283 tests passed.
- `pnpm --filter @caseflow-ai/web run test` — 8 files / 21 tests passed.
- `pnpm run test:coverage` — global 80.35% stmts / 72.1% branches / 78.78%
  funcs / 81.12% lines (threshold ≥70% on all four, met).
- `pnpm run db:validate` — schema valid.
- `pnpm run openapi:generate` — regenerated successfully.
- `pnpm run verify:integration` — 19 files / 123 tests passed against live
  Postgres.
- `pnpm run test:e2e` (`npx playwright test`) — **run directly against
  this environment's real Postgres/SeaweedFS/Kroki containers** — 1/1
  passed, twice in a row. This is genuine browser smoke verification, not
  a claimed-but-unperformed check.
- `git diff --check` — no whitespace issues.

## Not verified

- E2E Scenario B (visual/provenance) — not implemented.
- Whether `pnpm run test:e2e` passes on an actual GitHub Actions runner —
  only verified locally; the CI wiring itself is unverified remotely.
- G (loading/empty/error/success audit across all 13 routes), H
  (accessibility audit) — not performed as a dedicated pass this increment.
- K (documentation sync) — not done.
- Not pushed; no PR opened; remote Quality/Integration not run.

## Notes

- Two commits: `fix(web): never override Content-Type on multipart FormData
  requests` and `test(e2e): add Playwright professor-demo Scenario A
  (no-AI flow)`.
- The discovered-and-fixed multipart bug is a concrete demonstration of why
  instruction.md kept insisting on real browser verification rather than
  accepting unit/integration coverage alone — worth calling out explicitly
  since it directly validates that requirement's purpose.
- Remaining priority order for the next increment: Scenario B, then the
  G/H/K audits, then a final full verification pass, then push/PR/wait for
  remote CI — only after all of that is the FINAL COMPLETION REPORT
  appropriate.
