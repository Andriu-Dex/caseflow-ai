# Foundation 0B.1 — Application Foundation Stabilization — Completion Report

Date: 2026-09-15
Task: Foundation 0B.1 — Application Foundation Stabilization (CASEFlow AI Increment 0)

## 1. Implemented

### NestJS baseline downgrade

- `apps/api` and `apps/worker` downgraded from NestJS 12.0.3 to **NestJS 11.2.3** (the requested preferred version, confirmed available and compatible):
  - `@nestjs/core@11.2.3`, `@nestjs/common@11.2.3` (both apps)
  - `@nestjs/platform-express@11.2.3` (`apps/api` only)
- `reflect-metadata@0.2.2` and `rxjs@7.8.2` were kept unchanged — both satisfy Nest 11.2.3's peer ranges (`reflect-metadata: ^0.1.12 || ^0.2.0`, `rxjs: ^7.1.0`), so no related package needed to move.
- No NestJS CLI (`@nestjs/cli`) was introduced — builds/starts still use plain `tsc`/`node`, as in 0B.
- The stale `pnpm-lock.yaml` (still resolving the old 12.0.3 packages) was refreshed via `pnpm clean --lockfile` + `pnpm install` after editing the manifests — this is a lockfile refresh to match the now-lower, already-vetted 11.2.3 versions, **not** a bypass of any policy: `pnpm install` completed with **zero** supply-chain policy violations and added no new `minimumReleaseAgeExclude` entries.

### `pnpm-workspace.yaml`

- Removed the `minimumReleaseAgeExclude` block (`@nestjs/common@12.0.3`, `@nestjs/core@12.0.3`, `@nestjs/platform-express@12.0.3`) that pnpm had auto-added in Foundation 0B because those 12.x releases were brand new. Those entries were obsolete the moment the packages were downgraded. The file now contains only the original `packages:` workspace globs.

### Internal package module strategy

