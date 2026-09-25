# Increment 1R — Requirement Dependency Audit + Playwright Scenario B

## Context

Continuing `instruction.md`'s "FINAL CLOSURE" list (items 1–15). This
increment closes items 1 (audit the new manual Requirement form against its
canonical contract), 3 (Playwright Scenario B, run for real), 4 (CI
reproducibility: `pnpm exec` instead of `npx` for the pinned Playwright
version), and 5 (CI now runs both E2E scenarios via the existing
`test:e2e` step). It also performed the audit requested in item 10 (Final
Export Evidence Audit) without adding redundant tests. The FINAL COMPLETION
REPORT is still not used: items 2, 6–9, 11, most of 12 (only local
verification, not the full official-migration-from-zero framing), 13
(informal only), and 14 (publish) remain undone.

## Implemented

### Item 1 — Requirement manual-form contract audit

`RequirementManualForm` (added in Increment 1Q) was checked against
`requirementInputSchema` directly, the same audit already applied to every
other manual form. Found that `dependencyArtifactIds` — a real, supported
field — was hardcoded to `[]`. Added a checkbox list of the project's
existing Requirements, labeled `{code} — {name}` (e.g.
"RF-001 — Autenticar usuario"), never a typed ArtifactVersion UUID. The
backend's `validateDependencies` check (inspected directly) validates this
array against the Requirement **Artifact's** own stable id — not a version
id — scoped to the project and requirement type, and does not filter by
lifecycle status, so every existing Requirement is offered regardless of
approval state; the frontend mirrors this exactly rather than guessing. No
field was invented beyond what the contract supports; the backend's only
other dependency rule (self-dependency) needs no frontend mirror since a
Requirement cannot depend on itself before it exists. No cycle detection
exists in the backend for manual create, so none was added client-side.

### Item 3 — Playwright Scenario B (visual/provenance), run for real

Added `e2e/scenario-b-visual-provenance.spec.ts`. Setup (project, an
approved Source, an approved Context linked to it, an approved Data Model)
is prepared via direct API calls — sanctioned by the spec for this bounded
scenario, since its purpose is browser integration, not re-proving the
backend domain chain. Every assertion after setup happens through the real
browser:

- **A. Real visual output** — opens the Data Model page, requests the ER
  diagram, and asserts an actual `<svg>` renders inside `TrustedDiagram`
  with the entity name present _inside the SVG markup itself_. With
  `DIAGRAM_RENDERER=kroki` pointed at the repository's own local Kroki
  (never a public renderer), this proves the full
  `DiagramEngine → Kroki → sanitizeDiagramSvg → API → TrustedSvg → Chromium`
  pipeline actually ran, not a hardcoded fixture.
- **B. Traceability** — opens Traceability, selects the known Context
  ArtifactVersion, and asserts its real upstream Source (`SRC-001`)
  appears, scoped to the "Aguas arriba" section specifically to avoid
  matching the same code elsewhere on the page.
- **C. Readiness** — opens Readiness and asserts real backend stage state
  renders ("Fuentes del proyecto", "NO LISTO TODAVÍA").
- **D. Export** — triggers both the JSON and HTML export buttons and
  asserts each browser download's suggested filename exactly matches the
  backend's deterministic `first-deliverable-{projectId}.{format}` pattern
  (proving `Content-Disposition` reached the browser correctly), without
  rebuilding export content client-side.
- **E. TrustedSvg** — no new assertion needed here; the existing static
  boundary test (`trusted-svg-boundary.spec.ts`, unchanged) already proves
  `dangerouslySetInnerHTML` exists nowhere else in the frontend.

**Both scenarios were run together via the canonical `pnpm run test:e2e`
command and passed.**

### A real flakiness bug found and fixed while stabilizing Scenario A

