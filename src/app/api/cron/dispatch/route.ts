import { NextResponse, type NextRequest } from 'next/server';
import { processOutboundQueue } from '@/lib/jobs/outbound';
import { isCronAuthorised } from '@/lib/jobs/cron-auth';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * Drains the outbound email/WhatsApp queue, retrying anything that failed.
 * Schedule every 2–5 minutes (Vercel Cron, a system crontab, or any scheduler).
 */
export async function GET(req: NextRequest) {
  if (!isCronAuthorised(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const result = await processOutboundQueue(50);
  return NextResponse.json({ ok: true, ...result });
}
