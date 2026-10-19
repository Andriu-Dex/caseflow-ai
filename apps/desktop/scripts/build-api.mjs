// Rebuild the deployable API without retaining files from an older installer.
import { execSync } from 'node:child_process';
import { existsSync, lstatSync, realpathSync, rmSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const desktop = resolve(fileURLToPath(new URL('..', import.meta.url)));
const target = join(desktop, 'build', 'api');
execSync('pnpm --filter @caseflow-ai/api run build', { cwd: desktop, stdio: 'inherit' });
if (existsSync(target)) {
  const allowedParent = realpathSync(dirname(target));
  if (
    allowedParent !== join(realpathSync(desktop), 'build') ||
    lstatSync(target).isSymbolicLink() ||
    !lstatSync(target).isDirectory() ||
    realpathSync(target) !== join(allowedParent, 'api')
  )
    throw new Error('Refusing to replace an API build outside the desktop build directory.');
  rmSync(target, { recursive: true, force: true });
}
try {
  execSync(
    `pnpm --filter @caseflow-ai/api deploy --prod --legacy --config.node-linker=hoisted "${target}"`,
    { cwd: desktop, stdio: 'inherit' },
  );
} finally {
  // Legacy deployment can temporarily change workspace module links.
  execSync('pnpm install --config.confirm-modules-purge=false', { cwd: desktop, stdio: 'inherit' });
}
