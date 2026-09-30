# CASEFlow AI — CI Test Database Fix Report

Date: 2026-09-21

## Change

- Changed `.github/workflows/ci.yml` only for the implementation.
- `DATABASE_URL`: `postgresql://caseflow_ci:caseflow_ci_password@localhost:5432/caseflow_ci?schema=public`
- `DATABASE_TEST_URL`: `postgresql://caseflow_ci:caseflow_ci_password@localhost:5432/caseflow_test?schema=public`
- The integration test and its `current_database()` safety assertion were not changed.

## Local verification

Passed:

- `pnpm format:check`
- `pnpm lint`
- `pnpm typecheck`
- `pnpm test` — 2 tests passed
- `pnpm test:coverage` — 2 tests passed

Corepack provided the repository-pinned pnpm 11.27.0 because `pnpm` was not directly available in `PATH`.

## Git and CI

- Commit: `9efca8e3a592c04d4736f1d277ab36857abc0f6e`
- Message: `fix(ci): align integration test database name`
- Push: successful, `develop` advanced from `1db05dd` to `9efca8e` on `origin`.
- Pull request: remote PR #1 now points to the fix commit.
- GitHub Actions: triggered by the PR update because `.github/workflows/ci.yml` listens to `pull_request` events.
- The PR was not merged and no `v0.1.0` tag was created.

## Scope preservation

Increment 1 was not started. Pre-existing local changes in `apps/web/next.config.ts` and `docs/reports/foundation-release-0.1.0-report.md` were not included in the fix commit.
