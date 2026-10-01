import { describe, expect, it } from 'vitest';
import {
  DockerSandboxExecutionProvider,
  type SandboxCommand,
  type SandboxExecutionRequest,
} from './sandbox-execution-provider';

// Real Docker contract checks (AGENTS.md §44): opt-in with
// CASEFLOW_SANDBOX_DOCKER_TESTS=1, never part of ordinary CI.
const enabled = process.env.CASEFLOW_SANDBOX_DOCKER_TESTS === '1';
const BIG = 'lockfile line\n'.repeat(20_000);

const node = (stage: string, script: string): SandboxCommand => ({
  stage,
  argv: ['node', '-e', script],
  network: false,
});

const run = (commands: SandboxCommand[], timeoutMs = 60_000) => {
  const request: SandboxExecutionRequest = {
    files: [
      { path: 'src/hello.txt', content: 'hola' },
      { path: 'big.txt', content: BIG },
    ],
    commands,
    allowedCommands: commands.map((c) => c.argv),
    toolchain: { nodeMajor: 24, packageManager: 'pnpm@11.27.0' },
    limits: { timeoutMs, memoryMb: 512, cpus: 1, pids: 128 },
    collect: ['src/hello.txt', 'big.txt'],
  };
  return new DockerSandboxExecutionProvider().execute(request);
};

describe.skipIf(!enabled)('DockerSandboxExecutionProvider (real Docker)', () => {
  it('sees the workspace but none of the CASEFlow environment', async () => {
    process.env.INTERNAL_JOBS_SECRET ??= 'caseflow-test-secret-value';
    const result = await run([
      node(
        'ENV',
        "const fs=require('fs');console.log(fs.readFileSync('src/hello.txt','utf8'));console.log(JSON.stringify(Object.keys(process.env)));console.log(process.getuid())",
      ),
    ]);
    const [stage] = result.stages;
    expect(stage).toMatchObject({ exitCode: 0, timedOut: false });
    expect(stage!.output).toContain('hola');
    expect(stage!.output).not.toMatch(/INTERNAL_JOBS_SECRET|DATABASE_URL|JWT/);
    expect(stage!.output.trim().split('\n').at(-1)).not.toBe('0'); // not root
    expect(result.collected['src/hello.txt']).toBe('hola');
    // Read-back files are whole, never cut like logs.
    expect(result.collected['big.txt']).toBe(BIG);
  }, 600_000);

  it('has no network outside installation', async () => {
    const result = await run([
      node(
        'NET',
        "fetch('https://registry.npmjs.org/').then(()=>process.exit(0),()=>process.exit(3))",
      ),
    ]);
    expect(result.stages[0]!.exitCode).toBe(3);
  }, 120_000);

  it('kills a stage that exceeds its timeout', async () => {
    const result = await run([node('SLOW', 'setTimeout(()=>{},120000)')], 3_000);
    expect(result.stages[0]).toMatchObject({ timedOut: true });
  }, 120_000);
});
