# Foundation 0C — Shared Package Foundations — Completion Report

Date: 2026-09-15
Task: Foundation 0C — Shared Package Foundations (CASEFlow AI Increment 0)

## 1. Implemented

### Package boundaries

- All six `packages/*` preserved: `domain`, `contracts`, `ui`, `ai`, `integrations`, `config`.
- No `packages/*` declares a dependency on any `apps/*` package — confirmed by inspection (see Verified).
- The only new internal dependency introduced is `apps/api → packages/contracts` (an app depending on a package, the allowed direction).
- No dependency was created between shared packages (`domain`, `config`, `ai`, `integrations`, `ui` remain mutually independent, zero `dependencies` entries).
- `packages/domain` remains fully framework/infrastructure-free (no dependencies at all).
- No circular dependency was introduced (the dependency graph is a strict DAG: `apps/api → packages/contracts`, nothing else).

### Package public APIs (all six packages)

Every `packages/*` `package.json` now declares a real, minimal public-API surface:

| Field              | Value pattern (all six)              |
| ------------------ | ------------------------------------ |
| `name`             | `@caseflow-ai/<name>` (unchanged)    |
| `private`          | `true` (unchanged — never published) |
| `main`             | `./dist/index.js` (unchanged)        |
| `types`            | `./dist/index.d.ts` (unchanged)      |
| `exports`          | **added** — see below                |
| `build` script     | `tsc --build` (unchanged)            |
| `typecheck` script | `tsc --build --pretty` (unchanged)   |

