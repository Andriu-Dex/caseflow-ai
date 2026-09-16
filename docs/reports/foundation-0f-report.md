# Foundation 0F — CI + Developer Experience + Gate 0 — Completion Report

Date: 2026-09-16
Task: Foundation 0F — CI + Developer Experience + Gate Preparation (CASEFlow AI Increment 0)

## 1. Implemented

### Portable test database preparation

Foundation 0E's `pnpm db:test:prepare` ran a shell script via `docker compose exec` against the `postgres` container (Linux-container-only, and coupled to Docker Compose being the way PostgreSQL is reached). Replaced with **`scripts/prepare-test-database.mjs`** — a plain Node ESM script using the already-installed `pg` driver directly over the network, with zero new dependencies:

1. Validates `DATABASE_URL` and `DATABASE_TEST_URL` are both set (clear, specific error naming the missing variable otherwise).
2. Parses the database name out of each URL and **refuses to continue if they resolve to the same database** (a hard safety check, not just documentation — this is what makes it structurally impossible for this script to ever touch the normal `caseflow` database).
3. Connects via `DATABASE_URL`, confirms the connection is live (`SELECT current_database()`), checks whether the target test database exists (`pg_database` lookup), and creates it **only if missing** (`CREATE DATABASE`, using a properly quoted identifier — this statement cannot be parameterized or run inside a transaction, which is why the name is validated and quoted rather than parameterized).
4. Connects via `DATABASE_TEST_URL`, and **verifies `current_database()` actually equals the expected test database name** before doing anything further — if `DATABASE_TEST_URL` is misconfigured to point somewhere else, this throws a clear, specific error instead of silently operating on the wrong database.
5. Runs `CREATE EXTENSION IF NOT EXISTS vector` against the test database only.
6. Closes both connections cleanly in `finally` blocks either way.

No `prisma db push` is used anywhere. No application tables are created or touched. The script is portable by construction — it only needs Node and a reachable PostgreSQL instance, so it runs identically on Windows, Linux, and GitHub Actions.

`pnpm db:test:prepare` now runs `node scripts/prepare-test-database.mjs`. The obsolete `infra/docker/postgres/prepare-test-db.sh` and its read-only bind mount in `infra/docker/compose.yml`'s `postgres` service were both removed — there is now exactly one implementation of this logic, not two.

**Verified behavior** (see section 4 for the full command log): ran the script against a database where `caseflow_test` didn't exist (confirmed real creation), ran it again immediately after (confirmed pure no-op/idempotent), and separately confirmed each error path fires correctly: missing `DATABASE_TEST_URL` → clear error; `DATABASE_TEST_URL` pointed at the same database as `DATABASE_URL` → clear error, before any connection to the "test" target is even attempted.

### CI structure

`.github/workflows/ci.yml` now has two jobs (see full design in section 2).

### Root verification commands

- **`pnpm verify`** = `pnpm run format:check && pnpm run lint && pnpm run typecheck && pnpm run build && pnpm run test && pnpm run test:coverage` — every step reuses an existing script (no duplicated tooling logic). Infrastructure-independent by construction: none of `format:check`/`lint`/`typecheck`/`build`/`test`/`test:coverage` touch Docker or any database.
- **`pnpm verify:integration`** = `pnpm run db:test:prepare && pnpm run test:integration` — assumes PostgreSQL is already reachable; does **not** call `infra:up` itself, so it never silently starts infrastructure.

### README.md

Created from scratch (none existed before). Covers: product description, current status (Increment 0/Foundation only, no product functionality claimed), technology summary, prerequisites, repository structure, POSIX + Windows PowerShell onboarding flows, all Foundation URLs, a table for each of the quality/infrastructure/database command groups, the discovered native-PostgreSQL-on-port-5432 troubleshooting note (with the exact `Get-NetTCPConnection`/`Get-Service` diagnostics, and an explicit statement that CASEFlow AI will **not** automatically stop system services), the Docker-Desktop-must-be-running note, and pointers to `docs/CASEFLOW_AI_SPEC.md` / `AGENTS.md` with an explicit statement of which one is authoritative. Does not duplicate the spec's content.

### `.env.example` review

Reviewed line by line against section 7's requirement ("every variable currently used, or required by established infrastructure/tooling — no future/speculative variables"). Result: **no changes needed** beyond fixing one stale comment (it referenced the now-removed `infra/docker/postgres/prepare-test-db.sh`; updated to point at `scripts/prepare-test-database.mjs`). Every variable in the file is either read directly by application code (`API_PORT`, `NEXT_PUBLIC_API_URL`), consumed by Prisma tooling (`DATABASE_URL`, `DATABASE_TEST_URL`), or mirrors the already-established Docker Compose service configuration (`REDIS_URL`, `S3_*`, `SMTP_*`/`MAILPIT_UI_URL`) — no AI/auth/future-application variables were present or added.

