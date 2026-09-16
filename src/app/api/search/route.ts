import { NextResponse, type NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { getCurrentUser } from '@/lib/session';
import { can, scopeFilter } from '@/lib/rbac';

export const dynamic = 'force-dynamic';

/**
 * Global search.
 *
 * Each entity is only queried when the caller holds read permission for it,
 * and every query carries the role's scope filter — so a sales user's search
 * cannot surface another rep's leads or the credentials vault.
 */
export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const q = req.nextUrl.searchParams.get('q')?.trim() ?? '';
  if (q.length < 2) return NextResponse.json({ results: [] });

  const contains = { contains: q, mode: 'insensitive' as const };
  const results: Array<{
    id: string; type: string; title: string; subtitle?: string; href: string;
  }> = [];

  const tasks: Promise<void>[] = [];

  if (can(user, 'lead', 'read')) {
    tasks.push(
      prisma.lead
        .findMany({
          where: {
            deletedAt: null,
            ...scopeFilter(user, 'lead'),
            OR: [{ name: contains }, { company: contains }, { email: contains }],
          },
          take: 5,
          select: { id: true, name: true, company: true, status: true },
        })
        .then((rows) => {
          rows.forEach((r) =>
            results.push({
              id: r.id,
              type: 'lead',
              title: r.name,
              subtitle: [r.company, r.status.replace(/_/g, ' ').toLowerCase()].filter(Boolean).join(' · '),
              href: `/leads/${r.id}`,
            })
          );
        })
    );
  }

  if (can(user, 'client', 'read')) {
    tasks.push(
      prisma.client
        .findMany({
          where: { deletedAt: null, OR: [{ name: contains }, { legalName: contains }, { email: contains }] },
          take: 5,
          select: { id: true, name: true, email: true },
        })
        .then((rows) => {
          rows.forEach((r) =>
            results.push({ id: r.id, type: 'client', title: r.name, subtitle: r.email, href: `/clients/${r.id}` })
          );
        })
    );
  }

  if (can(user, 'invoice', 'read')) {
    tasks.push(
      prisma.invoice
        .findMany({
          where: {
            ...scopeFilter(user, 'invoice'),
            OR: [{ number: contains }, { clientName: contains }],
          },
          take: 5,
          orderBy: { issueDate: 'desc' },
          select: { id: true, number: true, clientName: true, total: true, currency: true, status: true },
        })
        .then((rows) => {
          rows.forEach((r) =>
            results.push({
              id: r.id,
              type: 'invoice',
              title: r.number,
              subtitle: `${r.clientName} · ${r.currency} ${r.total} · ${r.status.toLowerCase()}`,
              href: `/invoices/${r.id}`,
            })
          );
        })
    );
  }

  if (can(user, 'project', 'read')) {
    tasks.push(
      prisma.project
        .findMany({
          where: { ...scopeFilter(user, 'project'), OR: [{ name: contains }, { code: contains }] },
          take: 5,
          select: { id: true, name: true, code: true, status: true },
        })
        .then((rows) => {
          rows.forEach((r) =>
            results.push({
              id: r.id,
              type: 'project',
              title: r.name,
              subtitle: `${r.code} · ${r.status.replace(/_/g, ' ').toLowerCase()}`,
              href: `/projects/${r.id}`,
            })
          );
        })
    );
  }

  if (can(user, 'sow', 'read')) {
    tasks.push(
      prisma.sow
        .findMany({
          where: { ...scopeFilter(user, 'sow'), OR: [{ number: contains }, { title: contains }] },
          take: 4,
          select: { id: true, number: true, title: true, status: true },
        })
        .then((rows) => {
          rows.forEach((r) =>
            results.push({
              id: r.id,
              type: 'sow',
              title: r.number,
              subtitle: `${r.title} · ${r.status.toLowerCase()}`,
              href: `/sows/${r.id}`,
            })
          );
        })
    );
  }

  if (can(user, 'credential', 'read')) {
    tasks.push(
      prisma.credential
        .findMany({
          // Names and categories only — secret material is never searchable.
          where: { deletedAt: null, OR: [{ name: contains }, { category: contains }] },
          take: 4,
          select: { id: true, name: true, category: true, environment: true },
        })
        .then((rows) => {
          rows.forEach((r) =>
            results.push({
              id: r.id,
              type: 'credential',
              title: r.name,
              subtitle: `${r.category} · ${r.environment}`,
              href: `/vault?highlight=${r.id}`,
            })
          );
        })
    );
  }

  await Promise.all(tasks);

  return NextResponse.json({ results: results.slice(0, 20) });
}
