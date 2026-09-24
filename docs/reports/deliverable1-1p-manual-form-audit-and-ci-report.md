# Increment 1P — Manual Form Contract-Completeness Audit + CI/Config Closure

## Context

`instruction.md`'s "FINAL QUALITY CLOSURE" list (A–P) covers a very large
remaining scope: manual-form audit, expanded test coverage, Playwright E2E,
Phase H audit, frontend/security/accessibility/config hardening, CI wiring,
documentation sync, full verification, and publish. This increment
completes items A (manual form contract-completeness audit), the diagram
part of F (Phase H final evidence audit), E (CI must execute frontend
tests), and J (CORS/config/build-script audit). The FINAL COMPLETION REPORT
is still not used, for the same reason as the last two increments: major
Definition of Done items (C's remaining behaviors, D/Playwright E2E, G/H
audits, K/documentation sync, and O/publish) are not done yet, and claiming
otherwise would violate AGENTS.md's prohibition on unverified claims.

## Implemented

### A — Manual form contract-completeness audit

Compared every manual form directly against its backend Zod contract
(`packages/contracts/src/...`), not against the illustrative field list in
the task text, per the instruction's own authority rule. Found and fixed
real gaps:

- **Use Case**: `alternativeFlows` was hardcoded to `[]`. Added an editor
  (name/condition, steps as "actor: acción" per line).
- **Data Model**: attribute `description` and relationship `name`/
  `description` existed nowhere in the UI (or were force-stripped on
  submit). Added all three.
- **Navigation**: node `description` was missing entirely; `relatedUseCaseCodes`
  existed in component state but had no rendered input. Added both.
- **Software Architecture**: `dependencies` (component-to-component, via a
  select referencing existing components — never free UUID entry) and
  `decisions` were hardcoded to `[]`. Added both.
- **System Architecture**: `links` (communication links between nodes,
  protocol/description) were hardcoded to `[]`. Added.
- **UI Blueprint**: `relatedUseCaseCodes`, `navigationNodeLocalId`,
  `sections`, `secondaryActions`, `principalData`, `forms`, `states` were
  all hardcoded to `[]`/omitted. Added every one.

One field is intentionally still omitted: Software Architecture's optional
per-component `layerLocalId` (layer grouping) — documented in the commit
message as a secondary organizational field not required to represent the
architecture. No field was invented beyond what each contract supports.

### F (partial) — Phase H diagram-correspondence closure

Added the previously-missing evidence that the Navigation, Software
Architecture and System Architecture diagrams each bind to their exact
selected authoritative artifact version — mirroring the already-tested
Data Model/ER and UI Blueprint/Mockup cases. The existing suite was
inspected first; nothing already proven was duplicated.

### E — CI executes frontend tests

`apps/web` gained its own jsdom-based vitest config in Increment 1N and was
excluded from the root Node-only config, but no CI step ever ran it —
frontend tests were a developer-only command. Added an explicit
`pnpm --filter @caseflow-ai/web run test` step to the Quality job.

### J — CORS/config/build-script audit

Verified (no code change needed): `WEB_ORIGIN` defaults to
`http://localhost:3000` in both `.env.example` and `main.ts`'s fallback,
is overridable via environment variable for production, and `enableCors`
never falls back to a wildcard. Documented, inline in
`pnpm-workspace.yaml`, why `allowBuilds.esbuild = true` is scoped
correctly: esbuild's own postinstall only downloads its prebuilt platform
binary (no arbitrary script), needed for `apps/web`'s Vite/Vitest runner,
and no other lifecycle script was enabled.

## Tests

No new test files this increment; the diagram-correspondence test was
added to the existing `export.integration.spec.ts` (now 11 tests, up from
10). Manual-form fixes were verified via the existing
`manual-fallback.spec.tsx` suite (unaffected — it asserts the create()
call shape, which each fix extends rather than changes) plus full
typecheck/build.

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
- `pnpm run verify:integration` — 19 files / 123 tests passed against live
  Postgres.
- `git diff --check` — no whitespace issues.

## Not verified (remaining FINAL CLOSURE scope)

- C: most of the ~22 web-behavior-test items are still implemented but not
  freshly asserted (only the manual-fallback paths and the items already
  covered in earlier increments have direct tests).
- D/E2E: Playwright is not yet added to the repository; neither Scenario A
  (no-AI professor flow) nor Scenario B (visual/traceability) exist. This
  remains the single largest gap against instruction.md's explicit "D.
  PLAYWRIGHT E2E — REQUIRED" and needs dedicated effort (repository setup,
  browser install, local-infra orchestration, two scenarios) rather than a
  partial attempt.
- G: no fresh loading/empty/error/success audit was run against all 13
  primary routes this increment.
- H: no fresh accessibility audit was run this increment.
- I: the static TrustedSvg boundary test (from Increment 1O) still passes,
  but no fresh manual inspection of every runtime call site was performed
  this increment beyond what that test already enforces.
- K: documentation sync (`CASEFLOW_AI_SPEC.md`, `docs/FIRST_DELIVERABLE_MVP.md`,
  `README.md`) not done.
- No interactive/browser smoke verification performed (no browser tool
  available in this session).
- Not pushed; no PR opened; remote Quality/Integration CI not run — and
  since the CI workflow itself changed this increment, that change is
  itself only verified by local reasoning about the YAML, not by an actual
  remote run.

## Notes

- Three commits this increment: `fix(web): complete manual forms against
canonical contracts`, `test(export): complete authoritative diagram
export coverage`, `ci: run frontend test suite in Quality; document
esbuild build-script scope`.
- Given the remaining scope (Playwright E2E is explicitly required and
  substantial; G/H audits; K documentation sync; then full verification and
  publish), the next increment should prioritize Playwright E2E next, since
  instruction.md marks it as the largest still-missing mandatory item, then
  the G/H audits, then K, then the full verification/publish sequence —
  only after all of that is the FINAL COMPLETION REPORT appropriate.
