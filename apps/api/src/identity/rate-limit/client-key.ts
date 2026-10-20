import { createHmac } from 'node:crypto';
import { isIP } from 'node:net';

function expandIPv6(address: string): string[] {
  let text = address;
  const embedded = /(\d+\.\d+\.\d+\.\d+)$/.exec(text);
  if (embedded) {
    const [a = 0, b = 0, c = 0, d = 0] = embedded[1]!.split('.').map(Number);
    text = `${text.slice(0, -embedded[1]!.length)}${((a << 8) | b).toString(16)}:${((c << 8) | d).toString(16)}`;
  }
  const [head = '', rest] = text.split('::');
  const left = head ? head.split(':') : [];
  const right = rest ? rest.split(':') : [];
  const groups =
    rest === undefined
      ? left
      : [...left, ...Array(8 - left.length - right.length).fill('0'), ...right];
  return groups.map((group) => group.toLowerCase().padStart(4, '0'));
}

// The address a request is counted under. It is `req.ip`, which Express derives
// from the connection unless TRUSTED_PROXIES names the proxies whose
// X-Forwarded-For may be believed: a client cannot choose it.
// IPv4-mapped IPv6 addresses count as the IPv4 address, and an IPv6 address counts
// as its /64: a subscriber owns the whole /64 and could otherwise rotate through
// 2^64 addresses to dodge the limit.
export function clientAddressKey(ip: string | undefined): string {
  if (!ip) return 'unknown';
  let address = ip.trim().split('%')[0] ?? '';
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(address);
  if (mapped) address = mapped[1]!;
  const version = isIP(address);
  if (version === 4) return address;
  if (version === 6) return `${expandIPv6(address).slice(0, 4).join(':')}::/64`;
  return 'unknown';
}

// What identifies an account in a counter key: an HMAC of the normalised email,
// so neither the address of the account nor anything about the password is kept
// in the store, and keys cannot be matched to an email without the secret.
export function accountKey(email: string, secret: string): string {
  return createHmac('sha256', secret).update(email.trim().toLowerCase()).digest('hex').slice(0, 32);
}
