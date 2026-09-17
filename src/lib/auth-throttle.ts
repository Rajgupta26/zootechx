/**
 * Sign-in throttling.
 *
 * Nothing limited how often a password could be tried, and bcrypt at cost 12
 * only makes each guess expensive for the server as well as the attacker — it
 * is not a rate limit.
 *
 * Counted per email, not per IP: the address is the thing being attacked, and
 * an attacker rotating IPs is the normal case while a shared office NAT is
 * also normal. A legitimate person who has genuinely forgotten their password
 * is the one this inconveniences, which is the intended trade.
 *
 * In-memory, so it holds for one server process. That is the right scope for a
 * single-instance deployment and the wrong one behind several replicas; move
 * the map to Redis before scaling out, or the window is per-replica.
 */

const MAX_ATTEMPTS = 8;
const WINDOW_MS = 15 * 60_000;
const LOCKOUT_MS = 15 * 60_000;

interface Entry {
  failures: number;
  first: number;
  lockedUntil?: number;
}

const attempts = new Map<string, Entry>();

/** Drop entries nobody has touched, so the map cannot grow without bound. */
function sweep(now: number): void {
  if (attempts.size < 5000) return;
  for (const [key, entry] of attempts) {
    if (now - entry.first > WINDOW_MS && (entry.lockedUntil ?? 0) < now) {
      attempts.delete(key);
    }
  }
}

export function lockoutRemainingMs(email: string): number {
  const entry = attempts.get(email.toLowerCase().trim());
  if (!entry?.lockedUntil) return 0;
  const left = entry.lockedUntil - Date.now();
  return left > 0 ? left : 0;
}

export function recordFailure(email: string): void {
  const key = email.toLowerCase().trim();
  const now = Date.now();
  sweep(now);

  const entry = attempts.get(key);
  if (!entry || now - entry.first > WINDOW_MS) {
    attempts.set(key, { failures: 1, first: now });
    return;
  }

  entry.failures += 1;
  if (entry.failures >= MAX_ATTEMPTS) {
    entry.lockedUntil = now + LOCKOUT_MS;
    entry.failures = 0;
    entry.first = now;
  }
}

export function clearFailures(email: string): void {
  attempts.delete(email.toLowerCase().trim());
}

/** Exposed for tests; there is no other reason to reach in. */
export function __resetThrottle(): void {
  attempts.clear();
}

export const THROTTLE = { MAX_ATTEMPTS, WINDOW_MS, LOCKOUT_MS } as const;
