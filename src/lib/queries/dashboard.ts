import { prisma } from '@/lib/db';
import { fiscalYearFor } from '@/lib/billing/fiscal-year';
import { toMinor, toNumber } from '@/lib/billing/money';
import type { CurrentUser } from '@/lib/session';

/**
 * Dashboard aggregates.
 *
 * One query set per role, so each dashboard fetches only what it renders.
 * Money sums come back as Prisma Decimals and are converted through the paise
 * helpers rather than parseFloat.
 */

function sumDecimals(rows: Array<Record<string, unknown>>, field: string): number {
  return toNumber(rows.reduce((acc, row) => acc + toMinor(String(row[field] ?? '0')), 0n));
}

export async function getAdminDashboard() {
  const fy = fiscalYearFor();
  const now = new Date();

  const [
    invoiceAgg, paidAgg, overdue, outstandingRows, leadCounts,
    activeProjects, openIssues, overdueFollowUps, expenseAgg,
    recentInvoices, pipelineRows, monthlyRows,
  ] = await Promise.all([
    prisma.invoice.aggregate({
      where: { kind: 'TAX_INVOICE', issueDate: { gte: fy.start }, status: { not: 'CANCELLED' } },
      _sum: { total: true }, _count: true,
    }),
    prisma.invoice.aggregate({
      where: { kind: 'TAX_INVOICE', issueDate: { gte: fy.start }, status: { not: 'CANCELLED' } },
      _sum: { amountPaid: true },
    }),
    prisma.invoice.count({ where: { status: 'OVERDUE' } }),
    prisma.invoice.findMany({
      where: { status: { in: ['SENT', 'PARTIALLY_PAID', 'OVERDUE'] }, kind: 'TAX_INVOICE' },
      select: { balanceDue: true },
    }),
    prisma.lead.groupBy({ by: ['status'], where: { deletedAt: null }, _count: true }),
    prisma.project.count({ where: { status: { in: ['PLANNING', 'IN_PROGRESS', 'QA'] } } }),
    prisma.issue.count({ where: { status: { in: ['OPEN', 'TRIAGED', 'IN_PROGRESS'] } } }),
    prisma.followUp.count({ where: { status: 'PENDING', dueAt: { lt: now } } }),
    prisma.expense.aggregate({
      where: { expenseDate: { gte: fy.start }, status: { in: ['APPROVED', 'REIMBURSED'] } },
      _sum: { amount: true },
    }),
    prisma.invoice.findMany({
      where: { kind: 'TAX_INVOICE' },
      orderBy: { createdAt: 'desc' },
      take: 6,
      select: {
        id: true, number: true, clientName: true, total: true,
        currency: true, status: true, issueDate: true, dueDate: true,
      },
    }),
    prisma.lead.findMany({
      where: { deletedAt: null, status: { notIn: ['WON', 'LOST', 'DORMANT'] } },
      select: { estimatedValue: true },
    }),
    prisma.invoice.findMany({
      where: {
        kind: 'TAX_INVOICE',
        issueDate: { gte: new Date(now.getFullYear() - 1, now.getMonth(), 1) },
        status: { not: 'CANCELLED' },
      },
      select: { issueDate: true, total: true, amountPaid: true },
    }),
  ]);

  const leadsByStatus = Object.fromEntries(leadCounts.map((l) => [l.status, l._count]));
  const totalLeads = leadCounts.reduce((a, l) => a + l._count, 0);
  const won = leadsByStatus.WON ?? 0;

  // Roll invoices into the last 12 months for the chart.
  const buckets = new Map<string, { invoiced: bigint; collected: bigint }>();
  for (let i = 11; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    buckets.set(`${d.getFullYear()}-${d.getMonth()}`, { invoiced: 0n, collected: 0n });
  }
  for (const row of monthlyRows) {
    const bucket = buckets.get(`${row.issueDate.getFullYear()}-${row.issueDate.getMonth()}`);
    if (!bucket) continue;
    bucket.invoiced += toMinor(row.total.toString());
    bucket.collected += toMinor(row.amountPaid.toString());
  }

  const revenueSeries = [...buckets.entries()].map(([key, v]) => {
    const [year, month] = key.split('-').map(Number);
    return {
      month: new Date(year, month, 1).toLocaleDateString('en-IN', { month: 'short' }),
      invoiced: toNumber(v.invoiced),
      collected: toNumber(v.collected),
    };
  });

  return {
    fyLabel: fy.label,
    invoicedFy: Number(invoiceAgg._sum.total ?? 0),
    collectedFy: Number(paidAgg._sum.amountPaid ?? 0),
    invoiceCount: invoiceAgg._count,
    outstanding: sumDecimals(outstandingRows, 'balanceDue'),
    overdueCount: overdue,
    expensesFy: Number(expenseAgg._sum.amount ?? 0),
    totalLeads,
    leadsByStatus,
    conversionRate: totalLeads > 0 ? (won / totalLeads) * 100 : 0,
    pipelineValue: sumDecimals(pipelineRows, 'estimatedValue'),
    activeProjects,
    openIssues,
    overdueFollowUps,
    recentInvoices: recentInvoices.map((i) => ({ ...i, total: i.total.toString() })),
    revenueSeries,
  };
}

