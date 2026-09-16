# Foundation 0A — Repository Foundation — Completion Report

Date: 2026-09-15
Task: Foundation 0A — Repository Foundation (CASEFlow AI Increment 0)

## 1. Implemented

- Root `package.json` with `"packageManager": "pnpm@11.27.0"`, `"type": "module"`, Node engine constraint (`>=24 <25`), and real scripts only: `format`, `format:check`, `lint`, `typecheck`.
- `pnpm-workspace.yaml` defining `apps/*` and `packages/*`.
- `tsconfig.base.json` (TypeScript 5.9, strict, `NodeNext`, project-reference friendly) and root `tsconfig.json` with references to all 9 workspace projects (composite build).
- `.nvmrc` (`24`), `.editorconfig`, `.prettierrc`, `.prettierignore`.
- Root ESLint flat config (`eslint.config.js`, ESM) using `typescript-eslint` + `@eslint/js` + `eslint-config-prettier`.
- `.env.example` with only a placeholder, no secrets.
- Workspace packages created, each with `package.json`, `tsconfig.json` (extends base), and a minimal `src/index.ts` placeholder (no business logic):
  - `apps/web`, `apps/api`, `apps/worker`
  - `packages/domain`, `packages/contracts`, `packages/ui`, `packages/ai`, `packages/integrations`, `packages/config`
- `prisma/schema.prisma` with only `generator` + `datasource` blocks — **no models/entities** (per constraint).
- `infra/docker/`, `infra/nginx/` (placeholders, `.gitkeep`).
- `.github/workflows/ci.yml` running `pnpm install --frozen-lockfile`, `format:check`, `lint`, `typecheck` (matches real root scripts only).
- `docs/` and `AGENTS.md` left untouched by this task (pre-existing staged changes to `.gitignore`, `AGENTS.md`, `docs/CASEFLOW_AI_SPEC.md` were already present before this task started and were not modified further).
- Added `docs/CASEFLOW_AI_SPEC.md` and `AGENTS.md` to `.prettierignore` so tooling never reformats the two files this task must preserve verbatim.

No authentication, Workspace/Project/Artifact/Requirements domain logic, AI providers, Stitch integration, code generation, or database entities were added, per constraints.

## 2. Verified

Commands actually executed in the repository root:

- `pnpm install` → resolved and linked all **10** workspace projects (root + 9 packages/apps) successfully.
- `pnpm list -r --depth -1` → confirms all expected workspace packages are recognized: `@caseflow-ai/{web,api,worker,domain,contracts,ui,ai,integrations,config}`.
- `pnpm typecheck` (`tsc --build --pretty`) → **passed**, no errors, across all project references.
- `pnpm lint` (`eslint .`) → **passed**, no errors.
- `pnpm format:check` (`prettier --check .`) → **passed**, all matched files conform (after excluding the two preserved spec documents and fixing quote style in `pnpm-workspace.yaml`).
- Node version confirmed present: `v24.14.0` (satisfies "Node.js 24 LTS").
- `pnpm --version` resolves to `11.27.0` via the `packageManager` field (corepack-managed), confirming the pinned version is honored.

## 3. Not verified

- `pnpm build` — no script added; no package has real buildable output beyond placeholder `.ts` files, and adding a build pipeline (Next.js/NestJS compilation) is out of scope for 0A.
- `prisma validate` / `prisma format` — not run. The Prisma CLI is intentionally **not** added as a dependency yet, since it is not part of the 0A required baseline (Node/pnpm/TypeScript/workspaces only) and installing it now would be an unjustified dependency addition. The schema was reviewed manually for correct syntax (generator + datasource only, no models).
- CI workflow (`.github/workflows/ci.yml`) was authored but not executed (no GitHub Actions runner available locally); it mirrors the exact commands verified locally above.
- `corepack enable` failed with `EPERM` (no permission to write under `C:\Program Files\nodejs`) — non-blocking, since pnpm still resolves to the pinned `11.27.0` per-invocation via the `packageManager` field.

## 4. Relevant notes

- Root `package.json` needed `"type": "module"` so `eslint.config.js` could use ESM `import` syntax without tripping `no-undef`/`no-require-imports` under the TypeScript-ESLint recommended ruleset.
- `docs/CASEFLOW_AI_SPEC.md` and `AGENTS.md` were **not modified** by this task; they were excluded from Prettier's scope specifically to prevent any future `format`/`format:check` run from reformatting these two files, which must be preserved verbatim per the constraints.
- There were pre-existing staged modifications to `.gitignore`, `AGENTS.md`, and `docs/CASEFLOW_AI_SPEC.md` at the start of this task (visible via `git status`). These were left untouched — they predate this task and are not part of Foundation 0A's scope.
- No files were committed to git; all changes remain in the working tree for review.
- Per the task instructions, **Foundation 0B was not started**.
