import { NextResponse, type NextRequest } from 'next/server';
import { runDailySweeps } from '@/lib/jobs/reminders';
import { runRecurringInvoices } from '@/lib/jobs/recurring';
import { isCronAuthorised } from '@/lib/jobs/cron-auth';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/**
 * Daily housekeeping: overdue flags, dunning reminders, follow-up nudges and
 * recurring retainer invoices. Schedule once a day, early morning IST.
 */
export async function GET(req: NextRequest) {
  if (!isCronAuthorised(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const [sweeps, recurring] = await Promise.all([runDailySweeps(), runRecurringInvoices()]);

  return NextResponse.json({ ok: true, sweeps, recurring });
}
