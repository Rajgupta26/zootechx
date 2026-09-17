import type { Metadata } from 'next';
import Link from 'next/link';
import { Users } from 'lucide-react';
import { prisma } from '@/lib/db';
import { requirePermission } from '@/lib/session';
import { scopeFilter, can } from '@/lib/rbac';
import { PageHeader } from '@/components/layout/app-shell';
import { Card, CardContent } from '@/components/ui/card';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { StatusBadge } from '@/components/ui/status-badge';
import { Badge } from '@/components/ui/badge';
import { Pagination } from '@/components/ui/pagination';
import { EmptyState } from '@/components/ui/empty-state';
import { formatMoney } from '@/lib/billing/money';
import { relativeTime, paginate, pageCount } from '@/lib/utils';
import { LeadFilters } from './filters';
import { NewLeadDialog } from './new-lead';
import type { LeadStatus, Prisma } from '@prisma/client';

export const metadata: Metadata = { title: 'Leads' };

const STATUSES: LeadStatus[] = [
  'NEW', 'CONTACTED', 'QUALIFIED', 'PROPOSAL_SENT', 'NEGOTIATION', 'WON', 'LOST', 'DORMANT',
];

export default async function LeadsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; status?: string; q?: string; new?: string }>;
}) {
  const user = await requirePermission('lead', 'read');
  const params = await searchParams;
  const { skip, take, page } = paginate(params.page);

  const where: Prisma.LeadWhereInput = {
    deletedAt: null,
    ...scopeFilter(user, 'lead'),
    ...(params.status && STATUSES.includes(params.status as LeadStatus)
      ? { status: params.status as LeadStatus }
      : {}),
    ...(params.q
      ? {
          OR: [
            { name: { contains: params.q, mode: 'insensitive' } },
            { company: { contains: params.q, mode: 'insensitive' } },
            { email: { contains: params.q, mode: 'insensitive' } },
          ],
        }
      : {}),
  };

  const [leads, total, owners] = await Promise.all([
    prisma.lead.findMany({
      where,
      orderBy: [{ updatedAt: 'desc' }],
      skip,
      take,
      include: { owner: { select: { name: true } } },
    }),
    prisma.lead.count({ where }),
    can(user, 'lead', 'assign')
      ? prisma.user.findMany({
          where: { role: { in: ['SALES', 'SUB_ADMIN', 'SUPER_ADMIN'] }, status: 'ACTIVE' },
          select: { id: true, name: true },
          orderBy: { name: 'asc' },
        })
      : Promise.resolve([]),
  ]);

  return (
    <>
      <PageHeader
        title="Leads"
        subtitle={
          user.role === 'SALES'
            ? 'Your pipeline. Duplicate email or phone numbers are caught on creation.'
            : 'Every lead across the team, with owner and stage.'
        }
        action={
          can(user, 'lead', 'create')
            ? <NewLeadDialog owners={owners} autoOpen={params.new === '1'} />
            : undefined
        }
      />

      <Card>
        <CardContent className="p-4">
          <LeadFilters />

          {leads.length === 0 ? (
            <EmptyState
              icon={Users}
              title="No leads found"
              description={
                params.q || params.status
                  ? 'Try clearing the filters.'
                  : 'Add your first lead to start tracking the pipeline.'
              }
            />
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Company</TableHead>
                    <TableHead>Source</TableHead>
                    <TableHead>Owner</TableHead>
                    <TableHead className="text-right">Value</TableHead>
                    <TableHead>Next follow-up</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {leads.map((lead) => {
                    const overdue = lead.nextFollowUpAt && lead.nextFollowUpAt < new Date();
                    return (
                      <TableRow key={lead.id}>
                        <TableCell data-label="Name">
                          <Link href={`/leads/${lead.id}`} className="font-medium hover:underline">
                            {lead.name}
                          </Link>
                          {lead.email && (
                            <p className="truncate text-xs text-muted-foreground">{lead.email}</p>
                          )}
                        </TableCell>
                        <TableCell data-label="Company" className="max-w-[160px] truncate">
                          {lead.company ?? '—'}
                        </TableCell>
                        <TableCell data-label="Source">
                          <Badge variant="muted">{lead.source.replace(/_/g, ' ')}</Badge>
                        </TableCell>
                        <TableCell data-label="Owner" className="text-muted-foreground">
                          {lead.owner?.name ?? 'Unassigned'}
                        </TableCell>
                        <TableCell data-label="Value" className="text-right tabular">
                          {lead.estimatedValue
                            ? formatMoney(lead.estimatedValue.toString(), lead.currency, { compact: true })
                            : '—'}
                        </TableCell>
                        <TableCell data-label="Next follow-up">
                          {lead.nextFollowUpAt ? (
                            <span className={overdue ? 'text-sm font-medium text-destructive' : 'text-sm text-muted-foreground'}>
                              {relativeTime(lead.nextFollowUpAt)}
                            </span>
                          ) : (
                            <span className="text-sm text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell data-label="Status">
                          <StatusBadge status={lead.status} />
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>

              <Pagination page={page} pageCount={pageCount(total)} total={total} />
            </>
          )}
        </CardContent>
      </Card>
    </>
  );
}
