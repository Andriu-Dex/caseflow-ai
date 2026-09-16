# Foundation 0B — Applications — Completion Report

Date: 2026-09-15
Task: Foundation 0B — Applications (CASEFlow AI Increment 0)

## 1. Implemented

### Preliminary configuration review

- Root `package.json`'s `"type": "module"` was **removed**. It existed only so `eslint.config.js` could use ESM `import` syntax. `eslint.config.js` was renamed to `eslint.config.mjs` (ESM regardless of `package.json` `"type"`), so the root package now defaults to CommonJS again — the correct default for a repository whose Nest apps use CommonJS.
- `tsconfig.base.json` was **left unchanged** (still `module`/`moduleResolution`: `NodeNext`, shared strict options). Each app now overrides `module`/`moduleResolution` (and related emit options) in its own `tsconfig.json`, which TypeScript permits via config inheritance:
  - `apps/web/tsconfig.json`: `module: esnext`, `moduleResolution: bundler`, `jsx: preserve`, `noEmit: true`, `composite: false` (required by Next.js's own type-checking, which is non-composite and emits nothing via `tsc`).
  - `apps/api` / `apps/worker` `tsconfig.json`: `module: CommonJS`, `moduleResolution: Node10`, `experimentalDecorators: true`, `emitDecoratorMetadata: true`, `composite: false`, `noEmit: true` (required by NestJS's decorator-based DI). A sibling `tsconfig.build.json` extends this with `noEmit: false` for actual compilation, excluding `*.spec.ts`.
  - Root `tsconfig.json`'s project `"references"` were narrowed to the 6 `packages/*` libraries only (they remain `NodeNext`/composite, unaffected). The 3 apps were removed from that references graph because `tsc --build` requires every referenced project to be `composite: true`, which conflicts with Next's/Nest's `noEmit` app configs.
  - TypeScript strictness (`strict`, `noUncheckedIndexedAccess`, etc.) from the base config was **not weakened** anywhere.

### apps/web (Next.js)

- Real Next.js 16.3.5 application, App Router (`app/layout.tsx`, `app/page.tsx`), React 19.3.0, TypeScript, Tailwind CSS 4.3.3 (`@tailwindcss/postcss` + `@import 'tailwindcss'` in `app/globals.css`, no `tailwind.config.js` needed — Tailwind v4 auto-detects content).
- Minimal home page, Spanish text: "CASEFlow AI" / "Entorno base ejecutándose correctamente."
- `next.config.ts` sets `agentRules: false` — Next 16 auto-generates a local `AGENTS.md`/`CLAUDE.md` inside `apps/web` by default; this was disabled and the generated files deleted, to avoid any confusion with the repository's authoritative root `AGENTS.md`.
- No shadcn/ui, React Hook Form, or TanStack Query added, per instructions.
- Runs on port 3000 via `next dev --port 3000` / `next start --port 3000` (hardcoded flag, not read from `WEB_PORT` — see Notes).

### apps/api (NestJS)

- Real NestJS 12.0.3 application (`@nestjs/core`, `@nestjs/common`, `@nestjs/platform-express`).
- `AppModule` → `HealthModule` → `HealthController` with `GET /health/live` returning `{ "status": "ok" }`.
- Listens on `process.env.API_PORT ?? 3001`.
- No authentication, Workspace/Project/Artifact/Requirements, Prisma, Redis, BullMQ, AI, or external providers were added.
- Structure (`AppModule` importing feature modules) is set up to extend with further modules later.

### apps/worker (NestJS standalone)

- Real NestJS 12.0.3 application using `NestFactory.createApplicationContext(AppModule)` — **no HTTP adapter/platform package installed or used**.
- Logs `"CASEFlow AI worker started."` on boot; listens for `SIGINT`/`SIGTERM` to call `app.close()` and exit cleanly.
- No Redis/BullMQ processors added.

### Environment

`.env.example` updated to exactly the variables Foundation 0B uses/documents:

```
NODE_ENV=development
WEB_PORT=3000
API_PORT=3001
NEXT_PUBLIC_API_URL=http://localhost:3001
WEB_ORIGIN=http://localhost:3000
```

No database, Redis, storage, SMTP, or AI configuration was added.

### Root scripts

```
pnpm dev        → concurrently runs web + api + worker dev servers
pnpm dev:web    → next dev --port 3000
pnpm dev:api    → node --watch --require ts-node/register src/main.ts
pnpm dev:worker → node --watch --require ts-node/register src/main.ts
pnpm build      → pnpm -r --if-present run build   (topological order across all 9 packages/apps)
pnpm lint       → eslint .
pnpm format     → prettier --write .
pnpm format:check → prettier --check .
pnpm typecheck  → pnpm -r --if-present run typecheck
```

Each `packages/*` library gained a `typecheck` script (`tsc --build --pretty`) alongside its existing `build` script, so the recursive root scripts have real, non-duplicated per-package commands to call. No script echoes success without doing real work.

**New dependency justification**: `concurrently@10.0.5` (root devDependency) — required to run `pnpm dev:web`, `pnpm dev:api`, and `pnpm dev:worker` as one supervised process group under `pnpm dev`, with per-process labeled/colored output and a single Ctrl+C to stop all three. This is the standard, minimal solution for this exact problem; implementing equivalent process orchestration by hand was judged not worth avoiding one small, popular, zero-runtime-impact devDependency.

### CI

`.github/workflows/ci.yml` extended with a `pnpm build` step after the existing `install` / `format:check` / `lint` / `typecheck` steps (all of which now have real, meaningful implementations across every workspace package). No integration/database/Docker/security/E2E steps were added, since none of that is implemented yet.

## 2. Verified

All commands below were actually executed in the repository:

- `pnpm install` → resolved successfully; installed Next.js, React, Tailwind, NestJS, and related packages across all 10 workspace projects (root + 9 apps/packages).
- `pnpm format:check` (`prettier --check .`) → **passed**, all files conform.
- `pnpm lint` (`eslint .`) → **passed**, no errors, across `.ts`/`.tsx` files in `apps/*` and `packages/*`.
- `pnpm typecheck` (`pnpm -r --if-present run typecheck`) → **passed** for all 9 packages/apps, including `apps/web` (`tsc --noEmit`, bundler resolution), `apps/api`/`apps/worker` (`tsc --noEmit`, CommonJS + decorators), and all 6 library packages (`tsc --build --pretty`, NodeNext composite).
- `pnpm build` → **passed** for all 9 packages/apps: `next build` produced a static-optimized production build of the home page (`Route (app) ┌ ○ /`), and `tsc -p tsconfig.build.json` compiled `apps/api`/`apps/worker` to `dist/`.
- `apps/web` starts successfully: built app served via `next start --port 3000`; `curl http://localhost:3000/` returned HTTP 200 with the expected `lang="es"` HTML containing "CASEFlow AI" and "Entorno base ejecutándose correctamente."
- `apps/api` starts successfully: `node dist/main.js` logged Nest's normal startup sequence and mapped `{/health/live, GET}`; `curl http://localhost:3001/health/live` returned HTTP 200 with body `{"status":"ok"}`.
- `apps/worker` starts successfully without an HTTP server: `node dist/main.js` logged `"CASEFlow AI worker started."`; `netstat` confirmed the worker process opened **no listening port** (unlike the API process, which was independently confirmed to listen on 3001).
- `pnpm dev` starts all three applications concurrently: verified end-to-end — `web`, `api`, and `worker` all logged successful startup under `concurrently`, and both `curl http://localhost:3000/` (200) and `curl http://localhost:3001/health/live` (`{"status":"ok"}`, 200) succeeded while all three were running together.
- Re-verified `format:check` / `lint` / `typecheck` / `build` a second time after disabling Next's `agentRules` and adding `next-env.d.ts` to `.gitignore`/`.prettierignore` — all still pass.

## 3. Not verified

- Graceful shutdown of `apps/worker` via a real `SIGTERM` signal was **not** conclusively exercised. Node.js on Windows does not deliver `SIGTERM` the way POSIX systems do (Node's own docs note `SIGTERM` is not supported on Windows), and this session runs on Windows. The worker's `SIGINT`/`SIGTERM` handlers are implemented per standard NestJS/Node convention and would be expected to work in the target Linux-based Docker/CI environment described in the spec, but that specific behavior should be re-verified there.
- `pnpm dev` was verified to start correctly and serve both endpoints, but was not left running for an extended period or verified for hot-reload behavior on file changes (out of scope for a one-time startup check).
- No automated tests exist yet for `apps/web`, `apps/api`, or `apps/worker` (none were requested for 0B); only manual/process-level verification above was performed.
- Prisma/database, Redis, and other later-increment integrations were intentionally not touched or verified, per constraints.

## 4. Relevant notes

- **Exact versions installed**: `next@16.3.5`, `react@19.3.0`, `react-dom@19.3.0`, `tailwindcss@4.3.3`, `@tailwindcss/postcss@4.3.3`, `@nestjs/core@12.0.3`, `@nestjs/common@12.0.3`, `@nestjs/platform-express@12.0.3` (api only), `reflect-metadata@0.2.2`, `rxjs@7.8.2`, `ts-node@10.9.2`, `@types/node@24.13.4`, `@types/express@5.0.6`, `concurrently@10.0.5`.
- **Root ESM change**: yes, reverted. Root `"type": "module"` removed; `eslint.config.js` → `eslint.config.mjs`. Verified `pnpm lint`/`format`/`typecheck` all still work after the change.
- **App-specific tsconfig overrides**: handled per-app as described in section 1 (Next → bundler/ESNext/preserve-JSX/noEmit; Nest apps → CommonJS/Node10/decorators/noEmit for typecheck + a `tsconfig.build.json` for real emit). Root `tsconfig.json` project references now cover only the 6 composite library packages.
- **`pnpm-workspace.yaml` was modified by `pnpm install` itself** (not by this task directly): pnpm's built-in supply-chain policy (`minimumReleaseAge`) flagged `@nestjs/core@12.0.3`, `@nestjs/common@12.0.3`, and `@nestjs/platform-express@12.0.3` as very recently published and added a `minimumReleaseAgeExclude` allow-list entry for them automatically. This is pnpm 11's own security feature behaving as designed, not a manual edit.
- **`WEB_PORT` is documented but not wired**: `apps/web`'s `dev`/`start` scripts hardcode `--port 3000` (matching the literal "must run on port 3000" requirement) rather than reading `WEB_PORT`, to avoid adding a custom Next.js server or a cross-platform env-var-in-script workaround for a value that is currently fixed anyway. `API_PORT` **is** wired (`apps/api/src/main.ts` reads `process.env.API_PORT ?? 3001`).
- **Package module format mismatch flagged for later**: `packages/*` libraries are ESM (`"type": "module"`, set in Foundation 0A) while `apps/api`/`apps/worker` are CommonJS (required by NestJS's decorator metadata model). No app currently imports any `packages/*` library, so this isn't exercised yet, but when a later increment has a Nest app depend on a `packages/*` library, the CJS↔ESM interop will need an explicit decision (e.g., dynamic `import()`, or dual-format package output). Flagging now so it isn't a surprise later.
- Per the task instructions, **Foundation 0C/0D were not started**.
