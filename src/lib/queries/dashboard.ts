import { Prisma } from '@prisma/client';
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

// ============================================================
// DEPARTMENT PANELS (Super Admin / Sub Admin)
// ============================================================

/**
 * Per-person workload for each department, for the admin dashboard.
 *
 * Aggregations are done with groupBy and then stitched in memory rather than
 * one query per person, so adding staff does not add queries.
 *
 * Each department also reports work that falls outside its own team — leads
 * owned by a non-sales user, projects with nobody assigned. Without that, work
 * can sit unnoticed simply because it is held by the wrong person.
 */
export async function getDepartmentPanels() {
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const weekAgo = new Date(now.getTime() - 7 * 86_400_000);
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Typed as Prisma filters rather than `as const`: Prisma expects mutable
  // arrays, and a readonly tuple will not satisfy it.
  const OPEN_LEAD: Prisma.EnumLeadStatusFilter = { notIn: ['WON', 'LOST', 'DORMANT'] };
  const LIVE_PROJECT: Prisma.EnumProjectStatusFilter = { notIn: ['CLOSED', 'CANCELLED'] };
  const OPEN_ISSUE: Prisma.EnumIssueStatusFilter = { in: ['OPEN', 'TRIAGED', 'IN_PROGRESS'] };

  const [sales, developers, marketers] = await Promise.all([
    prisma.user.findMany({
      where: { role: 'SALES', deletedAt: null, status: 'ACTIVE' },
      select: { id: true, name: true }, orderBy: { name: 'asc' },
    }),
    prisma.user.findMany({
      where: { role: 'DEVELOPER', deletedAt: null, status: 'ACTIVE' },
      select: { id: true, name: true }, orderBy: { name: 'asc' },
    }),
    prisma.user.findMany({
      where: { role: 'MARKETING', deletedAt: null, status: 'ACTIVE' },
      select: { id: true, name: true }, orderBy: { name: 'asc' },
    }),
  ]);

  const salesIds = sales.map((u) => u.id);
  const devIds = developers.map((u) => u.id);

  const [
    openLeads, pipeline, overdueFollowUps, wonThisMonth, strayLeads,
    memberships, openIssues, weekHours, loggedToday, unstaffedProjects,
    campaigns, pendingCreatives, brands,
  ] = await Promise.all([
    prisma.lead.groupBy({
      by: ['ownerId'], where: { deletedAt: null, status: OPEN_LEAD }, _count: true,
    }),
    prisma.lead.findMany({
      where: { deletedAt: null, status: OPEN_LEAD },
      select: { ownerId: true, estimatedValue: true },
    }),
    prisma.followUp.groupBy({
      by: ['assigneeId'], where: { status: 'PENDING', dueAt: { lt: now } }, _count: true,
    }),
    prisma.lead.groupBy({
      by: ['ownerId'], where: { status: 'WON', convertedAt: { gte: startOfMonth } }, _count: true,
    }),
    // Open leads held by someone who is not on the sales team, or nobody.
    prisma.lead.count({
      where: {
        deletedAt: null, status: OPEN_LEAD,
        OR: [{ ownerId: null }, { ownerId: { notIn: salesIds.length ? salesIds : ['__none__'] } }],
      },
    }),
    prisma.projectMember.findMany({
      where: { project: { status: LIVE_PROJECT } },
      select: { userId: true, project: { select: { name: true, progressPct: true } } },
    }),
    prisma.issue.groupBy({
      by: ['assigneeId'], where: { status: OPEN_ISSUE }, _count: true,
    }),
    prisma.progressLog.groupBy({
      by: ['authorId'], where: { logDate: { gte: weekAgo } }, _sum: { hoursSpent: true },
    }),
    prisma.progressLog.findMany({
      where: { logDate: today }, select: { authorId: true },
    }),
    prisma.project.count({
      where: {
        status: LIVE_PROJECT,
        OR: [{ members: { none: {} } }, { members: { none: { userId: { in: devIds.length ? devIds : ['__none__'] } } } }],
      },
    }),
    prisma.campaign.findMany({
      where: { status: { in: ['ACTIVE', 'PAUSED'] } },
      select: {
        status: true, spend: true, budget: true, revenue: true,
        brand: { select: { ownerId: true } },
        _count: { select: { leads: true } },
      },
    }),
    prisma.creative.groupBy({
      by: ['brandId'], where: { status: 'PENDING_REVIEW' }, _count: true,
    }),
    prisma.brand.findMany({ select: { id: true, ownerId: true } }),
  ]);

  const count = (rows: Array<{ _count: number }>, key: string, id: string) =>
    rows.find((r) => (r as unknown as Record<string, unknown>)[key] === id)?._count ?? 0;

  const salesRows = sales.map((u) => {
    const value = pipeline
      .filter((l) => l.ownerId === u.id)
      .reduce((acc, l) => acc + toMinor(l.estimatedValue?.toString() ?? '0'), 0n);
    return {
      id: u.id,
      name: u.name,
      openLeads: count(openLeads, 'ownerId', u.id),
      pipelineValue: toNumber(value),
      overdue: count(overdueFollowUps, 'assigneeId', u.id),
      wonThisMonth: count(wonThisMonth, 'ownerId', u.id),
    };
  });

  const todayAuthors = new Set(loggedToday.map((l) => l.authorId));
  const devRows = developers.map((u) => {
    const mine = memberships.filter((m) => m.userId === u.id);
    return {
      id: u.id,
      name: u.name,
      projects: mine.length,
      projectNames: mine.map((m) => m.project.name),
      avgProgress: mine.length
        ? Math.round(mine.reduce((a, m) => a + m.project.progressPct, 0) / mine.length)
        : 0,
      openIssues: count(openIssues, 'assigneeId', u.id),
      weekHours: Number(weekHours.find((h) => h.authorId === u.id)?._sum.hoursSpent ?? 0),
      loggedToday: todayAuthors.has(u.id),
    };
  });

  const brandOwner = new Map(brands.map((b) => [b.id, b.ownerId]));
  const marketingRows = marketers.map((u) => {
    const mine = campaigns.filter((c) => c.brand.ownerId === u.id);
    const spend = mine.reduce((a, c) => a + toMinor(c.spend.toString()), 0n);
    const budget = mine.reduce((a, c) => a + toMinor(c.budget.toString()), 0n);
    const revenue = mine.reduce((a, c) => a + toMinor(c.revenue.toString()), 0n);
    const pending = pendingCreatives
      .filter((c) => brandOwner.get(c.brandId) === u.id)
      .reduce((a, c) => a + c._count, 0);

    return {
      id: u.id,
      name: u.name,
      activeCampaigns: mine.filter((c) => c.status === 'ACTIVE').length,
      totalCampaigns: mine.length,
      spend: toNumber(spend),
      budget: toNumber(budget),
      roas: spend > 0n ? toNumber(revenue) / toNumber(spend) : 0,
      leads: mine.reduce((a, c) => a + c._count.leads, 0),
      pendingCreatives: pending,
    };
  });

  return {
    sales: { rows: salesRows, strayLeads },
    software: { rows: devRows, unstaffedProjects },
    marketing: { rows: marketingRows },
  };
}
