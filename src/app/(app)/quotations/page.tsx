import type { Metadata } from 'next';
import Link from 'next/link';
import { FileText } from 'lucide-react';
import { prisma } from '@/lib/db';
import { requirePermission } from '@/lib/session';
import { PageHeader } from '@/components/layout/app-shell';
import { Card, CardContent } from '@/components/ui/card';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { StatusBadge } from '@/components/ui/status-badge';
import { EmptyState } from '@/components/ui/empty-state';
import { Pagination } from '@/components/ui/pagination';
import { formatMoney } from '@/lib/billing/money';
import { formatDate, paginate, pageCount } from '@/lib/utils';

export const metadata: Metadata = { title: 'Quotations' };

export default async function QuotationsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  await requirePermission('quotation', 'read');
  const params = await searchParams;
  const { skip, take, page } = paginate(params.page);

  const [quotations, total] = await Promise.all([
    prisma.quotation.findMany({
      orderBy: { createdAt: 'desc' },
      skip,
      take,
      include: {
        client: { select: { id: true, name: true } },
        lead: { select: { id: true, name: true, company: true } },
        createdBy: { select: { name: true } },
      },
    }),
    prisma.quotation.count(),
  ]);

  return (
    <>
      <PageHeader
        title="Quotations"
        subtitle="Pre-sales pricing. An accepted quotation becomes the basis for a statement of work."
      />

      <Card>
        <CardContent className="p-4">
          {quotations.length === 0 ? (
            <EmptyState
              icon={FileText}
              title="No quotations"
              description="Draft a quotation from a qualified lead to put pricing in front of the client."
            />
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Number</TableHead>
                    <TableHead>Title</TableHead>
                    <TableHead>For</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                    <TableHead>Valid until</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {quotations.map((q) => (
                    <TableRow key={q.id}>
                      <TableCell data-label="Number" className="font-medium">{q.number}</TableCell>
                      <TableCell data-label="Title" className="max-w-[240px] truncate">{q.title}</TableCell>
                      <TableCell data-label="For" className="text-muted-foreground">
                        {q.client ? (
                          <Link href={`/clients/${q.client.id}`} className="hover:underline">
                            {q.client.name}
                          </Link>
                        ) : q.lead ? (
                          <Link href={`/leads/${q.lead.id}`} className="hover:underline">
                            {q.lead.company ?? q.lead.name}
                          </Link>
                        ) : (
                          '—'
                        )}
                      </TableCell>
                      <TableCell data-label="Total" className="text-right font-medium tabular">
                        {formatMoney(q.total.toString(), q.currency)}
                      </TableCell>
                      <TableCell data-label="Valid until" className="text-muted-foreground">
                        {q.validUntil ? formatDate(q.validUntil) : '—'}
                      </TableCell>
                      <TableCell data-label="Status">
                        <StatusBadge status={q.status} />
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
