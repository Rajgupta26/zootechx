import { NextResponse, type NextRequest } from 'next/server';
import { runDailySweeps } from '@/lib/jobs/reminders';
import { runRecurringInvoices } from '@/lib/jobs/recurring';
import { processOutboundQueue } from '@/lib/jobs/outbound';
import { isCronAuthorised } from '@/lib/jobs/cron-auth';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/**
 * Daily housekeeping: overdue flags, dunning reminders, follow-up nudges and
 * recurring retainer invoices.
 *
 * It also drains the outbound queue, which is not its job but is the only
 * schedule a Vercel Hobby account allows — Hobby permits at most one run per
 * day per cron. Sending an invoice already delivers inline, so the queue only
 * holds messages whose first attempt failed; without this they would sit until
 * somebody sent something else. For prompt retries, schedule
 * /api/cron/dispatch every few minutes from anywhere that can run one —
 * see .github/workflows/dispatch-queue.yml.
 *
 * Runs last, so anything the recurring invoices just queued goes out in the
 * same invocation.
 */
export async function GET(req: NextRequest) {
  if (!isCronAuthorised(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const [sweeps, recurring] = await Promise.all([runDailySweeps(), runRecurringInvoices()]);
  const dispatched = await processOutboundQueue(100);

  return NextResponse.json({ ok: true, sweeps, recurring, dispatched });
}