### `.gitignore` review

Reviewed against section 8's checklist: `.env` ✓, `node_modules/` ✓, `dist/` ✓, `.next/` ✓, `coverage/` ✓, plus `*.tsbuildinfo`, `.pnpm-store/`, `prisma/generated/`, logs/temp files — all already present and correct from Foundation 0A onward. Confirmed directly with `git check-ignore`: `.env.example`, `prisma/migrations/**`, `docs/CASEFLOW_AI_SPEC.md`, and `AGENTS.md` are **not** ignored (the first via an explicit negation rule; the other three simply never matched any pattern). No changes were needed. `AGENTS.md` and `docs/CASEFLOW_AI_SPEC.md` were **not** rewritten — no factual Foundation correction was required in either.

### Health endpoint scope

Confirmed unchanged: `apps/api/src/health/health.controller.ts` still only exposes `GET /health/live`. No `/health/ready` was added.

### No app Dockerization

Confirmed: no `Dockerfile` exists anywhere in the repository (`find . -iname "Dockerfile*"` returns nothing). Applications remain normal local Node processes; only local infrastructure is Dockerized.

## 2. CI design

Two logical jobs, both in `.github/workflows/ci.yml`:

**`quality`** (infrastructure-independent):
checkout → `pnpm/action-setup@v4` (pinned `11.27.0`) → `actions/setup-node@v4` (Node version from `.nvmrc`, i.e. 24) → `pnpm install --frozen-lockfile` → `pnpm format:check` → `pnpm lint` → `pnpm typecheck` → `pnpm build` → `pnpm test` → `pnpm test:coverage` → upload the `coverage/` directory as a GitHub Actions artifact (`actions/upload-artifact@v4`, 14-day retention). This is the only coverage-reporting mechanism — no external SaaS is used.

