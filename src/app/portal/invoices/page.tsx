import type { Metadata } from 'next';
import { Download, ExternalLink, Receipt } from 'lucide-react';
import { prisma } from '@/lib/db';
import { requireAuth } from '@/lib/session';
import { Card, CardContent } from '@/components/ui/card';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { StatusBadge } from '@/components/ui/status-badge';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { Pagination } from '@/components/ui/pagination';
import { formatMoney } from '@/lib/billing/money';
import { formatDate, paginate, pageCount } from '@/lib/utils';

export const metadata: Metadata = { title: 'Invoices' };

export default async function PortalInvoices({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const user = await requireAuth();
  const params = await searchParams;
  const { skip, take, page } = paginate(params.page);

  // clientId scoping is the hard boundary — a portal user sees only their own.
  const where = { clientId: user.clientId!, status: { not: 'DRAFT' as const } };

  const [invoices, total] = await Promise.all([
    prisma.invoice.findMany({
      where,
      orderBy: { issueDate: 'desc' },
      skip,
      take,
      select: {
        id: true, number: true, kind: true, total: true, balanceDue: true,
        currency: true, status: true, issueDate: true, dueDate: true,
        paymentLinkUrl: true,
      },
    }),
    prisma.invoice.count({ where }),
  ]);

  return (
    <>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Invoices</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Download a copy or pay online. Payments reconcile automatically.
        </p>
      </div>

      <Card>
        <CardContent className="p-4">
          {invoices.length === 0 ? (
            <EmptyState
              icon={Receipt}
              title="No invoices yet"
              description="Invoices will appear here once issued."
            />
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Invoice</TableHead>
                    <TableHead>Issued</TableHead>
                    <TableHead>Due</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead className="text-right">Balance</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {invoices.map((inv) => {
                    const payable =
                      Number(inv.balanceDue) > 0 &&
                      inv.kind === 'TAX_INVOICE' &&
                      Boolean(inv.paymentLinkUrl);

                    return (
                      <TableRow key={inv.id}>
                        <TableCell data-label="Invoice" className="font-medium">
                          {inv.number}
                          {inv.kind === 'CREDIT_NOTE' && (
                            <span className="ml-2 text-xs text-muted-foreground">Credit note</span>
                          )}
                        </TableCell>
                        <TableCell data-label="Issued" className="text-muted-foreground">
                          {formatDate(inv.issueDate)}
                        </TableCell>
                        <TableCell data-label="Due" className="text-muted-foreground">
                          {formatDate(inv.dueDate)}
                        </TableCell>
                        <TableCell data-label="Amount" className="text-right font-medium tabular">
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
                        <TableCell data-label="Actions" className="text-right">
                          <div className="flex justify-end gap-1">
                            <Button size="icon" variant="ghost" asChild aria-label="Download PDF">
                              <a href={`/api/invoices/${inv.id}/pdf`} target="_blank" rel="noreferrer">
                                <Download className="h-3.5 w-3.5" />
                              </a>
                            </Button>
                            {payable && (
                              <Button size="sm" asChild>
                                <a href={inv.paymentLinkUrl!} target="_blank" rel="noreferrer">
                                  Pay
                                  <ExternalLink />
                                </a>
                              </Button>
                            )}
                          </div>
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
