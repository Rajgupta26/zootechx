import type { Metadata } from 'next';
import { Wallet } from 'lucide-react';
import { prisma } from '@/lib/db';
import { requirePagePermission } from '@/lib/session';
import { can } from '@/lib/rbac';
import { PageHeader } from '@/components/layout/app-shell';
import { Card, CardContent } from '@/components/ui/card';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { StatusBadge } from '@/components/ui/status-badge';
import { Badge } from '@/components/ui/badge';
import { Pagination } from '@/components/ui/pagination';
import { EmptyState } from '@/components/ui/empty-state';
import { StatCard } from '@/components/dashboard/stat-card';
import { formatMoney } from '@/lib/billing/money';
import { formatDate, paginate, pageCount } from '@/lib/utils';
import { fiscalYearFor } from '@/lib/billing/fiscal-year';
import { ExpenseApproval } from './expense-approval';

export const metadata: Metadata = { title: 'Expenses' };

export default async function ExpensesPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const user = await requirePagePermission('expense', 'read');
  const params = await searchParams;
  const { skip, take, page } = paginate(params.page);
  const fy = fiscalYearFor();

  const [expenses, total, fyTotal, itcTotal] = await Promise.all([
    prisma.expense.findMany({
      orderBy: { expenseDate: 'desc' },
      skip,
      take,
      include: {
        owner: { select: { name: true } },
        project: { select: { id: true, name: true } },
      },
    }),
    prisma.expense.count(),
    prisma.expense.aggregate({
      where: { expenseDate: { gte: fy.start }, status: { in: ['APPROVED', 'REIMBURSED'] } },
      _sum: { amount: true },
    }),
    prisma.expense.aggregate({
      where: { expenseDate: { gte: fy.start }, itcEligible: true },
      _sum: { gstAmount: true },
    }),
  ]);

  const canApprove = can(user, 'expense', 'approve');

  return (
    <>
      <PageHeader
        title="Expenses"
        subtitle="Operational costs, with input tax credit tracked separately for GST returns."
      />

      <div className="mb-5 grid gap-4 sm:grid-cols-3">
        <StatCard
          label={`Approved (FY ${fy.label})`}
          value={formatMoney(Number(fyTotal._sum.amount ?? 0), 'INR', { compact: true })}
          icon={Wallet}
        />
        <StatCard
          label="Input tax credit"
          value={formatMoney(Number(itcTotal._sum.gstAmount ?? 0), 'INR', { compact: true })}
          icon={Wallet}
          tone="success"
          hint="Claimable against output GST"
        />
        <StatCard label="Records" value={String(total)} icon={Wallet} />
      </div>

      <Card>
        <CardContent className="p-4">
          {expenses.length === 0 ? (
            <EmptyState icon={Wallet} title="No expenses" description="Log operational costs to track profitability." />
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Expense</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead>Vendor</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead className="text-right">GST / ITC</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Status</TableHead>
                    {canApprove && <TableHead className="text-right">Actions</TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {expenses.map((e) => (
                    <TableRow key={e.id}>
                      <TableCell data-label="Expense">
                        <p className="font-medium">{e.title}</p>
                        {e.project && (
                          <p className="truncate text-xs text-muted-foreground">{e.project.name}</p>
                        )}
                      </TableCell>
                      <TableCell data-label="Category">
                        <Badge variant="muted">{e.category.replace(/_/g, ' ')}</Badge>
                      </TableCell>
                      <TableCell data-label="Vendor" className="text-muted-foreground">
                        {e.vendor ?? '—'}
                      </TableCell>
                      <TableCell data-label="Amount" className="text-right font-medium tabular">
                        {formatMoney(e.amount.toString(), e.currency)}
                      </TableCell>
                      <TableCell data-label="GST / ITC" className="text-right tabular">
                        {Number(e.gstAmount) > 0 ? (
                          <>
                            {formatMoney(e.gstAmount.toString(), e.currency)}
                            {e.itcEligible && (
                              <span className="ml-1 text-xs text-success">ITC</span>
                            )}
                          </>
                        ) : (
                          '—'
                        )}
                      </TableCell>
                      <TableCell data-label="Date" className="text-muted-foreground">
                        {formatDate(e.expenseDate)}
                      </TableCell>
                      <TableCell data-label="Status">
                        <StatusBadge status={e.status} />
                      </TableCell>
                      {canApprove && (
                        <TableCell data-label="Actions" className="text-right">
                          {e.status === 'SUBMITTED' && <ExpenseApproval id={e.id} />}
                        </TableCell>
                      )}
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
