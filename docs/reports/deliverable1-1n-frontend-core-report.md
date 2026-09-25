# Increment 1N — Phase I Frontend Core (CASEFlow Web Application)

## Context

`instruction.md` requested continuing autonomously through the full remaining
scope of the First Deliverable (Phase I frontend, tests, E2E, final
hardening, documentation sync, full verification, push, PR, remote CI, and a
single final completion report). Given the size of that remaining scope,
this increment covers the frontend core — the largest and highest-risk
remaining piece — end to end, fully verified, rather than a partial pass
across every remaining item. The FINAL COMPLETION REPORT format from
requirements.md §58 is intentionally **not** used here, because the complete
Definition of Done (E2E, final hardening audit, documentation sync, push/PR,
remote CI) is not yet satisfied — claiming it would violate AGENTS.md's "never
claim verification that was not actually performed."

## Implemented

### Backend additions (needed for the frontend to function without a hardcoded UUID)

- `WorkspacesModule` (`GET /workspaces`, read-only): Identity/Workspace
  management remains deferred (DEC-115), but the current no-auth MVP has
  exactly one implicit dev workspace and no existing way to discover its id.
  This is the minimal read needed so the frontend never hardcodes a UUID.
- CORS enabled in `apps/api/src/main.ts`, restricted to `WEB_ORIGIN` (default
  `http://localhost:3000`), never a wildcard.

### Frontend (`apps/web`, turned from the default Next.js scaffold into a real app)

- **API client layer** (`lib/api.ts`): single fetch helper, normalized
  `ApiError`, one typed method per backend endpoint consumed. No scattered
  raw `fetch` calls, no hardcoded base URL outside this file, no backend
  business rules reimplemented here.
- **Status system** (`components/status-badge.tsx`): `StatusBadge` (icon +
  text for DRAFT/GENERATED/IN_REVIEW/APPROVED/CHANGES_REQUESTED, never color
  alone) and `CandidateBadge` (visually distinct from an official Artifact
  Version status).
- **Trusted diagram boundary** (`components/trusted-svg.tsx`): the one
  component allowed to render raw SVG via `dangerouslySetInnerHTML`,
  documented in-code to only ever receive backend-sanitized diagram/mockup
  SVG, never arbitrary/uploaded SVG.
