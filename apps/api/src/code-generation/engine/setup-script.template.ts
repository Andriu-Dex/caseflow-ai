// `scripts/setup.mjs` of the generated project: the first run in one command.
// Written without template literals so it can live in this string untouched; the
// helpers it exports are what the generator's tests exercise.
export const SETUP_SCRIPT = String.raw`// Prepara el proyecto para usarlo por primera vez: crea .env con secretos propios,
// inicia la base de datos en Docker y aplica las migraciones.
//
//   pnpm run setup            primera vez, o para reparar lo que falte
//   pnpm run setup -- --reset borra la base de datos local y la crea de nuevo
import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import net from 'node:net';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const COMPOSE = ['compose', '--env-file', '.env', '-f', 'docker/docker-compose.yml'];
const FIRST_DATABASE_PORT = 5433;

// A secret the project makes up for itself (not one that belongs to another service).
const OWN_SECRET = /(^|_)(SECRET|PASSWORD|SALT)($|_)/;

export function isOwnSecret(name) {
  return OWN_SECRET.test(name);
}

// An own secret that is empty or still the example value is replaced by a random one.
export function needsGeneration(name, value) {
  return isOwnSecret(name) && (value === '' || value.startsWith('dev-only-'));
}

// Builds the contents of .env from .env.example: random secrets, the chosen
// database port and a DATABASE_URL that agrees with both. Variables that only the
// person can know are left as they are and reported in "pending".
export function buildEnv(example, { port, makeSecret = () => randomBytes(24).toString('hex') }) {
  const values = {};
  const generated = [];
  const lines = example.split(/\r?\n/).map((line) => {
    const match = /^([A-Z][A-Z0-9_]*)=(.*)$/.exec(line);
    if (!match) return { line };
    const [, name, raw] = match;
    let value = raw;
    if (name === 'POSTGRES_PORT') value = String(port);
    else if (needsGeneration(name, raw)) {
      value = makeSecret();
      generated.push(name);
    }
    values[name] = value;
    return { name, value };
  });
  if ('DATABASE_URL' in values && 'POSTGRES_USER' in values) {
    values.DATABASE_URL =
      'postgresql://' +
      encodeURIComponent(values.POSTGRES_USER) + ':' +
      encodeURIComponent(values.POSTGRES_PASSWORD ?? '') + '@127.0.0.1:' +
      values.POSTGRES_PORT + '/' + encodeURIComponent(values.POSTGRES_DB ?? 'app');
  }
  const text = lines
    .map((entry) => (entry.name ? entry.name + '=' + values[entry.name] : entry.line))
    .join('\n');
  const pending = Object.entries(values)
    .filter(([, value]) => value === '' || value.startsWith('replace-with-'))
    .map(([name]) => name);
  return { text, generated, pending, values };
}

export function canListen(port) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once('error', () => resolve(false));
    server.once('listening', () => server.close(() => resolve(true)));
    server.listen(port, '127.0.0.1');
  });
}

// The first free port from the usual one: another PostgreSQL on the machine is
// the most common reason for the database not to start.
export async function findFreePort(start, isFree = canListen, tries = 20) {
  for (let port = start; port < start + tries; port++) if (await isFree(port)) return port;
  throw new Error('No hay un puerto libre entre el ' + start + ' y el ' + (start + tries - 1) + '.');
}

// What to tell the person about the failures this script has seen.
export function explainFailure(output) {
  const hints = [];
  if (/P1000|[Aa]uthentication failed/.test(output))
    hints.push(
      'La base de datos rechazó el usuario o la contraseña. Suele pasar cuando queda una base de ' +
        'datos anterior de este proyecto con otra contraseña, o cuando otro programa usa ese puerto.\n' +
        '  Para empezar de cero (borra los datos locales de este proyecto): pnpm run setup -- --reset',
    );
  if (/port is already allocated|address already in use|Ports are not available/i.test(output))
    hints.push(
      'El puerto de la base de datos está ocupado. Cambie POSTGRES_PORT (y el puerto de DATABASE_URL) ' +
        'en .env por otro libre, o borre .env y ejecute de nuevo pnpm run setup.',
    );
  if (/Cannot connect to the Docker daemon|error during connect|docker daemon/i.test(output))
    hints.push('Docker no está en ejecución. Abra Docker Desktop, espere a que diga que está activo y repita.');
  if (/unknown flag: --wait|unknown shorthand flag/i.test(output))
    hints.push('Su versión de Docker Compose es antigua: actualice Docker Desktop.');
  return hints;
}

function say(message) {
  process.stdout.write(message + '\n');
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { cwd: ROOT, encoding: 'utf8', ...options });
  const output = (result.stdout ?? '') + (result.stderr ?? '');
  return { ok: result.status === 0 && !result.error, output };
}

// pnpm may be a .cmd on Windows: use the one that started this script when there is one.
function pnpm(args) {
  if (process.env.npm_execpath) return run(process.execPath, [process.env.npm_execpath, ...args]);
  return run('pnpm', args, { shell: process.platform === 'win32' });
}

function fail(title, output, hints = explainFailure(output)) {
  say('');
  say('No se pudo continuar: ' + title);
  if (output.trim()) say(output.trim().split('\n').slice(-12).join('\n'));
  for (const hint of hints) say('\n  > ' + hint);
  process.exit(1);
}

export async function main(argv = process.argv.slice(2)) {
  const reset = argv.includes('--reset');

  say('1/4  Comprobando Docker...');
  if (!run('docker', ['--version']).ok)
    fail('Docker no está instalado.', '', ['Instale Docker Desktop (https://www.docker.com/products/docker-desktop/), ábralo y repita.']);
  const info = run('docker', ['info']);
  if (!info.ok)
    fail('Docker está instalado pero no está en ejecución.', '', [
      'Abra Docker Desktop, espere a que diga que está activo y ejecute de nuevo: pnpm run setup',
    ]);

  say('2/4  Preparando el archivo .env...');
  const envPath = join(ROOT, '.env');
  let created = false;
  if (!existsSync(envPath)) {
    const port = await findFreePort(FIRST_DATABASE_PORT);
    const built = buildEnv(readFileSync(join(ROOT, '.env.example'), 'utf8'), { port });
    writeFileSync(envPath, built.text + '\n');
    created = true;
    say('     Se creó .env con secretos generados y la base de datos en el puerto ' + port + '.');
    if (built.pending.length)
      say('     Complete estas variables en .env antes de usar toda la aplicación: ' + built.pending.join(', ') + '.');
  } else {
    say('     Se conservó el .env que ya existía.');
  }

  if (reset) {
    say('     --reset: se borra la base de datos local de este proyecto.');
    run('docker', [...COMPOSE, 'down', '-v']);
  }

  say('3/4  Iniciando la base de datos (puede tardar un minuto la primera vez)...');
  const up = run('docker', [...COMPOSE, 'up', '-d', '--wait']);
  if (!up.ok) fail('la base de datos no arrancó.', up.output);

  say('4/4  Creando las tablas...');
  const hasMigrations = existsSync(join(ROOT, 'prisma', 'migrations'));
  const migrate = pnpm(['--filter', './apps/api', 'run', hasMigrations ? 'db:deploy' : 'db:migrate']);
  if (!migrate.ok) fail('no se pudieron crear las tablas.', migrate.output);

  say('');
  say('Listo' + (created ? ': el proyecto está preparado.' : '.'));
  say('Para arrancarlo:   pnpm run dev');
  say('Luego abra:        http://localhost:3000');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => fail(error instanceof Error ? error.message : String(error), '', []));
}
`;
