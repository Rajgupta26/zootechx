import { prisma } from '@/lib/db';
import { notify } from '@/lib/notifications';
import { markOverdueInvoices } from '@/lib/billing/invoice-service';
import { queueEmail } from './outbound';
import { formatMoney } from '@/lib/billing/money';

/**
 * Daily operational sweeps: overdue invoices, dunning emails, overdue
 * follow-ups, and expiring share links.
 */

export async function runDailySweeps() {
  const overdueCount = await markOverdueInvoices();
  const [dunning, followUps, expired] = await Promise.all([
    sendOverdueReminders(),
    notifyOverdueFollowUps(),
    expireShareLinks(),
  ]);

  return { overdueCount, dunning, followUps, expiredLinks: expired };
}

/**
 * Dunning schedule: a reminder at 1, 7, 14 and 30 days past due.
 * Anchoring on exact day counts stops a daily cron from mailing the client
 * every single morning.
 */
const DUNNING_DAYS = [1, 7, 14, 30];

async function sendOverdueReminders(): Promise<number> {
  const invoices = await prisma.invoice.findMany({
    where: { status: 'OVERDUE', kind: 'TAX_INVOICE', balanceDue: { gt: 0 } },
    select: {
      id: true, number: true, clientName: true, clientEmail: true,
      balanceDue: true, currency: true, dueDate: true, paymentLinkUrl: true,
    },
    take: 100,
  });

  let queued = 0;

  for (const inv of invoices) {
    const daysPastDue = Math.floor((Date.now() - inv.dueDate.getTime()) / 86_400_000);
    if (!DUNNING_DAYS.includes(daysPastDue) || !inv.clientEmail) continue;

    const amount = formatMoney(inv.balanceDue.toString(), inv.currency);
    await queueEmail({
      to: inv.clientEmail,
      subject: `Reminder: invoice ${inv.number} is ${daysPastDue} day${daysPastDue === 1 ? '' : 's'} overdue`,
      html: `
        <p>Hi ${inv.clientName},</p>
        <p>Invoice <strong>${inv.number}</strong> for <strong>${amount}</strong> was due on
        ${inv.dueDate.toLocaleDateString('en-IN')} and is still showing as unpaid.</p>
        ${inv.paymentLinkUrl ? `<p><a href="${inv.paymentLinkUrl}">Pay now</a></p>` : ''}
        <p>If payment is already on its way, please ignore this note.</p>`,
      invoiceId: inv.id,
      entity: 'invoice',
      entityId: inv.id,
    });
    queued += 1;
  }

  return queued;
}

async function notifyOverdueFollowUps(): Promise<number> {
  const overdue = await prisma.followUp.findMany({
    where: { status: 'PENDING', dueAt: { lt: new Date() }, assigneeId: { not: null } },
    select: {
      id: true, subject: true, assigneeId: true, dueAt: true,
      lead: { select: { id: true, name: true } },
    },
    take: 200,
  });

  // Group by assignee so one person gets one notification, not twenty.
  const byUser = new Map<string, typeof overdue>();
  for (const f of overdue) {
    if (!f.assigneeId) continue;
    byUser.set(f.assigneeId, [...(byUser.get(f.assigneeId) ?? []), f]);
  }

  for (const [userId, items] of byUser) {
    await notify({
      type: 'FOLLOWUP_OVERDUE',
      title: `${items.length} overdue follow-up${items.length === 1 ? '' : 's'}`,
      body: items
        .slice(0, 3)
        .map((i) => i.subject)
        .join(', ') + (items.length > 3 ? `, +${items.length - 3} more` : ''),
      linkUrl: '/follow-ups',
      alsoUserIds: [userId],
    });
  }

  return byUser.size;
}

/** SOW and invoice links auto-expire; mark them so the public page 410s. */
async function expireShareLinks(): Promise<number> {
  const result = await prisma.sow.updateMany({
    where: {
      status: { in: ['SENT', 'VIEWED'] },
      shareLinks: { every: { expiresAt: { lt: new Date() } } },
    },
    data: { status: 'EXPIRED' },
  });
  return result.count;
}
