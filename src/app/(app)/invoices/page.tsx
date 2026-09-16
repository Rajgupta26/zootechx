import type { Metadata } from 'next';
import Link from 'next/link';
import { Receipt } from 'lucide-react';
import { prisma } from '@/lib/db';
import { requirePermission } from '@/lib/session';
import { scopeFilter } from '@/lib/rbac';
import { PageHeader } from '@/components/layout/app-shell';
import { Card, CardContent } from '@/components/ui/card';
import {
  Table, TableBody, TableCell, TableEmpty, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { StatusBadge } from '@/components/ui/status-badge';
import { Pagination } from '@/components/ui/pagination';
import { EmptyState } from '@/components/ui/empty-state';
import { StatCard } from '@/components/dashboard/stat-card';
import { formatMoney, toMinor, toNumber } from '@/lib/billing/money';
import { formatDate, paginate, pageCount, PAGE_SIZE } from '@/lib/utils';
import { InvoiceFilters } from './filters';
import { NewInvoiceButton } from './new-invoice-button';
import type { InvoiceStatus, Prisma } from '@prisma/client';

export const metadata: Metadata = { title: 'Invoices' };

const STATUSES: InvoiceStatus[] = [
  'DRAFT', 'PENDING_APPROVAL', 'SENT', 'PARTIALLY_PAID', 'PAID', 'OVERDUE', 'CANCELLED',
];

export default async function InvoicesPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; status?: string; q?: string; kind?: string }>;
}) {
  const user = await requirePermission('invoice', 'read');
  const params = await searchParams;
  const { skip, take, page } = paginate(params.page);

  const where: Prisma.InvoiceWhereInput = {
    ...scopeFilter(user, 'invoice'),
    ...(params.status && STATUSES.includes(params.status as InvoiceStatus)
      ? { status: params.status as InvoiceStatus }
      : {}),
    ...(params.kind === 'credit' ? { kind: 'CREDIT_NOTE' } : { kind: 'TAX_INVOICE' }),
    ...(params.q
      ? {
          OR: [
            { number: { contains: params.q, mode: 'insensitive' } },
            { clientName: { contains: params.q, mode: 'insensitive' } },
          ],
        }
      : {}),
  };

  // Totals are computed over the filtered set, not the current page.
  const [invoices, total, outstandingRows, paidAgg] = await Promise.all([
    prisma.invoice.findMany({
      where,
      orderBy: { issueDate: 'desc' },
      skip,
      take,
      select: {
        id: true, number: true, clientName: true, currency: true,
        total: true, balanceDue: true, status: true,
        issueDate: true, dueDate: true, kind: true,
      },
    }),
    prisma.invoice.count({ where }),
    prisma.invoice.findMany({
      where: { ...where, status: { in: ['SENT', 'PARTIALLY_PAID', 'OVERDUE'] } },
      select: { balanceDue: true },
    }),
    prisma.invoice.aggregate({ where, _sum: { total: true, amountPaid: true } }),
  ]);

  const outstanding = toNumber(
    outstandingRows.reduce((acc, r) => acc + toMinor(r.balanceDue.toString()), 0n)
  );

  return (
    <>
      <PageHeader
        title="Invoices"
        subtitle="GST-compliant invoices with automatic numbering, tax split and payment links."
        action={<NewInvoiceButton />}
      />

      <div className="mb-5 grid gap-4 sm:grid-cols-3">
        <StatCard
          label="Total invoiced"
          value={formatMoney(Number(paidAgg._sum.total ?? 0), 'INR', { compact: true })}
          icon={Receipt}
          hint={`${total} invoices`}
        />
        <StatCard
          label="Collected"
          value={formatMoney(Number(paidAgg._sum.amountPaid ?? 0), 'INR', { compact: true })}
          icon={Receipt}
          tone="success"
        />
        <StatCard
          label="Outstanding"
          value={formatMoney(outstanding, 'INR', { compact: true })}
          icon={Receipt}
          tone={outstanding > 0 ? 'warning' : 'default'}
        />
      </div>

      <Card>
        <CardContent className="p-4">
          <InvoiceFilters />

          {invoices.length === 0 ? (
            <EmptyState
              icon={Receipt}
              title="No invoices found"
              description={
                params.q || params.status
                  ? 'Try clearing the filters.'
                  : 'Raise your first invoice with the quick-invoice button — client and amount is all it needs.'
              }
              action={!params.q && !params.status ? <NewInvoiceButton /> : undefined}
            />
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Number</TableHead>
                    <TableHead>Client</TableHead>
                    <TableHead>Issued</TableHead>
                    <TableHead>Due</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                    <TableHead className="text-right">Balance</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {invoices.length === 0 ? (
                    <TableEmpty colSpan={7}>No invoices match these filters.</TableEmpty>
                  ) : (
                    invoices.map((inv) => (
                      <TableRow key={inv.id} className="cursor-pointer">
                        <TableCell data-label="Number">
                          <Link href={`/invoices/${inv.id}`} className="font-medium hover:underline">
                            {inv.number}
                          </Link>
                        </TableCell>
                        <TableCell data-label="Client" className="max-w-[200px] truncate">
                          {inv.clientName}
                        </TableCell>
                        <TableCell data-label="Issued" className="text-muted-foreground">
                          {formatDate(inv.issueDate)}
                        </TableCell>
                        <TableCell data-label="Due" className="text-muted-foreground">
                          {formatDate(inv.dueDate)}
                        </TableCell>
                        <TableCell data-label="Total" className="text-right font-medium tabular">
                          {formatMoney(inv.total.toString(), inv.currency)}
                        </TableCell>
                        <TableCell data-label="Balance" className="text-right tabular">
                          {Number(inv.balanceDue) > 0
                            ? formatMoney(inv.balanceDue.toString(), inv.currency)
                            : '—'}
                        </TableCell>
                        <TableCell data-label="Status">
                          <StatusBadge status={inv.status} />
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>

              <Pagination
                page={page}
                pageCount={pageCount(total)}
                total={total}
                pageSize={PAGE_SIZE}
              />
            </>
          )}
        </CardContent>
      </Card>
    </>
  );
}
