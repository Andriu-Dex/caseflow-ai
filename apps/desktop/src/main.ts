import { spawn, type ChildProcess } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import type { Server } from 'node:http';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  safeStorage,
  shell,
  type IpcMainInvokeEvent,
} from 'electron';
import { ChatGPTConnection, encryptedFileStore, startBroker } from './chatgpt-connection.js';
import { startDatabase, type DesktopDatabase } from './database.js';
import {
  PORTS,
  apiEnvironment,
  hasConfiguredAIProvider,
  isAppUrl,
  isExternalHttpsUrl,
} from './settings.js';

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
  preload: join(desktopDir, 'dist', 'preload.cjs'),
};

const children = new Set<ChildProcess>();
let database: DesktopDatabase | null = null;
let api: ChildProcess | null = null;
let broker: { url: string; secret: string; server: Server } | null = null;
let chatgpt: ChatGPTConnection | null = null;

// Electron's own Node runs the API and the web server: no separate install.
function startNode(script: string, env: Record<string, string>): ChildProcess {
  const child = spawn(process.execPath, [script], {
    cwd: dirname(script),
    env: { ...process.env, ...env, ELECTRON_RUN_AS_NODE: '1' },
    stdio: 'inherit',
    windowsHide: true,
  });
  children.add(child);
  child.on('exit', () => children.delete(child));
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

// (Re)starts the API with the AI provider the user chose.
async function startApi(): Promise<void> {
  if (api) {
    const stopping = api;
    await new Promise<void>((resolveExit) => {
      stopping.once('exit', () => resolveExit());
      stopping.kill();
    });
  }
  const model = (await chatgpt?.isActive()) ? await chatgpt!.model() : null;
  api = startNode(
    paths.api,
    await apiEnvironment(
      app.getPath('userData'),
      database!.url,
      model && broker ? { model, brokerUrl: broker.url, brokerSecret: broker.secret } : null,
    ),
  );
  await waitFor(`http://127.0.0.1:${PORTS.api}/health/live`);
}

// The web page may call these, and only the app's own page.
function handle<T>(channel: string, action: (...args: string[]) => Promise<T>): void {
  ipcMain.handle(channel, async (event: IpcMainInvokeEvent, ...args: unknown[]) => {
    if (!isAppUrl(event.senderFrame?.url ?? '')) throw new Error('Origen no permitido.');
    if (!chatgpt)
      throw new Error('El almacenamiento seguro del sistema no está disponible en este equipo.');
    try {
      return await action(...args.map(String));
    } catch (error) {
      // Only the message crosses to the page, never a stack or a credential.
      // Electron passes only the message to the page, never the cause.
      throw new Error(error instanceof Error ? error.message : 'No se pudo completar la acción.', {
        cause: error,
      });
    }
  });
}

function registerChatGPTBridge(): void {
  const dataDir = app.getPath('userData');
  handle('chatgpt:status', async () => ({
    ...(await chatgpt!.status()),
    configuredProvider: await hasConfiguredAIProvider(dataDir),
  }));
  handle('chatgpt:connect', () => chatgpt!.connect());
  handle('chatgpt:disconnect', () => chatgpt!.disconnect());
  handle('chatgpt:models', () => chatgpt!.models());
  handle('chatgpt:select-model', (slug) => chatgpt!.selectModel(slug!));
  handle('chatgpt:resume', () => chatgpt!.resume());
  handle('chatgpt:prefer', (value) => chatgpt!.prefer(value === 'true'));
}

async function start(): Promise<void> {
  const dataDir = app.getPath('userData');
  await mkdir(dataDir, { recursive: true });
  database = await startDatabase({
    dataDir: join(dataDir, 'database'),
    migrationsDir: paths.migrations,
    port: PORTS.database,
  });
  // Without the OS secure storage the ChatGPT plan is not offered at all:
  // credentials are never written unencrypted.
  if (safeStorage.isEncryptionAvailable()) {
    chatgpt = new ChatGPTConnection(
      encryptedFileStore(join(dataDir, 'chatgpt.bin'), {
        encrypt: (plain) => safeStorage.encryptString(plain),
        decrypt: (data) => safeStorage.decryptString(data),
      }),
      (url) => shell.openExternal(url),
      startApi,
    );
    broker = await startBroker(chatgpt, PORTS.broker);
  }
  registerChatGPTBridge();
  await startApi();
  startNode(paths.web, { PORT: String(PORTS.web), HOSTNAME: '127.0.0.1' });
  await waitFor(`http://127.0.0.1:${PORTS.web}/login`);

  const window = new BrowserWindow({
    width: 1400,
    height: 900,
    title: 'CASEFlow AI',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      preload: paths.preload,
    },
  });
  // Links to other sites (documentation, Docker downloads) open in the browser.
  window.webContents.setWindowOpenHandler(({ url }) => {
    if (isExternalHttpsUrl(url)) void shell.openExternal(url);
    return { action: 'deny' };
  });
  window.webContents.on('will-navigate', (event, url) => {
    if (!isAppUrl(url)) {
      event.preventDefault();
      if (isExternalHttpsUrl(url)) void shell.openExternal(url);
    }
  });
  await window.loadURL(`http://127.0.0.1:${PORTS.web}`);
}

async function stop(): Promise<void> {
  for (const child of children) child.kill();
  children.clear();
  api = null;
  broker?.server.close();
  broker = null;
  await database?.stop();
  database = null;
}

// One instance per user: two would share the same database files.
if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on('second-instance', () => BrowserWindow.getAllWindows()[0]?.focus());
  app.on('window-all-closed', () => app.quit());
  app.on('will-quit', (event) => {
    if (!database && !children.size) return;
    event.preventDefault();
    void stop().finally(() => app.quit());
  });
  void app.whenReady().then(() =>
    start().catch((error: unknown) => {
      dialog.showErrorBox(
        'CASEFlow AI no pudo iniciar',
        `${error instanceof Error ? error.message : String(error)}\n\nRevise que los puertos ${PORTS.web}, ${PORTS.api}, ${PORTS.database} y ${PORTS.broker} estén libres.`,
      );
      void stop().finally(() => app.exit(1));
    }),
  );
}
