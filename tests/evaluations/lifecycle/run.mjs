import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';

const directory = dirname(fileURLToPath(import.meta.url));
const root = resolve(directory, '../../..');
const require = createRequire(resolve(root, 'apps/api/package.json'));
const { implementationPlanContentSchema } = require('@caseflow-ai/contracts');
const { CASEFLOW_WEB_TS_V2: template } = require('@caseflow-ai/domain');
const {
  DockerSandboxExecutionProvider,
  DockerRuntimeCaptureProvider,
} = require('@caseflow-ai/integrations');
const { generateProject } = require(
  resolve(root, 'apps/api/dist/code-generation/engine/project-generator.js'),
);
const { e2eScreens } = require(
  resolve(root, 'apps/api/dist/code-generation/engine/frontend.templates.js'),
);
const { OPERATION_SCOPE_RUNTIME } = require(
  resolve(root, 'apps/api/dist/code-generation/engine/operation-scope.templates.js'),
);

function docker(args, timeoutMs, signal) {
  return new Promise((accept, reject) => {
    const child = spawn('docker', args, {
      windowsHide: true,
      signal,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let output = '';
    const append = (chunk) => {
      output = (output + chunk).slice(-20000);
    };
    child.stdout.on('data', append);
    child.stderr.on('data', append);
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error('Docker evaluation timed out.'));
    }, timeoutMs);
    child.on('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (code === 0) accept(output);
      else reject(new Error(output));
    });
  });
}

async function main() {
  const plan = implementationPlanContentSchema.parse(
    JSON.parse(
      await readFile(resolve(root, 'tests/fixtures/construction/lifecycle-plan.json'), 'utf8'),
    ),
  );
  const files = generateProject({
    plan,
    template,
    projectName: 'Revision registry',
    slug: 'revision-registry',
  });
  const sourceHash = createHash('sha256')
    .update(JSON.stringify(files.map(({ path, content }) => ({ path, content }))))
    .digest('hex');
  const commands = template.validationCommands.map((command) => ({
    ...command,
    network: command.stage === 'INSTALL',
  }));
  const validation = await new DockerSandboxExecutionProvider().execute({
    files,
    commands,
    allowedCommands: template.validationCommands.map((command) => command.argv),
    toolchain: { nodeMajor: 24, packageManager: template.toolchain.packageManager },
    limits: { timeoutMs: 600000, memoryMb: 4096, cpus: 2, pids: 512 },
    collect: ['pnpm-lock.yaml'],
    onStageStart: (stage) => console.log('VALIDATING', stage),
  });
  for (const stage of validation.stages) {
    console.log(stage.stage, stage.exitCode, stage.durationMs);
    if (stage.exitCode !== 0 || stage.timedOut) throw new Error(stage.output);
  }
  if (validation.stages.length !== 5) throw new Error('Missing required validation stages.');
  files.push({ path: 'pnpm-lock.yaml', content: validation.collected['pnpm-lock.yaml'] });
  files.push({
    path: 'tests/evaluations/lifecycle/runtime.mjs',
    content: await readFile(resolve(directory, 'runtime.mjs'), 'utf8'),
  });
  files.push({
    path: 'apps/api/src/auth/lifecycle-scope-evaluation.ts',
    content: OPERATION_SCOPE_RUNTIME,
  });
  files.push({
    path: 'apps/api/src/auth/scope-configuration.ts',
    content: `export const SCOPE_CONFIGURATION = ${JSON.stringify({
      scopeModel: 'Revision',
      accountModel: 'Account',
      sessionModel: 'Session',
      authorizationModels: [],
      unrestrictedRoles: ['ADMIN'],
      entities: {
        Revision: {
          delegate: 'revision',
          table: 'revisions',
          collection: '/revisions',
          internalFields: [],
          relations: {},
          policy: { paths: [['id']], includeUnscoped: false },
        },
      },
    })};`,
  });
  let app;
  let proof;
  const runner = async (args, timeout, signal) => {
    const name = args[args.indexOf('--name') + 1];
    if (args.includes('--name') && name.endsWith('-web')) app = name;
    if (args[0] === 'create' && args.includes('--name') && name.endsWith('-browser')) {
      proof = await docker(
        ['exec', app, 'node', 'tests/evaluations/lifecycle/runtime.mjs'],
        60000,
        signal,
      );
      console.log(proof);
    }
    return docker(args, timeout, signal);
  };
  const captures = await new DockerRuntimeCaptureProvider(runner).capture({
    files,
    targets: [
      { routePath: '/revisions', role: 'EDITOR' },
      { routePath: '/revisions/new', role: 'EDITOR' },
    ],
  });
  const e2e = await new DockerRuntimeCaptureProvider().runE2E({
    files,
    roles: e2eScreens(plan).map((screen) => screen.role),
  });
  console.log('E2E', e2e.passed, e2e.durationMs);
  console.log(e2e.output.slice(-4000));
  if (!proof?.includes('"status":"PASSED"'))
    throw new Error('Missing PostgreSQL validation evidence.');
  const report = {
    templateVersion: template.version,
    sourceHash,
    stages: validation.stages.map(({ stage, exitCode, durationMs, timedOut }) => ({
      stage,
      exitCode,
      durationMs,
      timedOut,
    })),
    postgres: JSON.parse(proof.trim().split('\n').at(-1)),
    e2e: { passed: e2e.passed, durationMs: e2e.durationMs },
    captures: captures.map(({ png, ...metadata }) => ({
      ...metadata,
      imageBytes: png?.length ?? 0,
    })),
  };
  const output = resolve(tmpdir(), 'caseflow-lifecycle-evaluation.json');
  await writeFile(output, JSON.stringify(report, null, 2));
  console.log('REPORT', output);
  if (captures.some((capture) => capture.status !== 'CAPTURED'))
    throw new Error('The evaluated screens failed runtime capture.');
  if (!e2e.passed) throw new Error('The generated end-to-end tests failed.');
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
