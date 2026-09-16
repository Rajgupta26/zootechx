import type { Metadata } from 'next';
import Link from 'next/link';
import { ScrollText } from 'lucide-react';
import { prisma } from '@/lib/db';
import { requirePermission } from '@/lib/session';
import { scopeFilter } from '@/lib/rbac';
import { PageHeader } from '@/components/layout/app-shell';
import { Card, CardContent } from '@/components/ui/card';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { StatusBadge } from '@/components/ui/status-badge';
import { Pagination } from '@/components/ui/pagination';
import { EmptyState } from '@/components/ui/empty-state';
import { formatMoney } from '@/lib/billing/money';
import { formatDate, paginate, pageCount } from '@/lib/utils';

export const metadata: Metadata = { title: 'Statements of work' };

export default async function SowsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const user = await requirePermission('sow', 'read');
  const params = await searchParams;
  const { skip, take, page } = paginate(params.page);
  const where = scopeFilter(user, 'sow');

  const [sows, total] = await Promise.all([
    prisma.sow.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip,
      take,
      include: {
        client: { select: { name: true } },
        signature: { select: { signerName: true, signedAt: true } },
        _count: { select: { shareLinks: { where: { revokedAt: null } } } },
      },
    }),
    prisma.sow.count({ where }),
  ]);

  return (
    <>
      <PageHeader
        title="Statements of work"
        subtitle="Scope, milestones and e-signatures. Public links expire after 30 days and can be revoked."
      />

      <Card>
        <CardContent className="p-4">
          {sows.length === 0 ? (
            <EmptyState
              icon={ScrollText}
              title="No statements of work"
              description="Draft a SOW to define scope and capture a client signature."
            />
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Number</TableHead>
                    <TableHead>Title</TableHead>
                    <TableHead>Client</TableHead>
                    <TableHead className="text-right">Value</TableHead>
                    <TableHead>Signed</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sows.map((sow) => (
                    <TableRow key={sow.id}>
                      <TableCell data-label="Number">
                        <Link href={`/sows/${sow.id}`} className="font-medium hover:underline">
                          {sow.number}
                        </Link>
                      </TableCell>
                      <TableCell data-label="Title" className="max-w-[240px] truncate">
                        {sow.title}
                      </TableCell>
                      <TableCell data-label="Client" className="text-muted-foreground">
                        {sow.client.name}
                      </TableCell>
                      <TableCell data-label="Value" className="text-right font-medium tabular">
                        {formatMoney(sow.value.toString(), sow.currency)}
                      </TableCell>
                      <TableCell data-label="Signed" className="text-sm text-muted-foreground">
                        {sow.signature
                          ? `${sow.signature.signerName} · ${formatDate(sow.signature.signedAt)}`
                          : '—'}
                      </TableCell>
                      <TableCell data-label="Status">
                        <StatusBadge status={sow.status} />
                      </TableCell>
                    </TableRow>
                  ))}
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
