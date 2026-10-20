import { fileURLToPath } from 'node:url';
import type { NextConfig } from 'next';

// The desktop edition (DEC-117) ships a self-contained server; the web
// edition keeps the default output.
const desktop =
  process.env.CASEFLOW_DESKTOP_BUILD === '1' || process.env.CASEFLOW_STANDALONE === '1';

const nextConfig: NextConfig = {
  // with the repository's authoritative root AGENTS.md.
  agentRules: false,
  // @caseflow-ai/ui ships untranspiled TSX source; Next compiles it as part
  // of this app's own build instead of expecting a prebuilt dist.
  transpilePackages: ['@caseflow-ai/ui'],
  ...(desktop
    ? {
        output: 'standalone',
        // Trace from the monorepo root, so workspace packages are included;
        // the desktop build overrides it when building from a pnpm deploy.
        outputFileTracingRoot:
          process.env.CASEFLOW_TRACING_ROOT ?? fileURLToPath(new URL('../..', import.meta.url)),
      }
    : {}),
};

export default nextConfig;
