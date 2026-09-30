# Foundation 0E — Quality Tooling — Completion Report

Date: 2026-09-16
Task: Foundation 0E — Quality Tooling (CASEFlow AI Increment 0)

## 1. Implemented

### Test runner

- **Vitest 5.0.1** installed as the sole test runner (no Jest anywhere).
- Two thin root config files (`vitest.config.mts` for unit tests + coverage, `vitest.integration.config.mts` for integration tests) — kept intentionally small and largely identical, per "prefer a small shared/root configuration."
- Both configs use `unplugin-swc` (`1.6.0`) + `@swc/core` (`1.16.2`) as a Vite plugin — the officially NestJS-documented way to get correct `emitDecoratorMetadata` support under Vitest (esbuild, Vite's default transformer, cannot emit TypeScript decorator metadata; SWC can). Applying it repo-wide is harmless for non-decorator files and avoids per-package config duplication.
- Config files use the `.mts` extension (not `.ts`) to avoid a Vite "ESM syntax loaded as CommonJS" warning, since the root `package.json` intentionally has no `"type": "module"` (Foundation 0B.1 decision, unchanged).

### Root commands — exact semantics

| Command                 | Runs                                                | Meaning                                                                                                                                                                                                                                                                                                      |
| ----------------------- | --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `pnpm test`             | `vitest run`                                        | The normal, deterministic suite for everyday developer use. Currently identical to `test:unit` because every existing "normal" test happens to need no external infrastructure — the moment a future increment needs a different default, `test` and `test:unit` can diverge without changing this contract. |
| `pnpm test:unit`        | `vitest run`                                        | Explicitly: tests requiring **no** external infrastructure. Uses `vitest.config.mts`, whose `include` is `apps/**/*.spec.ts` + `packages/**/*.spec.ts` and whose `exclude` removes `**/*.integration.spec.ts`.                                                                                               |
| `pnpm test:integration` | `vitest run --config vitest.integration.config.mts` | Tests requiring explicitly available infrastructure (currently: PostgreSQL). `include` is exactly `**/*.integration.spec.ts` — a distinct file-naming convention, not a tag, so the separation is enforced by the filesystem, not by a runtime flag anyone could forget.                                     |
| `pnpm test:coverage`    | `vitest run --coverage`                             | Runs the same deterministic **unit** config with coverage instrumentation enabled — coverage never runs the (infrastructure-dependent, therefore non-deterministic-in-CI-without-setup) integration suite.                                                                                                   |

Vitest's own default behavior already satisfies "do not create scripts that silently succeed when there are no tests": verified directly — pointing Vitest at a directory with zero matching spec files prints `No test files found, exiting with code 1` and exits non-zero, with no special configuration needed.

### API health test

`apps/api/src/health/health.controller.spec.ts` — uses `@nestjs/testing`'s `Test.createTestingModule({ imports: [HealthModule] }).compile()`, then `moduleRef.createNestApplication()` + `app.init()` (no `app.listen()` on a real configured port), and Supertest against `app.getHttpServer()`. This is the officially documented minimal Nest + Supertest pattern: Supertest itself opens an ephemeral, request-scoped socket internally (an unavoidable mechanic of how Supertest works over real HTTP), but the application never binds to its actual configured port (3001) or any persistent listener. Asserts `GET /health/live` → HTTP 200, body `{ status: 'ok' }`.

### Worker bootstrap test

`apps/worker/src/app.module.spec.ts` — `Test.createTestingModule({ imports: [AppModule] }).compile()`, then `moduleRef.init()` / `moduleRef.close()`. This exercises the exact same DI graph resolution the worker's real `main.ts` performs, without ever touching HTTP. No `SIGTERM`/signal handling is tested here (per instruction — that remains untestable reliably on Windows and is out of scope for the automated suite).

### Shared packages

**No package-level tests were added.** `packages/domain`, `packages/contracts`, `packages/ui`, `packages/ai`, `packages/integrations`, `packages/config` all still only export `PACKAGE_NAME` constants and (for `contracts`) a pure TypeScript `interface`. None of that is observable runtime behavior worth protecting with a test — asserting `expect(PACKAGE_NAME).toBe(...)` or asserting an interface's shape would be exactly the "meaningless test written to increase coverage" the instructions explicitly forbid. This is a deliberate omission, not an oversight.

### Typecheck vs. build boundary

This was the most technically involved part of the task. Root cause: the six `packages/*` had `"typecheck": "tsc --build --pretty"`, and `apps/api` depends on `@caseflow-ai/contracts` via real Node package resolution — so `apps/api`'s (already-correct, plain `tsc --noEmit`) typecheck could only succeed if `contracts`' `dist/` already existed, which is exactly what `contracts`' own `tsc --build` typecheck was silently producing as a side effect. Fixing only the packages' scripts (switching to plain `tsc --noEmit`) would have **broken** `apps/api`'s typecheck on a clean checkout, since nothing would build `contracts` first.

I confirmed empirically that `tsc --build --noEmit` is not a viable escape hatch here: TypeScript refuses this combination outright when a real project reference to a composite project exists (`error TS6310: Referenced project '...' may not disable emit`) — composite referenced projects exist specifically to be emitted, and `--noEmit` cannot suppress that.

**The fix actually applied:**

1. All six `packages/*` `typecheck` scripts changed from `tsc --build --pretty` → `tsc --noEmit --pretty` (no project-reference graph involved for these — they're leaves — so this alone is a pure, side-effect-free type check of their own source).
2. `apps/api/tsconfig.json` (the typecheck-purpose config, `noEmit: true`) gained a `baseUrl`/`paths` mapping that redirects **type-level** resolution of `@caseflow-ai/contracts` straight to `../../packages/contracts/src/index.ts` — its actual TypeScript source, not its built `.d.ts`. This is a compile-time-only redirect; it does not touch how the code is actually loaded at runtime (Node's own `require`/`import`, used by `ts-node` in dev and by compiled JS in production, still resolves the real package via `node_modules` → `dist/index.js`, completely unaffected).
3. `apps/api/tsconfig.json` also dropped its own `rootDir`/`outDir` (meaningless for a `noEmit: true` config anyway, and their presence was making TypeScript reject `contracts`' out-of-tree source files with `TS6059: File ... is not under rootDir`).
4. `apps/api/tsconfig.build.json` (the **real** build config) now declares its own `rootDir: "src"` / `outDir: "dist"` explicitly (previously inherited from `tsconfig.json`) and overrides `"paths": {}` to clear the source-redirect for actual compilation — the real build must resolve `@caseflow-ai/contracts` the normal way, via its already-built `node_modules` package, which `pnpm build`'s topological ordering guarantees exists before `apps/api` builds (unchanged from Foundation 0C).
5. Added `tests/tsconfig.json` (plain, `noEmit: true`, no composite/build mode) so the new top-level `tests/` directory is covered by `pnpm typecheck` too; root `typecheck` script now runs `tsc --noEmit -p tests/tsconfig.json &&` before the recursive per-package pass.

No project references were removed to make this easier — `apps/api`'s `tsconfig.json` never had a `references` field before this task (I tried adding one experimentally to explore the "correct" TS-native route, hit the `TS6310` wall described above, and reverted it in favor of the `paths`-based source-redirect, which is the technically correct configuration for "check against source, build separately").

**Explicit empirical verification of the required invariant** (see Verified section for the exact commands): starting from a repository with **zero** `dist/` directories anywhere, `pnpm typecheck` completes successfully end-to-end (all 9 packages/apps + the new `tests/` directory) and creates **zero** `dist/` directories. Running it again with `dist/` already populated (from a subsequent `pnpm build`) leaves every file's mtime unchanged (`diff` of a before/after `stat` listing was empty). `pnpm build` remains the only script that produces `dist/` output. Strict TypeScript settings (`strict`, `noUncheckedIndexedAccess`, etc., inherited from `tsconfig.base.json`) were not touched or weakened anywhere.

### Coverage

- Provider: **`@vitest/coverage-v8@5.0.1`** (V8's native coverage, Vitest's officially supported provider).
- Configured in `vitest.config.mts` under `test.coverage`: collects **statements, branches, functions, and lines** (all four, as required), reporters `text` + `lcov` + `html`, output to `./coverage` (already `.gitignore`d from Foundation 0A).
- `include` is scoped to real application/package source only: `apps/api/src/**/*.ts`, `apps/worker/src/**/*.ts`, `packages/*/src/**/*.ts`. `exclude` removes `*.spec.ts`, `*.integration.spec.ts`, `*.d.ts`, `dist/`, `node_modules/`. `apps/web` is intentionally excluded from coverage collection (it has no tests and none are being added per instructions, per the Web Testing section — including it would only ever show 0% noise with no test-writing plan to change that yet).
- **No coverage threshold was enforced.** The current honest global numbers are ~4% statements / 0% branches / ~17% functions / ~5% lines — a direct, accurate consequence of most `packages/*` and app entrypoints having zero tests yet (correctly, per the "do not write meaningless tests" instruction). Enforcing the future `>= 70%` line/`>= 85%` critical-area target now would be either impossible without writing exactly the low-value tests this task forbids, or would require an artificially low/meaningless number that doesn't protect anything. Foundation 0E's job was to **establish measurement** — done, and it works correctly (verified against real test-exercised code: `health.controller.ts`'s `getLiveness` function shows as hit in the `lcov` output). Formal threshold enforcement is deferred to a later domain-bearing increment, as the instructions anticipate.

### Database integration test

`tests/integration/postgres.integration.spec.ts` (new top-level `tests/` directory, not inside any app/package, since this test verifies cross-cutting infrastructure, not any one app's business logic). Connects via `pg.Client` to `DATABASE_TEST_URL` and asserts, as three separate test cases:

1. `SELECT current_database()` → `caseflow_test` (proves it is _not_ talking to `caseflow`).
2. `SELECT 1 AS value` → `1`.
3. `SELECT extname FROM pg_extension WHERE extname = 'vector'` → one row (pgvector present).

No Prisma model, repository, or service was added to perform this — it uses the raw `pg` driver directly.

**New dependency justification (`pg` + `@types/pg`, root devDependencies):** Prisma 7 removed `datasource.url` from `schema.prisma` (Foundation 0D) and now requires an explicit **driver adapter** package (e.g. `@prisma/adapter-pg`) to be passed into the `PrismaClient` constructor for any direct-database use — adding that adapter, for a schema with zero models, purely to run `SELECT 1` in a test would be a heavier, more speculative dependency footprint than the task allows ("do not add speculative repositories or Prisma services simply to perform this test"). `pg` is the plain, standard, low-level PostgreSQL driver for Node — notably, it's the same underlying driver Prisma's own `@prisma/adapter-pg` wraps — and needs zero schema/model/ORM setup to prove connectivity, `SELECT 1`, and extension presence. This is the minimal, technically clean option available.

### Test database provisioning (`caseflow_test`)

- `infra/docker/postgres/prepare-test-db.sh` — a small, idempotent shell script bind-mounted read-only into the `postgres` container at `/opt/caseflow-scripts` (a new, minimal addition to `infra/docker/compose.yml`'s existing `postgres` service — not the real `docker-entrypoint-initdb.d`, specifically to avoid any surprise auto-run behavior, and because that directory only runs once against a brand-new empty volume, which would not be reproducible against our already-provisioned `postgres_data` volume from Foundation 0D).
- The script: (1) using the Postgres `... WHERE NOT EXISTS (...) \gexec` idiom (piped through `psql` via stdin, since `\gexec` is a `psql` meta-command that only works when read by `psql` itself, not when passed via `-c`) to `CREATE DATABASE caseflow_test` only if it doesn't already exist; (2) runs `CREATE EXTENSION IF NOT EXISTS vector;` inside `caseflow_test`. Both steps are fully idempotent — verified by running the script twice in a row (second run: `NOTICE: extension "vector" already exists, skipping`, no `CREATE DATABASE` attempted, exit 0 both times).
- Exposed as `pnpm db:test:prepare` (`docker compose ... exec -T postgres sh /opt/caseflow-scripts/prepare-test-db.sh`) — a real, reproducible, re-runnable command; nothing about `caseflow_test` relies on a developer having manually created it once.
- No domain migrations/tables were introduced for the test database — only the extension.
- `.env.example` gained `DATABASE_TEST_URL`, alongside the existing `DATABASE_URL`, clearly commented as test-only.

### Redis / storage / mail

Untouched, per instructions — no application clients, no new test libraries for these. Foundation 0D's operational verification stands; their application-level tests belong to later increments that introduce real adapters.

### Web testing

No Playwright, no browser E2E, no component test added — the static Foundation page has no meaningful behavior yet to protect, exactly as instructed.

### CI

One line added to `.github/workflows/ci.yml`: `- run: pnpm test` after the existing `pnpm build` step. That's the entire CI change — no redesign. `pnpm test` here is infrastructure-independent (`test` = `test:unit` currently), so it's safe to run in CI without any service containers.

**Deferred to Foundation 0F** (explicitly, per instructions): a CI job with a real PostgreSQL service container to run `pnpm test:integration`, and — as a consequence — CI coverage of the `caseflow_test` provisioning flow itself. `pnpm test:coverage` was also not added to CI in this task (not requested; only "the normal unit/test command").

## 2. Verified

All commands below were actually executed in the repository:

- `pnpm install` → succeeded. Required approving one new install script (`@swc/core`, a native binary) via `pnpm-workspace.yaml`'s `allowBuilds` — the same supported approval mechanism used in Foundation 0D for Prisma, not a bypass. `pnpm` also auto-added a `minimumReleaseAgeExclude` entry for `vitest@5.0.1`/`@vitest/coverage-v8@5.0.1`/`@vitest/mocker@5.0.1`/`@vitest/spy@5.0.1` (very recently published) — pnpm's own supply-chain policy behaving as designed, the same pattern seen with NestJS 12 in Foundation 0B and Prisma-adjacent packages since.
- `pnpm format:check` → passed.
- `pnpm lint` → passed.
- `pnpm typecheck` → passed, run from a repository state with **zero** `dist/` directories anywhere (`find . -maxdepth 3 -iname dist` returned nothing before the run) — and confirmed to still produce **zero** `dist/` directories afterward (same `find` command, still empty). Re-ran typecheck a second time with `dist/` now populated by a subsequent `pnpm build`; a `stat`-based mtime diff of every file under `packages/contracts/dist` and `apps/api/dist` before vs. after was empty — proving the second typecheck run modified nothing.
- `pnpm build` → passed, both from the clean state and again afterward; produced real `dist/` output for all 8 buildable packages/apps plus `apps/web`'s Next.js static build.
- `pnpm test` → 2 test files, 2 tests, all passed.
- `pnpm test:unit` → identical result (2/2), confirming it excludes the integration spec (which would make it 3).
- `pnpm test:coverage` → completed successfully; coverage report generated (`text` summary printed, `coverage/lcov.info` and `coverage/index.html` written to disk); `lcov.info` directly inspected and confirms `health.controller.ts`'s `getLiveness` function is recorded as hit (`FNH:1`), proving instrumentation is genuinely tracking exercised code, not just producing an empty report.
- `pnpm infra:up` → all four long-running services (`postgres`, `redis`, `seaweedfs`, `mailpit`) healthy; `storage-init` completed. (The `postgres` service was recreated once, to pick up the new read-only script bind mount — its existing data, including the `vector` extension and `_prisma_migrations` history from Foundation 0D, was confirmed intact immediately afterward.)
- Test database preparation: `pnpm db:test:prepare` run twice — first run created `caseflow_test` and installed `vector` in it; second run was a confirmed no-op (idempotent). Independently verified via `psql`: `caseflow_test` exists as a separate database from `caseflow` (`\l` lists both), `SELECT current_database()` inside it returns `caseflow_test`, and `pg_extension` shows `vector 0.8.6` there.
- `pnpm test:integration` → 1 test file, 3 tests, all passed, run against the real Dockerized `caseflow_test` database.
- **Explicit verification items from section 14, all performed directly:**
  1. API health test passes — confirmed above.
  2. Worker initialization test passes — confirmed above.
  3. The PostgreSQL integration test uses `caseflow_test`, not `caseflow` — asserted **inside the test itself** (`current_database()` check), not just assumed from the connection string; it passed.
  4. `SELECT 1` passes — asserted and passing.
  5. The `vector` extension is available in the test DB — asserted and passing.
  6. The normal development database was not modified by integration tests — verified directly with `psql -d caseflow -c "\dt"` immediately after running the full `test:unit` + `test:integration` suite: only the pre-existing `_prisma_migrations` table from Foundation 0D is present, nothing new.
  7. `pnpm typecheck` does not create/modify `dist/` outputs — verified twice, as described above (from a clean state, and again with `dist/` already populated).
  8. The coverage report is generated successfully — verified (text summary + `lcov.info` + `html` all produced and inspected).
- API/worker runtime sanity re-check after all changes: rebuilt `apps/api`, ran `node dist/main.js`, confirmed `GET /health/live` still returns HTTP 200 `{"status":"ok"}` — the new test infrastructure and tsconfig changes did not regress the actual running application.
- Confirmed Vitest's built-in "no scripts silently succeed with zero tests" behavior directly: pointing a Vitest run at an empty directory printed `No test files found, exiting with code 1` and returned a non-zero exit code, with no special configuration required.

## 3. Not verified

- No CI run was actually triggered/observed on GitHub Actions infrastructure (this is a local session); the added `pnpm test` CI step was validated by running the exact same command locally, but the workflow file itself was not executed by a real Actions runner.
- Long-running stability of the Vitest watch mode, or any interactive `vitest` usage beyond `vitest run`, was not exercised (out of scope — only the `run` invocations used by the four root scripts were tested).
- Windows-native `SIGTERM` delivery to the worker process was, as in every prior Foundation increment, not exercised — and, per this task's own instruction, was deliberately **not** attempted in the automated suite either.

## 4. Relevant notes — explicit answers

- **Exact Vitest version**: `5.0.1` (`vitest` and `@vitest/coverage-v8`, matched versions).
- **Coverage provider/version**: `@vitest/coverage-v8@5.0.1` (V8 native coverage).
- **Supertest/Nest testing versions**: `supertest@7.2.2` + `@types/supertest@7.2.1` (in `apps/api` only); `@nestjs/testing@11.2.3` (in both `apps/api` and `apps/worker`, matching the pinned `@nestjs/core`/`@nestjs/common` version from Foundation 0B.1 exactly).
- **All new dependencies and justification**:
  - `vitest`, `@vitest/coverage-v8` (root) — the chosen test runner and its coverage provider, as directed.
  - `unplugin-swc`, `@swc/core` (root) — required for `emitDecoratorMetadata` support under Vitest for the two NestJS apps; this is NestJS's own officially documented Vitest integration path, not a speculative addition.
  - `@nestjs/testing` (apps/api, apps/worker) — the standard Nest testing-module utility, explicitly preferred by the instructions.
  - `supertest`, `@types/supertest` (apps/api only) — the standard, explicitly-preferred minimal HTTP-assertion library for the health-endpoint test.
  - `pg`, `@types/pg` (root) — justified above (Prisma 7's new driver-adapter requirement made `@prisma/client` a heavier, more speculative choice for a single raw `SELECT 1`-style check; `pg` is the minimal, standard PostgreSQL client and the same driver Prisma's own Postgres adapter wraps).
  - `amazon/aws-cli`-style Docker-only tooling was **not** touched in this task.
- **How `caseflow_test` is provisioned**: `infra/docker/postgres/prepare-test-db.sh`, bind-mounted into the `postgres` container, run on demand via `pnpm db:test:prepare`; idempotent (safe to run any number of times, including on every CI run once Foundation 0F wires it in).
- **How pgvector is enabled in the test DB**: the same script runs `CREATE EXTENSION IF NOT EXISTS vector;` against `caseflow_test` specifically (not `caseflow`) as its second step.
- **Proof tests do not use the development database**: the integration test asserts `current_database() = 'caseflow_test'` as one of its three test cases (not merely inferred from configuration), and a direct `psql -d caseflow -c "\dt"` check after the full suite ran shows the development database unchanged (still only the pre-existing `_prisma_migrations` table).
- **How typecheck was changed to avoid emit**: see the detailed "Typecheck vs. build boundary" section above — plain `tsc --noEmit` for all six leaf packages, plus a `paths`-based compile-time-only source redirect for `apps/api`'s one cross-package dependency (`@caseflow-ai/contracts`), verified empirically (via the `TS6310` error) that TypeScript's `--build --noEmit` cannot be used here since it refuses to disable emit for a referenced composite project.
- **Whether coverage thresholds were enforced, and why**: no. Current honest coverage is single-digit percent globally, a correct reflection of how little of the codebase has meaningful tests yet (by design — see Foundation 0E's own "do not write low-value tests" instruction). Enforcing the future `>=70%`/`>=85%` targets now was explicitly out of scope; reporting was established and verified to work correctly instead.
- **CI changes made**: one line, `- run: pnpm test`, appended after the existing `pnpm build` step in `.github/workflows/ci.yml`. Nothing else in CI was touched. A PostgreSQL-service-container job for `pnpm test:integration` remains for Foundation 0F, as does any CI use of `pnpm test:coverage`.
- **Any Windows-specific limitation**: none new. The `psql`/`\gexec` idempotent-create pattern had to be piped via `stdin` rather than passed through `-c` (a `psql`/Postgres behavior, not Windows-specific — `\gexec` is only interpreted by `psql`'s own reader, not by the server when sent via `-c`). No other Windows-specific friction was encountered in this task beyond the already-documented, unrelated Windows `SIGTERM` limitation carried over from earlier Foundations.
- **Local infrastructure final state**: left **running** (`postgres`, `redis`, `seaweedfs`, `mailpit` all healthy; `storage-init` completed) — a normal, sensible developer state to continue work in, matching how Foundation 0D also left it. It was not stopped.

Per the task instructions, **Foundation 0F was not started**.