- `packages/domain`, `packages/contracts`, `packages/config`, `packages/ai`, `packages/integrations` converted to **CommonJS**:
  - `package.json`: `"type": "module"` → `"type": "commonjs"` (all five).
  - `tsconfig.json`: added `"module": "CommonJS"`, `"moduleResolution": "Node10"` overrides on top of the shared `tsconfig.base.json` (which stays `NodeNext` for anything that doesn't override it). `composite`/`declaration`/`incremental` were left as inherited from the base — CommonJS composite builds are fully supported by `tsc --build`, no conflict.
- `packages/ui` was **left untouched** (`"type": "module"`, `NodeNext`/ESM), per instruction, since it is frontend-specific and may stay aligned with Next.js/React.
- No dual ESM/CJS build, bundler (tsup/Rollup/esbuild), or new tooling was introduced — this was a plain `package.json`/`tsconfig.json` configuration change, exactly as directed.
- No domain implementation was added; all five packages remain the same minimal `export const PACKAGE_NAME = '@caseflow-ai/<name>';` placeholder from Foundation 0A.
- Stale `dist/` output and `.tsbuildinfo` files from the previous ESM builds were removed before rebuilding, so no leftover ESM artifacts remain on disk.

### Environment cleanup

- `.env.example`: removed `WEB_PORT` (was documented but never consumed — `apps/web`'s scripts already hardcode `--port 3000`, unchanged by this task).
- Final `.env.example` content:
  ```
  NODE_ENV=development
  API_PORT=3001
  NEXT_PUBLIC_API_URL=http://localhost:3001
  WEB_ORIGIN=http://localhost:3000
  ```
- No infrastructure variables (database, Redis, storage, SMTP, AI) were added.

### Preserved behavior

- Next.js web app still runs on port 3000 (`next dev --port 3000` / `next start --port 3000`, unchanged).
- NestJS API still runs on port 3001 (`process.env.API_PORT ?? 3001`, unchanged).
- `GET /health/live` controller/module unchanged.
- Worker remains a standalone Nest application context with no HTTP adapter/listener, unchanged.
- Root `pnpm dev` (`concurrently`-based) script unchanged.
- `tsconfig.base.json` strict settings (`strict`, `noUncheckedIndexedAccess`, etc.) unchanged and not weakened anywhere.
- `.github/workflows/ci.yml` unchanged (still `install` → `format:check` → `lint` → `typecheck` → `build`).

## 2. Verified

All commands below were actually executed in the repository after the changes:

- `pnpm install` → completed with **no supply-chain policy violations** and **no new `minimumReleaseAgeExclude` entries** (11.2.3 is an established release, unlike the very-recently-published 12.0.3 that triggered the original exclusion).
- `pnpm format:check` → **passed**.
- `pnpm lint` → **passed**.
- `pnpm typecheck` (`pnpm -r --if-present run typecheck`) → **passed** for all 9 packages/apps, including the 5 packages now compiling under `CommonJS`/`Node10` and the 2 Nest apps against `@nestjs/*@11.2.3` types.
- `pnpm build` (`pnpm -r --if-present run build`) → **passed** for all 9 packages/apps: `apps/api` and `apps/worker` compiled cleanly against Nest 11.2.3; `apps/web`'s `next build` still produced the static-optimized page.
- Inspected the emitted JS of all 6 shared/UI packages directly:
  - `packages/{domain,contracts,config,ai,integrations}/dist/index.js` all emit `"use strict"; Object.defineProperty(exports, "__esModule", ...); exports.PACKAGE_NAME = ...` — genuine CommonJS.
  - `packages/ui/dist/index.js` still emits `export const PACKAGE_NAME = ...` — genuine ESM, unchanged.
  - Additionally ran `node -e "require('./packages/domain/dist/index.js')"` directly — succeeded, proving the CJS output is `require()`-able with no runtime ESM/CJS workaround (no dynamic `import()`, no experimental loader flags).
- `apps/api` starts successfully on Nest 11.2.3: `node dist/main.js` logged Nest's normal startup sequence and mapped `{/health/live, GET}`.
- `curl http://localhost:3001/health/live` → HTTP 200, body `{"status":"ok"}`.
- `apps/worker` starts successfully on Nest 11.2.3 without an HTTP listener: logged `"CASEFlow AI worker started."`; `netstat` confirmed no listening port was opened by the worker process.
- `pnpm dev` starts all three applications concurrently: verified end-to-end again post-downgrade — `web`/`api`/`worker` all logged successful startup under `concurrently`, and both `curl http://localhost:3000/` (200) and `curl http://localhost:3001/health/live` (`{"status":"ok"}`, 200) succeeded while all three ran together.
- `pnpm list --filter @caseflow-ai/api --filter @caseflow-ai/worker --depth 0` → confirms `@nestjs/common@11.2.3`, `@nestjs/core@11.2.3`, `@nestjs/platform-express@11.2.3` are the resolved versions actually installed.

## 3. Not verified

- As in Foundation 0B, `apps/worker`'s `SIGTERM` handler could not be conclusively exercised via a real signal in this Windows shell environment (Node does not deliver `SIGTERM` on Windows the way it does on POSIX systems). Unchanged limitation, not reintroduced by this task.
- No automated test suite exists yet for any app or package; verification here is build/typecheck/process-level only, matching the scope of this stabilization task.
- Long-running/hot-reload behavior of `pnpm dev` beyond the initial ~10–15 second startup window was not exercised (same as 0B).

## 4. Relevant notes — explicit answers

- **Final NestJS versions**: `@nestjs/core@11.2.3`, `@nestjs/common@11.2.3`, `@nestjs/platform-express@11.2.3` (the last one only in `apps/api`; `apps/worker` does not depend on it, since it has no HTTP adapter).
- **Changes to `pnpm-workspace.yaml`**: removed the `minimumReleaseAgeExclude` list (3 entries, all referencing the now-removed NestJS 12.0.3 packages). The file now only declares the `apps/*`/`packages/*` workspace globs. No new exclusions were added — 11.2.3 passed the supply-chain policy check on its own merits.
- **Final module format of each `packages/*` workspace**:
  | Package                 | `type`     | `module` (tsconfig)    | Output                              |
  | ----------------------- | ---------- | ---------------------- | ----------------------------------- |
  | `packages/domain`       | `commonjs` | `CommonJS`             | CJS (`exports.X = ...`)             |
  | `packages/contracts`    | `commonjs` | `CommonJS`             | CJS                                 |
  | `packages/config`       | `commonjs` | `CommonJS`             | CJS                                 |
  | `packages/ai`           | `commonjs` | `CommonJS`             | CJS                                 |
  | `packages/integrations` | `commonjs` | `CommonJS`             | CJS                                 |
  | `packages/ui`           | `module`   | `NodeNext` (inherited) | ESM (`export const ...`), unchanged |
- **Was any dependency added?** No new dependency was added or removed at the package-manager level in this task — only version numbers changed (`@nestjs/*` 12.0.3 → 11.2.3) and `package.json`/`tsconfig.json` fields were edited. `pnpm-lock.yaml` was regenerated (not hand-edited) to reflect those version changes.
- **Remaining ESM/CJS interoperability concern**: none for the backend/shared packages targeted by this task — they are now plain CommonJS and `require()`-able from `apps/api`/`apps/worker` with zero workarounds, exactly as verified above. The only remaining asymmetry is the intentional one: `packages/ui` stays ESM for `apps/web`/Next.js consumption. If a future increment needs `apps/web` to consume any of the five now-CJS packages (e.g. shared `contracts` types), that direction is unproblematic (ESM can `import` CJS); the previously-flagged risk (a CJS Nest app synchronously `require()`-ing an ESM package) is now resolved for all packages Nest apps are expected to depend on.

Per the task instructions, **Foundation 0C was not started**.
