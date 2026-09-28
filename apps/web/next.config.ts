import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // with the repository's authoritative root AGENTS.md.
  agentRules: false,
  // @caseflow-ai/ui ships untranspiled TSX source; Next compiles it as part
  // of this app's own build instead of expecting a prebuilt dist.
  transpilePackages: ['@caseflow-ai/ui'],
};

export default nextConfig;
