// Launches the desktop edition from the repository. A terminal inside VS Code
// (itself Electron) exports ELECTRON_RUN_AS_NODE=1, which would make Electron
// behave as plain Node, so it is removed for this launch only.
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';

const electron = createRequire(import.meta.url)('electron');
const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;
spawn(electron, ['.'], { stdio: 'inherit', env }).on('exit', (code) => process.exit(code ?? 0));
