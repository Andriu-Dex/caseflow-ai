// Builds the web app for the desktop edition (DEC-117) as a self-contained
// server in build/web, pointed at the desktop API. It is built inside a
// `pnpm deploy` with a flat node_modules, so the server ships real files
// instead of pnpm links, which would not survive installation elsewhere.
import { execSync } from 'node:child_process';
import { cpSync, existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const desktop = fileURLToPath(new URL('..', import.meta.url));
const source = `${desktop}build/web-src`;
const target = `${desktop}build/web`;
rmSync(source, { recursive: true, force: true });
rmSync(target, { recursive: true, force: true });
execSync('pnpm --filter @caseflow-ai/contracts run build', { stdio: 'inherit' });
execSync(
  `pnpm --filter @caseflow-ai/web deploy --legacy --config.node-linker=hoisted "${source}"`,
  { stdio: 'inherit', cwd: desktop },
);
// The deployed copy no longer sits two folders below the repository root:
// it gets its own copy of the shared compiler settings.
cpSync(
  fileURLToPath(new URL('../../../tsconfig.base.json', import.meta.url)),
  `${source}/tsconfig.base.json`,
);
const tsconfig = `${source}/tsconfig.json`;
writeFileSync(
  tsconfig,
  readFileSync(tsconfig, 'utf8').replace('../../tsconfig.base.json', './tsconfig.base.json'),
);
execSync('npx next build', {
  stdio: 'inherit',
  cwd: source,
  env: {
    ...process.env,
    CASEFLOW_DESKTOP_BUILD: '1',
    CASEFLOW_TRACING_ROOT: source,
    NEXT_PUBLIC_API_URL: 'http://127.0.0.1:4801',
  },
});
cpSync(`${source}/.next/standalone`, target, { recursive: true });
// Next does not copy the static assets into the standalone server itself.
cpSync(`${source}/.next/static`, `${target}/.next/static`, { recursive: true });
if (existsSync(`${source}/public`))
  cpSync(`${source}/public`, `${target}/public`, { recursive: true });