**`integration`** (needs PostgreSQL):
checkout → same Node/pnpm setup → a `postgres` **service container** using the exact same pinned image used locally, `pgvector/pgvector:0.8.6-pg18`, with explicit CI-only credentials (user `caseflow_ci`, password `caseflow_ci_password`, database `caseflow_ci`) and a `pg_isready`-based healthcheck (`--health-cmd`, 5s interval/timeout, 10 retries) → `DATABASE_URL`/`DATABASE_TEST_URL` set as job-level env vars pointing at `localhost:5432` (GitHub Actions exposes service container ports on the runner's `localhost`) → `pnpm install --frozen-lockfile` → `pnpm db:test:prepare` → `pnpm test:integration`. **No Redis, SeaweedFS, or Mailpit service** is configured — nothing in the current test suite needs them. `prisma db push` is not used anywhere in CI.

Both jobs run on every push to `main` and every pull request, independently (a quality failure does not block the integration job from also reporting, and vice versa — useful signal separation).

## 3. Clean-environment verification

**Method used, and why:** the instructions offer three options — a temporary local clone, a git worktree, or an "equivalent clean checkout." I checked git history first: this repository has exactly **one** commit (`chore: initialize CASEFlow AI project`), and every file from Foundation 0A through 0F has existed only as **uncommitted** working-tree changes this entire time (confirmed via `git log --oneline` and `git status`). A real `git clone` or `git worktree add` would therefore check out an essentially empty repository — it would not exercise any of the Foundation work at all, defeating the point of this test. Since I was also explicitly told not to create any commits, I used the third, explicitly-allowed option — an **equivalent clean checkout** — implemented safely as:

1. `git add -A` (stage everything currently in the working tree — safe and fully reversible, does not create a commit).
2. `git write-tree` (snapshot the index as a tree object — still no commit).
3. `git archive <tree-sha> | tar -x -C <temp-dir>` (extract exactly what that tree contains into an isolated directory under my scratchpad, entirely outside the repository).
4. `git reset` (immediately restore the index to `HEAD`, leaving the primary working tree exactly as it was before step 1 — verified via `git status` before/after being identical).

This produces a byte-accurate preview of "what a real clone would contain once this work is committed," fully respecting `.gitignore` (staging never picks up ignored files), without ever creating a commit, tag, or touching the primary working tree's content.

**What was run in the clean checkout**, in order: `pnpm install`, `cp .env.example .env`, `pnpm verify`, `pnpm infra:up`, `pnpm db:migrate`, `pnpm db:test:prepare`, `pnpm test:integration`, then `pnpm dev` with `curl` checks against both `http://localhost:3000/` and `http://localhost:3001/health/live`.

**Handling the "infrastructure already running" case**: the primary working tree's Docker Compose stack (`caseflow-ai`, from earlier Foundation work) was already running when this test began. Docker Compose identifies a stack by its **project name** (`name: caseflow-ai` in `compose.yml`), not by which directory's copy of the file you point it at — so running `pnpm infra:up` from the clean checkout targeted the exact same named project/containers, not a second parallel stack. There was never a risk of two stacks fighting over the same ports. `redis` and `mailpit` were left running untouched (their config was unchanged); `postgres` and `seaweedfs` were recreated once each because their `compose.yml` config differs between the two trees (I removed the now-obsolete script bind-mount from `postgres`, among other 0F changes) — Docker Compose detected the config drift and recreated only those two containers, preserving their named volumes throughout (verified: `caseflow`'s `vector` extension and `_prisma_migrations` history were intact immediately after the recreate). No named volume was deleted, and nothing was force-stopped.

**Whether a hidden dependency on untracked/generated files was discovered — yes, one, and it was fixed:** the very first `pnpm verify` run in the clean checkout failed `format:check` across **62 files** — every text file in the archive had CRLF line endings, while Prettier (per `.editorconfig`'s `end_of_line = lf`) expects LF. Root cause: this machine's global Git config has `core.autocrlf=true` (a genuinely common Windows default/recommendation), and the repository had no `.gitattributes` to override it. This is not an artifact of my snapshot method — a real `git clone` on any Windows machine with the same common `core.autocrlf=true` setting would hit the identical failure immediately after cloning, before ever touching a line of code. **Fix applied:** added `.gitattributes` with `* text=auto eol=lf`, which forces LF normalization for this repository regardless of the checking-out developer's global Git config. Re-ran the entire snapshot → extract → `pnpm install` → `pnpm verify` cycle from scratch afterward: **zero** formatting issues, full `pnpm verify` success. No other hidden dependency on an untracked or generated local file was found — every other step (build, unit tests, coverage, migration, test-DB prep, integration tests, `pnpm dev`) succeeded on the first attempt in the clean checkout.

**Application verification in the clean checkout:**

- `pnpm dev` started `web`, `api`, and `worker` together via `concurrently`.
- `curl http://localhost:3000/` → HTTP 200 (Next.js page served correctly).
- `curl http://localhost:3001/health/live` → HTTP 200, body `{"status":"ok"}`.
- All processes were stopped afterward and ports 3000/3001 confirmed free.

The temporary clean-checkout directory was deleted after the test completed.

## 4. Full Gate 0 results (primary repository)

All commands below were actually executed in the primary working tree, after the fixes above were applied there too:

- `pnpm install` → succeeded, lockfile unchanged, no new supply-chain policy prompts.
- `pnpm verify` → **passed end-to-end**: `format:check` ✓, `lint` ✓, `typecheck` ✓ (from a `dist/`-free state, confirmed to create no `dist/` output — the Foundation 0E invariant still holds), `build` ✓, `test` ✓ (2/2), `test:coverage` ✓ (report generated; same honest ~4–17% baseline numbers as Foundation 0E, unchanged since no new source behavior was added this task).
- `pnpm db:validate` → `The schema at prisma\schema.prisma is valid`.
- `pnpm db:migrate` → `No pending migrations to apply` (the pgvector migration from Foundation 0D remains the only one, already applied).
- `pnpm db:test:prepare` → ran the new portable script; `caseflow_test` already existed (idempotent path), `vector` extension confirmed present.
- `pnpm test:integration` → 1 file, 3 tests, all passed against the real `caseflow_test` database.
- `docker compose -f infra/docker/compose.yml config` → valid (`--quiet` exit 0).
- `pnpm infra:status` → all four long-running services (`postgres`, `redis`, `seaweedfs`, `mailpit`) reported `healthy`. (`storage-init` is a one-shot job that exits 0 and does not appear in the "running" list — its bucket-creation effect was already verified operationally in Foundation 0D and was not disturbed by anything in this task.)

## 5. Not verified

- No CI run was actually observed on GitHub Actions infrastructure — the workflow YAML was authored and its individual commands were validated locally (the same commands the workflow invokes), but the workflow file itself has not been executed by a real Actions runner in this session.
- The clean-environment test exercised `pnpm dev`'s web/API paths but not a long-running/extended session of it, nor the worker's signal-shutdown path (consistent with every prior Foundation increment — Windows does not deliver `SIGTERM` the way POSIX systems do, and this remains untested by design).
- `pnpm verify:integration` was implemented and its constituent commands (`db:test:prepare`, `test:integration`) were each verified individually and in combination via `pnpm verify:integration` directly (see section 4's equivalent checks) — but it was not additionally re-run inside the clean checkout as a single combined invocation (only its two constituent commands were, sequentially, alongside the rest of the clean-checkout flow).
- Mailpit/Redis/SeaweedFS were confirmed healthy but, as in every prior Foundation increment, have no automated tests exercising them (correctly out of scope — see Foundation 0E's "Redis / storage / mail" section, unchanged).

## 6. Relevant notes — explicit answers

- **Final CI job structure**: two jobs, `quality` (format/lint/typecheck/build/test/coverage, no infrastructure) and `integration` (a `pgvector/pgvector:0.8.6-pg18` service container, `db:test:prepare` + `test:integration`, no Redis/SeaweedFS/Mailpit). See section 2 for the full step list.
- **PostgreSQL service image used in CI**: `pgvector/pgvector:0.8.6-pg18` — the identical pinned image/tag used locally (Foundation 0D), so CI and local behavior stay aligned.
- **How test DB preparation became portable**: replaced a `docker compose exec`-wrapped shell script with `scripts/prepare-test-database.mjs`, a plain Node script using the `pg` driver directly over TCP — no dependency on Docker, on a specific container name, or on any shell being available inside a container. It works identically wherever Node + network access to PostgreSQL exist.
- **Exact `verify` semantics**: `format:check && lint && typecheck && build && test && test:coverage`, entirely infrastructure-independent (verified: it starts no Docker container and opens no database connection anywhere in that chain).
- **Exact `verify:integration` semantics**: `db:test:prepare && test:integration` — assumes PostgreSQL is already reachable (via `DATABASE_URL`/`DATABASE_TEST_URL`); does not call `infra:up` and will fail loudly (connection error) rather than silently starting infrastructure if PostgreSQL isn't already up.
- **README onboarding flow**: clone → copy `.env.example` → `.env` → `pnpm install` → `pnpm infra:up` → `pnpm db:migrate` → `pnpm db:test:prepare` → `pnpm dev`, given in both POSIX and Windows PowerShell forms, exactly as specified.
- **All Foundation URLs**: Web `http://localhost:3000`, API health `http://localhost:3001/health/live`, Mailpit `http://localhost:8025`, SeaweedFS S3 `http://localhost:8333` — all documented in the README and all re-verified live during this task (web/API in the clean checkout; Mailpit/SeaweedFS via their existing healthy container status, consistent with Foundation 0D).
- **`.env.example` review result**: no missing or stale-but-needed variables found; one stale comment (referencing the now-removed shell script) fixed. No future/speculative (AI, auth, application-domain) variables exist or were added.
- **`.gitignore` review result**: fully compliant already; no changes required. All required patterns present; none of the four "must not ignore" items (`.env.example`, Prisma migrations, `CASEFLOW_AI_SPEC.md`, `AGENTS.md`) are ignored, confirmed directly with `git check-ignore`.
- **Clean-checkout method used**: `git add -A` → `git write-tree` → `git archive <tree> | tar -x` → `git reset`, explained in full in section 3, because no commit exists yet for a real clone/worktree to check out and creating one was explicitly disallowed for this task.
- **Whether a hidden dependency on untracked files was discovered**: yes — not a literal "untracked file" dependency, but an equivalent-severity onboarding blocker: a missing `.gitattributes` meant a common Windows Git configuration (`core.autocrlf=true`) would corrupt line endings on checkout and fail `format:check` for 62 files immediately after a fresh clone. Fixed by adding `.gitattributes` (`* text=auto eol=lf`); re-verified clean from scratch afterward. No other such issue was found.
- **All Gate 0 command results**: all green — see sections 3 and 4 in full; nothing was skipped or assumed.
- **Remaining known limitations**: (1) Windows cannot reliably deliver `SIGTERM` to the worker process, so that path stays untested by automated means, as documented since Foundation 0B; (2) a native PostgreSQL service on this machine can occupy port 5432 and must be stopped manually by a developer (documented in the README's Troubleshooting section, matching the real incident from Foundation 0D — CASEFlow AI does not and should not do this automatically); (3) CI itself has not yet been executed on real GitHub Actions infrastructure, only locally-equivalent commands.
- **Whether the repository is ready to be declared CASEFlow AI 0.1.0**: from a purely technical-foundation standpoint, every Gate 0 check specified for this task passed, in both the primary repository and an independent clean checkout, including the CI-equivalent commands the new two-job workflow will run. The one real onboarding defect this process could find (line-ending normalization) was found and fixed. That said, per this task's explicit instructions, **I have not changed the product version to `0.1.0`, created any commit, or created any tag** — the task states to wait for review after this report before any such declaration, and nothing in this repository has been committed yet at all (a prerequisite that would itself need to happen, deliberately, before any version/tag decision). I'm reporting the technical readiness signal; the decision to actually declare and tag `0.1.0` is left for your review, as instructed.

Per the task instructions, **Increment 1 was not started, and no commits or git tags were created.**
