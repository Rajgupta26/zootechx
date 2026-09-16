import { prisma } from '@/lib/db';
import { createQuickInvoice } from '@/lib/billing/invoice-service';
import { approveAndSendInvoice } from '@/lib/billing/dispatch';
import { notify } from '@/lib/notifications';

/**
 * Recurring (retainer) invoice generation.
 *
 * Schedules with nextRunAt in the past are processed one at a time; each
 * advances its own cursor so a mid-batch failure doesn't skip or double-bill
 * the rest.
 */

function advance(
  from: Date,
  interval: 'WEEKLY' | 'MONTHLY' | 'QUARTERLY' | 'YEARLY',
  dayOfMonth: number
): Date {
  const next = new Date(from);
  switch (interval) {
    case 'WEEKLY':
      next.setDate(next.getDate() + 7);
      return next;
    case 'MONTHLY':
      next.setMonth(next.getMonth() + 1);
      break;
    case 'QUARTERLY':
      next.setMonth(next.getMonth() + 3);
      break;
    case 'YEARLY':
      next.setFullYear(next.getFullYear() + 1);
      break;
  }
  // dayOfMonth is capped at 28 by the schema so this never rolls into the
  // next month on a short February.
  next.setDate(dayOfMonth);
  return next;
}

export async function runRecurringInvoices(): Promise<{
  generated: number;
  sent: number;
  errors: string[];
}> {
  const due = await prisma.recurringInvoice.findMany({
    where: {
      isActive: true,
      nextRunAt: { lte: new Date() },
      OR: [{ endDate: null }, { endDate: { gte: new Date() } }],
    },
    include: { client: { select: { id: true, name: true } } },
    take: 50,
  });

  let generated = 0;
  let sent = 0;
  const errors: string[] = [];

  const systemActor = {
    id: 'system',
    email: 'system@xcc',
    role: 'SUPER_ADMIN' as const,
  };

  for (const schedule of due) {
    try {
      const { invoice } = await createQuickInvoice(
        {
          clientId: schedule.clientId,
          amount: schedule.amount.toString(),
          currency: schedule.currency,
          description: schedule.title,
          sacCode: schedule.sacCode ?? undefined,
          notes: schedule.notes ?? undefined,
          recurringId: schedule.id,
        },
        // System-generated invoices carry no user id, so the audit trail shows
        // them as automated rather than attributed to whoever set the schedule.
        { ...systemActor, id: undefined as unknown as string }
      );
      generated += 1;

      if (schedule.autoSend) {
        await approveAndSendInvoice(invoice.id, systemActor, { deliverNow: false });
        sent += 1;
      } else {
        await prisma.invoice.update({
          where: { id: invoice.id },
          data: { status: 'PENDING_APPROVAL' },
        });
        await notify({
          type: 'SYSTEM',
          title: `Retainer invoice ready for approval`,
          body: `${invoice.number} for ${schedule.client.name} was generated and is waiting for approval.`,
          linkUrl: `/invoices/${invoice.id}`,
          roles: ['SUPER_ADMIN', 'SUB_ADMIN'],
        });
      }

      await prisma.recurringInvoice.update({
        where: { id: schedule.id },
        data: {
          lastRunAt: new Date(),
          nextRunAt: advance(schedule.nextRunAt, schedule.interval, schedule.dayOfMonth),
        },
      });
    } catch (err) {
      errors.push(`${schedule.title}: ${(err as Error).message}`);
    }
  }

  return { generated, sent, errors };
}