- **App shell** (`components/app-shell.tsx`, `project-switcher.tsx`):
  navigation grouped by lifecycle (Knowledge/Analysis/Design/Traceability/
  Readiness-Export per instruction.md's information architecture), a
  project selector backed by real `/workspaces` + `/projects` data with
  create-project and zero-project handling, active-project persisted
  client-side only (`lib/active-project.tsx`, localStorage — never sent back
  to the server, never a substitute for backend authorization).
- **Shared loading/empty/error handling** (`components/query-state.tsx`):
  `QueryState` translates `ApiError` into short Spanish messages, never a
  raw stack trace; `RequireActiveProject` renders the zero-project empty
  state consistently across every page.
- **Pages**, all consuming real backend data:
  - Home (`app/page.tsx`) — consumes Readiness/Staleness directly, stage
    progress grid, next-action prompt, staleness/impact warning with the
    careful wording required by spec ("Newer approved knowledge available",
    never "Invalid"/"Broken").
  - Sources (`app/sources/page.tsx`) — create form with semantic fields
    (kind/title/purpose/business area/description/file), manual-transcript
    fallback for non-locally-extractable kinds, AI report generation with a
    manual-report fallback, lifecycle transitions.
  - Project Context (`app/context/page.tsx`) — structured form, Source
    selection via checkboxes showing code/title/version/status (never a
    UUID input field), lifecycle transitions, versioning.
  - Requirements / Use Cases (`app/requirements`, `app/use-cases`) —
    generate → `CandidateReview` (shared component, explicit "Candidate
    != Artifact Version, Accept != Approve" messaging) → accept → lifecycle;
    Use Cases also shows the academic minimum progress and can generate the
    Use Case Diagram.
  - Data Model (`app/data-model/page.tsx`) — generate/accept/lifecycle,
    entity summary with on-demand attribute expansion, ER diagram on demand.
  - Navigation / Software Architecture / System Architecture / UI Blueprint
    — one shared `StructuredKindPage` component (`components/
structured-kind-page.tsx`) parameterized by kind, since all four share
    an identical backend shape; avoids four near-duplicate pages.
  - Mockups (`app/design/mockups/page.tsx`) — generate from an approved UI
    Blueprint, preview via the trusted SVG boundary, explicit "generated
    preview, not a real screenshot" messaging.
  - Traceability (`app/traceability/page.tsx`) — a lineage explorer
    (select artifact → upstream/current/downstream, from the backend graph
    only, never inferred client-side), generation/generator provenance
    display, explicit truncation notice when `truncated=true`.
  - Readiness + Export (`app/readiness/page.tsx`) — the 13-stage checklist
    consumed directly from the backend (never recomputed), JSON/HTML export
    download buttons using the backend Phase H endpoint.

### Frontend testing infrastructure

- `apps/web/vitest.config.mts` (jsdom + `@vitejs/plugin-react` +
  `@testing-library/react`), run separately via
  `pnpm --filter @caseflow-ai/web test`; excluded from the root Node-only
  vitest config (`vitest.config.mts` now excludes `apps/web/**`).
- Fixed a real type-incompatibility between `@testing-library/jest-dom`
  6.6.3's own `vitest` ambient augmentation (single type parameter) and
  vitest 5's actual two-parameter `Assertion<R, T>` interface — declaration
  merging silently failed with the upstream types, so
  `apps/web/types/jest-dom.d.ts` re-declares the augmentation with the
  correct arity.
- 6 test files / 11 tests covering: zero-project empty state, status
  text-not-color-only + candidate/artifact distinction, trusted SVG
  rendering, Home consuming backend readiness, staleness warning wording,
  traceability truncation notice, and the Readiness page's stage checklist
  - JSON/HTML export actions.

## Known gaps (explicitly not silently dropped)

- Manual (non-AI) creation forms for Use Cases, Data Model, and the four
  StructuredAnalysis kinds are not implemented — these flows currently
  require `AI_PROVIDER` to be configured (not `disabled`) to create new
  artifacts. Sources and Project Context do have full manual fallback
  forms. This is a real gap against AGENTS.md §4.6 (manual fallback) for
  those specific artifact types and should be closed in a follow-up
  increment.
- Only 11 of the ~21 frontend behaviors instruction.md listed are covered by
  automated tests; the rest (Sources semantic fields, manual extraction
  fallback, Context source selection, quality-warning display, lifecycle
  controls, Use Case academic progress, Mockup preview, locked-stage
  explanation) are implemented and manually reviewable in the pages above
  but not yet asserted by a test.
- Playwright / professor-demo E2E not yet added.
- No accessibility audit pass beyond the basics already present (semantic
  buttons/labels, a skip-to-content link, `aria-current` on active nav).
- Final documentation sync (`CASEFLOW_AI_SPEC.md`,
  `docs/FIRST_DELIVERABLE_MVP.md`, `README.md`) not yet done.
- Not pushed; no PR opened; remote CI not run.

## Tests

- Backend: unchanged existing suites plus `workspaces.service.spec.ts` (1
  test).
- Frontend: 6 files / 11 tests (see above).

## Verified

- `pnpm run typecheck` (whole workspace, including `apps/web`) — clean.
- `pnpm run lint` (whole workspace) — clean.
- `pnpm run format` / `format:check` — clean.
- `pnpm run build` (whole workspace, including `apps/web` production build,
  all 13 app routes compile) — clean.
- `pnpm run test` (backend, root vitest config) — 51 files / 283 tests
  passed.
- `pnpm --filter @caseflow-ai/web run test` (frontend, jsdom) — 6 files / 11
  tests passed.
- `pnpm run test:coverage` — global 80.35% stmts / 72.1% branches / 78.78%
  funcs / 81.12% lines (threshold ≥70% on all four, met; frontend code is
  outside this coverage scope by design, same as before this increment).
- `pnpm run db:validate` — schema valid.
- `pnpm run openapi:generate` — regenerated successfully with the new
  `GET /workspaces` route.
- `pnpm run verify:integration` (db:test:prepare + migrate + integration
  suite) — 19 files / 117 tests passed against live Postgres, unaffected by
  this increment's changes.
- `git diff --check` — no whitespace issues.

## Not verified

- Playwright/professor-demo E2E — not implemented this increment.
- Remote CI (Quality/Integration workflows) — not triggered; branch not
  pushed.
- Manual/interactive verification of the running frontend against a live
  backend in a browser was not performed in this session (no browser tool
  available); correctness was verified via `next build`'s production
  compile, full-workspace typecheck, and the automated test suite above.

## Notes

- Two commits this increment: `feat(web): implement CASEFlow
first-deliverable workflow` (backend workspaces/CORS + full frontend) and
  `docs(reports): reflow markdown emphasis per prettier` (an incidental
  prettier reformat of the previous report, produced by running `pnpm
format`).
- `pnpm-workspace.yaml`'s `allowBuilds.esbuild` was set to `true` (esbuild's
  own postinstall script, which downloads its platform binary — required
  for Vite/Vitest to run at all); no other build-script policy changed.
- Remaining scope per instruction.md, in priority order: close the manual
  fallback gaps noted above, expand frontend test coverage toward the full
  21-behavior list, add the professor-demo Playwright E2E, run the final
  hardening audit, synchronize documentation, run full verification
  end-to-end again, then push/PR to `develop` and wait for remote CI before
  any final completion report.
