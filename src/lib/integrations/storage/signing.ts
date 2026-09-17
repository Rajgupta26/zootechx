import crypto from 'node:crypto';

/**
 * HMAC for share links to stored objects.
 *
 * The secret has no fallback on purpose. It used to read
 * `process.env.AUTH_SECRET ?? 'dev-secret'`, and that constant is in the
 * repository: any deployment that came up without AUTH_SECRET would have
 * accepted signatures anybody could compute. Failing to boot is the correct
 * outcome — a signing secret that silently degrades to a public string is
 * worse than an outage.
 */
function secret(): string {
  const value = process.env.AUTH_SECRET;
  if (!value || value.trim().length < 16) {
    throw new Error(
      'AUTH_SECRET is not set, or is too short, and share links are signed with it. ' +
        'Generate one with: openssl rand -base64 32'
    );
  }
  return value;
}

export function signObjectKey(key: string, expires: number): string {
  return crypto.createHmac('sha256', secret()).update(`${key}:${expires}`).digest('hex');
}

/** Constant-time compare, and an expiry that has not passed. */
export function verifyObjectSignature(key: string, expires: string | null, sig: string | null): boolean {
  if (!expires || !sig) return false;
  const expiry = Number(expires);
  if (!Number.isFinite(expiry) || expiry <= Date.now()) return false;

  const expected = Buffer.from(signObjectKey(key, expiry));
  const given = Buffer.from(sig);
  return expected.length === given.length && crypto.timingSafeEqual(expected, given);
}