export async function getSalesDashboard(user: CurrentUser) {
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  const [byStatus, followUps, pipelineRows, wonThisMonth, recentLeads] = await Promise.all([
    prisma.lead.groupBy({
      by: ['status'],
      where: { ownerId: user.id, deletedAt: null },
      _count: true,
    }),
    prisma.followUp.findMany({
      where: { assigneeId: user.id, status: 'PENDING' },
      orderBy: { dueAt: 'asc' },
      take: 10,
      include: {
        lead: { select: { id: true, name: true, company: true } },
        client: { select: { id: true, name: true } },
      },
    }),
    prisma.lead.findMany({
      where: { ownerId: user.id, deletedAt: null, status: { notIn: ['WON', 'LOST', 'DORMANT'] } },
      select: { estimatedValue: true },
    }),
    prisma.lead.count({
      where: { ownerId: user.id, status: 'WON', convertedAt: { gte: startOfMonth } },
    }),
    prisma.lead.findMany({
      where: { ownerId: user.id, deletedAt: null },
      orderBy: { updatedAt: 'desc' },
      take: 8,
      select: {
        id: true, name: true, company: true, status: true,
        estimatedValue: true, currency: true, nextFollowUpAt: true,
      },
    }),
  ]);

  const counts = Object.fromEntries(byStatus.map((s) => [s.status, s._count]));
  const total = byStatus.reduce((a, s) => a + s._count, 0);

  return {
    total,
    counts,
    pipelineValue: sumDecimals(pipelineRows, 'estimatedValue'),
    overdueFollowUps: followUps.filter((f) => f.dueAt < now).length,
    followUps,
    wonThisMonth,
    conversionRate: total > 0 ? ((counts.WON ?? 0) / total) * 100 : 0,
    recentLeads: recentLeads.map((l) => ({
      ...l,
      estimatedValue: l.estimatedValue?.toString() ?? null,
    })),
  };
}

export async function getDeveloperDashboard(user: CurrentUser) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const [projects, openIssues, tasks, loggedToday, weekHours] = await Promise.all([
    prisma.project.findMany({
      where: { members: { some: { userId: user.id } }, status: { notIn: ['CLOSED', 'CANCELLED'] } },
      orderBy: { targetEndDate: 'asc' },
      include: {
        client: { select: { name: true } },
        _count: {
          select: {
            milestones: true,
            issues: { where: { status: { in: ['OPEN', 'TRIAGED', 'IN_PROGRESS'] } } },
          },
        },
      },
      take: 10,
    }),
    prisma.issue.count({
      where: { assigneeId: user.id, status: { in: ['OPEN', 'TRIAGED', 'IN_PROGRESS'] } },
    }),
    prisma.task.findMany({
      where: { assigneeId: user.id, status: { notIn: ['DONE', 'CANCELLED'] } },
      orderBy: [{ dueDate: 'asc' }],
      take: 10,
      include: { project: { select: { name: true } } },
    }),
    prisma.progressLog.findFirst({ where: { authorId: user.id, logDate: today } }),
    prisma.progressLog.aggregate({
      where: { authorId: user.id, logDate: { gte: new Date(today.getTime() - 7 * 86_400_000) } },
      _sum: { hoursSpent: true },
    }),
  ]);

  return {
    projects,
    openIssues,
    tasks,
    hasLoggedToday: Boolean(loggedToday),
    weekHours: Number(weekHours._sum.hoursSpent ?? 0),
    activeProjects: projects.length,
  };
}

export async function getMarketingDashboard() {
  const [campaigns, creativesPending, brands, syncedLeads] = await Promise.all([
    prisma.campaign.findMany({
      where: { status: { in: ['ACTIVE', 'PAUSED'] } },
      include: { brand: { select: { name: true } }, _count: { select: { leads: true } } },
      orderBy: { spend: 'desc' },
      take: 10,
    }),
    prisma.creative.count({ where: { status: 'PENDING_REVIEW' } }),
    prisma.brand.count(),
    prisma.lead.count({ where: { source: { in: ['META_ADS', 'GOOGLE_ADS', 'LINKEDIN'] } } }),
  ]);

  const totalSpend = sumDecimals(campaigns, 'spend');
  const totalRevenue = sumDecimals(campaigns, 'revenue');
  const totalBudget = sumDecimals(campaigns, 'budget');

  return {
    campaigns,
    creativesPending,
    brands,
    syncedLeads,
    totalSpend,
    totalRevenue,
    totalBudget,
    roas: totalSpend > 0 ? totalRevenue / totalSpend : 0,
    activeCampaigns: campaigns.filter((c) => c.status === 'ACTIVE').length,
  };
}