Home's stage-grid locators (`Fuentes del proyecto`, `Contexto del
proyecto`) matched ambiguously during the brief instant a stage's
"next action" prompt link (`Ir a X`) and its unsatisfied stage cell
(`· X`) both contained the same substring as the satisfied cell (`✓ X`).
Playwright's strict-mode check does not always retry through a transient
multi-match state, causing an intermittent failure with correct
application behavior. Fixed by anchoring each locator's regex to a leading
`✓`, so it either resolves to exactly one element (satisfied) or none
(not yet) — never ambiguous. Verified stable with `--repeat-each=3`
locally (3/3 passed) in addition to the normal full-suite run.

### Item 4 — Playwright CI reproducibility

CI's browser install step now uses `pnpm exec playwright install
--with-deps chromium` instead of `npx playwright install ...`, so it
resolves the exact lockfile-pinned `@playwright/test` version
`pnpm/action-setup` already put on `PATH`, per the instruction's
reproducibility guidance. `test:e2e` remains the one canonical command
covering both scenarios (Playwright auto-discovers every `*.spec.ts`
under `e2e/`), so no separate CI step was needed for item 5 — it already
runs both.

### Item 10 — Final Export Evidence Audit (no redundant tests added)

Inspected the full existing `export.integration.spec.ts` suite (11 tests)
against the checklist before touching anything:

| Required evidence                                                                         | Status                                                                                     |
| ----------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| Incomplete/empty export                                                                   | ✅ existing                                                                                |
| Readiness / staleness / traceability included                                             | ✅ existing                                                                                |
| Data Model ↔ ER correspondence                                                            | ✅ existing                                                                                |
| Navigation / Software Architecture / System Architecture ↔ Diagram                        | ✅ existing                                                                                |
| UI Blueprint ↔ Mockup correspondence                                                      | ✅ existing                                                                                |
| Multiple APPROVED same-type authoritative selection                                       | ✅ existing (Data Model case; the underlying policy also has its own dedicated unit tests) |
| JSON/HTML Content-Type, safe Content-Disposition                                          | ✅ existing                                                                                |
| No binary source body / no `storageKey`                                                   | ✅ existing                                                                                |
| HTML XSS escaping                                                                         | ✅ existing                                                                                |
| **Fully populated First Deliverable export (every artifact type present in one project)** | ❌ genuinely missing                                                                       |

No test currently exercises a single project carrying every artifact type
simultaneously (Source, Context, Requirement, Use Case, Data Model,
Navigation, Software/System Architecture, UI Blueprint, Mockup all
APPROVED together). Each type's presence and its exact-version
correspondence _is_ proven independently across the existing tests, so
building one further mega-test would mostly duplicate already-proven
per-type behavior at real cost (fragility, runtime) — per the instruction's
own "only add missing assertions" and "do not duplicate already-proven
conditions" guidance, this is recorded as an accepted, documented gap
rather than closed by a rushed comprehensive test this increment.

## Tests

- Frontend: `manual-fallback.spec.tsx` now 9 tests (up from 8) — the new
  Requirement-dependency test. Frontend suite: 8 files / 22 tests.
- E2E: 2 Playwright tests (Scenario A + Scenario B), run together via
  `pnpm run test:e2e` — both passed. Scenario A additionally verified
  stable with `--repeat-each=3` (3/3).
- Backend: unchanged existing suites (export suite already covered above).

## Verified

- `pnpm run typecheck` (whole workspace, including `e2e/tsconfig.json`) —
  clean.
- `pnpm run lint` — clean.
- `pnpm run format` / `format:check` — clean.
- `pnpm run build` (whole workspace) — clean.
- `pnpm run test` (backend) — 51 files / 283 tests passed.
- `pnpm --filter @caseflow-ai/web run test` — 8 files / 22 tests passed.
- `pnpm run test:coverage` — global 80.35% stmts / 72.1% branches / 78.78%
  funcs / 81.12% lines (threshold ≥70% on all four, met).
- `pnpm run db:validate` — schema valid.
- `pnpm run openapi:generate` — regenerated successfully.
- `pnpm run verify:integration` — 19 files / 123 tests passed against live
  Postgres.
- `pnpm run test:e2e` — **2/2 Playwright tests passed**, run against this
  environment's real Postgres/SeaweedFS/Kroki containers, both as a
  standalone run and as part of the full command sequence above.
- `git diff --check` — no whitespace issues.

## Not verified

- Item 2 (remaining high-value web behavior tests beyond what already
  exists) — not audited/expanded this increment.
- Items 6–9 (loading/empty/error/success audit, stage-lock UX audit,
  accessibility audit, TrustedSvg runtime caller audit) — not performed as
  dedicated passes this increment.
- Item 11 (documentation sync) — not done.
- The "fully populated export" test gap noted above.
- Whether CI's `pnpm exec playwright install` step and the E2E job pass on
  an actual GitHub Actions runner — only verified locally.
- Not pushed; no PR opened; remote Quality/Integration not run.

## Notes

- Two commits: `fix(web): expose Requirement dependencies in the manual
creation form` and `test(e2e): add Playwright Scenario B
(visual/provenance) and CI reproducibility fix`.
- Remaining priority order: items 6–9 (the audits), then 2 (remaining test
  gaps), then 10's one documented gap if it turns out to matter, then 11
  (docs sync), then a full from-zero verification pass, then push/PR/wait
  for remote CI — only after all of that is the FINAL COMPLETION REPORT
  appropriate.
