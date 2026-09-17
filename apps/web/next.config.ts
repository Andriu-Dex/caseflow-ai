import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Avoid generating a local AGENTS.md/CLAUDE.md that could be confused
  // with the repository's authoritative root AGENTS.md.
  agentRules: false,
};

export default nextConfig;
