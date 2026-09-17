import type { Metadata } from 'next';
import Link from 'next/link';
import { CreditCard } from 'lucide-react';
import { prisma } from '@/lib/db';
import { requirePagePermission } from '@/lib/session';
import { scopeFilter } from '@/lib/rbac';
import { PageHeader } from '@/components/layout/app-shell';
import { Card, CardContent } from '@/components/ui/card';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { StatusBadge } from '@/components/ui/status-badge';
import { Pagination } from '@/components/ui/pagination';
import { EmptyState } from '@/components/ui/empty-state';
import { StatCard } from '@/components/dashboard/stat-card';
import { formatMoney } from '@/lib/billing/money';
import { formatDate, paginate, pageCount } from '@/lib/utils';

export const metadata: Metadata = { title: 'Payments' };

export default async function PaymentsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const user = await requirePagePermission('payment', 'read');
  const params = await searchParams;
  const { skip, take, page } = paginate(params.page);
  const where = scopeFilter(user, 'payment');

  const [payments, total, received, pending] = await Promise.all([
    prisma.payment.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip,
      take,
      include: {
        invoice: { select: { id: true, number: true, clientName: true } },
        recordedBy: { select: { name: true } },
      },
    }),
    prisma.payment.count({ where }),
    prisma.payment.aggregate({ where: { ...where, status: 'SUCCESS' }, _sum: { amount: true, tdsDeducted: true } }),
    prisma.payment.aggregate({ where: { ...where, status: 'PENDING' }, _sum: { amount: true } }),
  ]);

  return (
    <>
      <PageHeader
        title="Payments"
        subtitle="Receipts against invoices, including gateway confirmations and TDS deductions."
      />

      <div className="mb-5 grid gap-4 sm:grid-cols-3">
        <StatCard
          label="Received"
          value={formatMoney(Number(received._sum.amount ?? 0), 'INR', { compact: true })}
          icon={CreditCard}
          tone="success"
        />
        <StatCard
          label="TDS withheld"
          value={formatMoney(Number(received._sum.tdsDeducted ?? 0), 'INR', { compact: true })}
          icon={CreditCard}
          hint="Paid to government on our behalf"
        />
        <StatCard
          label="Awaiting"
          value={formatMoney(Number(pending._sum.amount ?? 0), 'INR', { compact: true })}
          icon={CreditCard}
          tone="warning"
        />
      </div>

      <Card>
        <CardContent className="p-4">
          {payments.length === 0 ? (
            <EmptyState
              icon={CreditCard}
              title="No payments yet"
              description="Payments appear here when recorded manually or confirmed by a gateway webhook."
            />
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Invoice</TableHead>
                    <TableHead>Client</TableHead>
                    <TableHead>Method</TableHead>
                    <TableHead>Reference</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {payments.map((p) => (
                    <TableRow key={p.id}>
                      <TableCell data-label="Invoice">
                        <Link href={`/invoices/${p.invoice.id}`} className="font-medium hover:underline">
                          {p.invoice.number}
                        </Link>
                      </TableCell>
                      <TableCell data-label="Client" className="max-w-[160px] truncate text-muted-foreground">
                        {p.invoice.clientName}
                      </TableCell>
                      <TableCell data-label="Method">{p.method.replace(/_/g, ' ')}</TableCell>
                      <TableCell data-label="Reference" className="max-w-[180px] truncate font-mono text-xs text-muted-foreground">
                        {p.gatewayPaymentId ?? p.reference ?? '—'}
                      </TableCell>
                      <TableCell data-label="Amount" className="text-right font-medium tabular">
                        {formatMoney(p.amount.toString(), p.currency)}
                        {Number(p.tdsDeducted) > 0 && (
                          <span className="block text-xs font-normal text-muted-foreground">
                            +{formatMoney(p.tdsDeducted.toString(), p.currency)} TDS
                          </span>
                        )}
                      </TableCell>
                      <TableCell data-label="Date" className="text-muted-foreground">
                        {formatDate(p.paidAt ?? p.createdAt)}
                      </TableCell>
                      <TableCell data-label="Status">
                        <StatusBadge status={p.status} />
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
