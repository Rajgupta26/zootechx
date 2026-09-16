import type { NextRequest } from 'next/server';
import { timingSafeEqual } from '@/lib/crypto';

/**
 * Cron endpoint authorisation.
 *
 * Schedulers call these routes over plain HTTP, so they are gated by a shared
 * secret rather than a session. Without CRON_SECRET the routes are open in
 * development and closed in production — never silently open in production.
 */
export function isCronAuthorised(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return process.env.NODE_ENV !== 'production';

  const header = req.headers.get('authorization') ?? '';
  return timingSafeEqual(header, `Bearer ${secret}`);
}