**`exports` field added to all six** (this is the change that actually enforces "consume the public export, not private source paths" at the Node.js runtime level — `moduleResolution: Node10`, used by the five CJS packages for TypeScript purposes, does not itself understand `exports`, but Node's own runtime module resolution does, independently of how `tsc` resolved types):

- Five CommonJS packages (`domain`, `contracts`, `config`, `ai`, `integrations`):
  ```json
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "require": "./dist/index.js",
      "default": "./dist/index.js"
    }
  }
  ```
- `packages/ui` (ESM):
  ```json
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.js",
      "default": "./dist/index.js"
    }
  }
  ```
- Because `exports` now only maps `"."`, Node refuses to resolve any deep import (`@caseflow-ai/contracts/src/*`, or even `@caseflow-ai/contracts/dist/*`) at runtime — only the package root import works. This is enforced by Node itself, not by convention.
- No dual ESM/CJS build was added anywhere — each package still emits exactly one module format, matching the Foundation 0B.1 strategy.

### Workspace dependencies

- `apps/api/package.json` now depends on `"@caseflow-ai/contracts": "workspace:*"` — the only new internal dependency in the repository. No `file:` paths were used anywhere.
- No packages were published or prepared for publishing (`private: true` preserved everywhere).

### `@caseflow-ai/contracts` — first real shared package

- Added `packages/contracts/src/health/health-live.contract.ts`:
  ```ts
  export interface HealthLiveResponse {
    status: 'ok';
  }
  ```
- `packages/contracts/src/index.ts` updated to re-export it as a type-only export, alongside the existing placeholder:
  ```ts
  export const PACKAGE_NAME = '@caseflow-ai/contracts';

  export type { HealthLiveResponse } from './health/health-live.contract';
  ```
- `apps/api/src/health/health.controller.ts` updated to consume it from the package's public export instead of a local interface:
  ```ts
  import { Controller, Get } from '@nestjs/common';
  import type { HealthLiveResponse } from '@caseflow-ai/contracts';

  @Controller('health')
  export class HealthController {
    @Get('live')
    getLiveness(): HealthLiveResponse {
      return { status: 'ok' };
    }
  }
  ```
- No unrelated DTOs or contracts were added — `HealthLiveResponse` is the only export beyond the pre-existing `PACKAGE_NAME` placeholder.

### Domain / AI / Integrations / Config packages

- `packages/domain`, `packages/ai`, `packages/integrations` source is **byte-for-byte unchanged** from Foundation 0A/0B.1 — still only `export const PACKAGE_NAME = '@caseflow-ai/<name>';`. No entities, aggregates, `Result<T>`, value-object frameworks, providers, orchestrators, or routers were added.
- `packages/config` source is also unchanged. No configuration primitives were added — nothing in the current Foundation apps has a genuine, non-speculative need for a shared config helper yet (the one env var consumed today, `API_PORT`, is read directly and trivially via `process.env` in `apps/api/src/main.ts`; wrapping that single read in an abstraction now would be speculative). No Zod dependency was added.
- `packages/ui` source is unchanged; no React/React-DOM dependency or peerDependency was added, because the package contains no JSX/React code yet — there is nothing that currently requires declaring React as a peer. Adding it now, with no consuming code, would itself be speculative; this is deferred until a real UI export needs it.

### Application behavior preserved

- Web still runs on port 3000, API on port 3001, `GET /health/live` still returns `{"status":"ok"}`, worker remains a standalone Nest application context with no HTTP listener, and the root `concurrently`-based `pnpm dev` is unchanged.
- No new product functionality was implemented.

### Tooling

- No Turborepo, tsup, Rollup, esbuild packaging, or dependency-graph tooling was added. The plain TypeScript project (`tsc --build` for the five CJS packages + `ui`) plus pnpm's own workspace protocol and topological script ordering was sufficient for everything this task required.

## 2. Verified

All commands below were actually executed in the repository after the changes:

- `pnpm install` → succeeded; created the workspace symlink `apps/api/node_modules/@caseflow-ai/contracts -> packages/contracts` (confirmed by directly listing that directory).
- `pnpm format:check` → **passed** (one pre-existing formatting issue in a prior report file, unrelated to this task's code changes, was fixed with `prettier --write` so the check is clean).
- `pnpm lint` → **passed**.
- `pnpm typecheck` (`pnpm -r --if-present run typecheck`) → **passed**. Observed pnpm's topological execution order directly in the output: `packages/contracts typecheck` ran and completed **before** `apps/api typecheck` started, confirming the new `workspace:*` dependency correctly influences build order (required, since `apps/api` resolves `@caseflow-ai/contracts` types from its built `dist/index.d.ts`, not from source).
- `pnpm build` (`pnpm -r --if-present run build`) → **passed**, with the same correct ordering (`packages/contracts build` before `apps/api build`); `apps/web`'s `next build` still produced the static-optimized page.
- **Explicit verification items from the task, all performed directly:**
  1. `@caseflow-ai/contracts` emits valid CommonJS — inspected `packages/contracts/dist/index.js` directly: `"use strict"; Object.defineProperty(exports, "__esModule", ...); exports.PACKAGE_NAME = ...`.
  2. `.d.ts` declarations generated — inspected `packages/contracts/dist/index.d.ts` (re-exports `HealthLiveResponse` as a type) and `packages/contracts/dist/health/health-live.contract.d.ts` (the actual interface) directly on disk.
  3. `apps/api` consumes `HealthLiveResponse` through the package's public export — confirmed by reading `apps/api/src/health/health.controller.ts` (`import type { HealthLiveResponse } from '@caseflow-ai/contracts'`), which resolves via the package's `types`/`exports` field, not a relative path into `src`.
  4. `apps/api` does **not** import `contracts/src/*` — `grep -rn "contracts/src" apps/api/src` returned no matches.
  5. API starts normally — `node dist/main.js` logged Nest's standard startup sequence and mapped `{/health/live, GET}`.
  6. `GET /health/live` → HTTP 200, body `{"status":"ok"}` — verified via `curl`.
  7. Worker still starts without an HTTP listener — logged `"CASEFlow AI worker started."`; `netstat` confirmed no listening port opened.
  8. Web still builds successfully — confirmed as part of the `pnpm build` run above (`Route (app) ┌ ○ /`).
- **Additional runtime-interop proof** (beyond the required checklist, to substantiate "no runtime workaround"): ran `node -e "require('@caseflow-ai/contracts')"` **from inside `apps/api`** (so it resolves through the real workspace symlink and `package.json` `exports`/`main` fields) — succeeded and returned `PACKAGE_NAME`. Also inspected the compiled `apps/api/dist/health/health.controller.js`: since `HealthLiveResponse` is consumed via `import type`, TypeScript correctly erased the import entirely — no `require('@caseflow-ai/contracts')` appears in the compiled controller, confirming zero runtime footprint for a type-only contract (the correct, idiomatic outcome, not a workaround).
- **Workspace dependency graph inspected**: `grep -rn "@caseflow-ai/web\|@caseflow-ai/api\|@caseflow-ai/worker" packages/*/package.json` returned no matches — no `packages/*` workspace depends on any `apps/*` workspace. `pnpm list -r --depth 0` confirms `apps/api`'s only internal dependency is `@caseflow-ai/contracts@link:../../packages/contracts`; `apps/web` and `apps/worker` have no internal workspace dependencies; all six `packages/*` have zero dependencies of any kind.
- `pnpm dev` re-verified end-to-end after all changes: web, api, and worker all started under `concurrently`; `curl http://localhost:3000/` → 200; `curl http://localhost:3001/health/live` → 200 `{"status":"ok"}`.

## 3. Not verified

- As in prior increments, `apps/worker`'s `SIGTERM` handler was not exercised via a real signal in this Windows shell environment (unchanged, known platform limitation, not related to this task's changes).
- No automated test suite exists yet for any package or app; verification here is build/typecheck/process-level only, matching the scope of this task.
- Publishing behavior was not tested, since packages are `private: true` and are not intended to be published in V1.

## 4. Relevant notes — explicit answers

- **Final public export configuration for all six packages**: identical `main`/`types` pointers plus a matching `exports["."]` map for every package (5× CJS with `require`+`default`, 1× ESM `ui` with `import`+`default`), each with `types` listed first. See the tables/JSON in section 1.
- **Internal workspace dependencies introduced**: exactly one — `apps/api` → `@caseflow-ai/contracts` via `workspace:*`. No other new internal dependency (app-to-package or package-to-package) was added.
- **Exact code moved/added to `@caseflow-ai/contracts`**: new file `src/health/health-live.contract.ts` exporting `interface HealthLiveResponse { status: 'ok'; }`, re-exported (type-only) from `src/index.ts`. Nothing else was added to the package.
- **Confirmation domain/ai/integrations remain free of speculative implementations**: verified by direct inspection — all three packages' `src/index.ts` are byte-identical to Foundation 0A/0B.1 (`export const PACKAGE_NAME = '@caseflow-ai/<name>';`, nothing else). `packages/config` is likewise unchanged in source.
- **Any new dependency and why**: none. No new npm package was added to any `package.json`'s `dependencies`/`devDependencies` — only an internal `workspace:*` link (`apps/api` → `@caseflow-ai/contracts`) and `exports` field configuration were added.
- **Any module interoperability issue encountered**: none. The `workspace:*` link plus the existing CommonJS/`Node10` configuration from Foundation 0B.1 worked without any special handling — `apps/api` (CJS, `moduleResolution: Node10`) resolves `@caseflow-ai/contracts`'s types via its `types` field (Node10 resolution ignores `exports` but honors `types`/`main`, which is sufficient here), and at runtime Node's `exports` field correctly serves the CJS `require()` path. No loader flags, path aliases, or `src`-pointing shortcuts were needed anywhere.

Per the task instructions, **Foundation 0D was not started**.
