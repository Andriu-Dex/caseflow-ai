import { spawn, type ChildProcess } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { app, BrowserWindow, dialog, shell } from 'electron';
import { startDatabase, type DesktopDatabase } from './database.js';
import { PORTS, apiEnvironment } from './settings.js';

// CASEFlow AI desktop edition (DEC-117, DEC-120): the same API and web app,
// on loopback only, over a local PGlite database and an in-process queue.
// Generated code still runs only inside Docker (§174).

// Packaged: everything sits in the app's resources folder. From the
// repository: the monorepo root, and the web server from build/web.
const desktopDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const root = app.isPackaged ? process.resourcesPath : resolve(desktopDir, '../..');
const paths = {
  migrations: join(root, 'prisma', 'migrations'),
  api: join(root, 'apps', 'api', 'dist', 'main.js'),
  web: app.isPackaged
    ? join(root, 'apps', 'web', 'server.js')
    : join(desktopDir, 'build', 'web', 'server.js'),
};

const children: ChildProcess[] = [];
let database: DesktopDatabase | null = null;

// Electron's own Node runs the API and the web server: no separate install.
function startNode(script: string, env: Record<string, string>): ChildProcess {
  const child = spawn(process.execPath, [script], {
    cwd: dirname(script),
    env: { ...process.env, ...env, ELECTRON_RUN_AS_NODE: '1' },
    stdio: 'inherit',
    windowsHide: true,
  });
  children.push(child);
  return child;
}

async function waitFor(url: string, timeoutMs = 90_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      if ((await fetch(url)).ok) return;
    } catch {
      // Not listening yet.
    }
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 500));
  }
  throw new Error(`${url} no respondió a tiempo.`);
}

async function start(): Promise<void> {
  const dataDir = app.getPath('userData');
  await mkdir(dataDir, { recursive: true });
  database = await startDatabase({
    dataDir: join(dataDir, 'database'),
    migrationsDir: paths.migrations,
    port: PORTS.database,
  });
  startNode(paths.api, await apiEnvironment(dataDir, database.url));
  startNode(paths.web, { PORT: String(PORTS.web), HOSTNAME: '127.0.0.1' });
  await waitFor(`http://127.0.0.1:${PORTS.api}/health/live`);
  await waitFor(`http://127.0.0.1:${PORTS.web}/login`);

  const window = new BrowserWindow({
    width: 1400,
    height: 900,
    title: 'CASEFlow AI',
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true },
  });
  // Links to other sites (documentation, Docker downloads) open in the browser.
  window.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://')) void shell.openExternal(url);
    return { action: 'deny' };
  });
  window.webContents.on('will-navigate', (event, url) => {
    if (!url.startsWith(`http://127.0.0.1:${PORTS.web}`)) {
      event.preventDefault();
      if (url.startsWith('https://')) void shell.openExternal(url);
    }
  });
  await window.loadURL(`http://127.0.0.1:${PORTS.web}`);
}

async function stop(): Promise<void> {
  for (const child of children) child.kill();
  await database?.stop();
  database = null;
}

// One instance per user: two would share the same database files.
if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on('second-instance', () => BrowserWindow.getAllWindows()[0]?.focus());
  app.on('window-all-closed', () => app.quit());
  app.on('will-quit', (event) => {
    if (!database && !children.length) return;
    event.preventDefault();
    void stop().finally(() => {
      children.length = 0;
      app.quit();
    });
  });
  void app.whenReady().then(() =>
    start().catch((error: unknown) => {
      dialog.showErrorBox(
        'CASEFlow AI no pudo iniciar',
        `${error instanceof Error ? error.message : String(error)}\n\nRevise que los puertos ${PORTS.web}, ${PORTS.api} y ${PORTS.database} estén libres.`,
      );
      void stop().finally(() => app.exit(1));
    }),
  );
}
