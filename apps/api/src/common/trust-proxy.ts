// TRUSTED_PROXIES: which proxies in front of the API may be believed when they
// say who the client is (X-Forwarded-For). Unset (the default) trusts none, and
// the client address is the one of the connection: nobody can pick it with a header.
// Accepts what Express accepts for `trust proxy`: a number of hops (`1`), preset
// names (`loopback`) and a comma-separated list of addresses or CIDR ranges.
export function trustProxySetting(value: string | undefined): string | number | undefined {
  const text = value?.trim();
  if (!text || text.toLowerCase() === 'false') return undefined;
  if (text.toLowerCase() === 'true')
    throw new Error(
      'TRUSTED_PROXIES=true would believe every X-Forwarded-For header; list the proxies instead.',
    );
  return /^\d+$/.test(text) ? Number(text) : text;
}
