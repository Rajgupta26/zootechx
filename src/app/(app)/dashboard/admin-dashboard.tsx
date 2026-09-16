import Link from 'next/link';
import {
  AlertTriangle, Bug, FolderKanban, IndianRupee, PhoneCall,
  Receipt, TrendingUp, Users, Wallet,
} from 'lucide-react';
import { StatCard } from '@/components/dashboard/stat-card';
import { RevenueChart } from '@/components/dashboard/revenue-chart';
import { DepartmentPanels } from '@/components/dashboard/department-panels';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { StatusBadge } from '@/components/ui/status-badge';
import { Button } from '@/components/ui/button';
import { formatMoney } from '@/lib/billing/money';
import { formatDate } from '@/lib/utils';
import type { getAdminDashboard, getDepartmentPanels } from '@/lib/queries/dashboard';

type Data = Awaited<ReturnType<typeof getAdminDashboard>>;
type Departments = Awaited<ReturnType<typeof getDepartmentPanels>>;

export function AdminDashboard({
  data,
  departments,
  role,
}: {
  data: Data;
  departments: Departments;
  role: string;
}) {
  const collectionRate =
    data.invoicedFy > 0 ? (data.collectedFy / data.invoicedFy) * 100 : 0;

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label={`Invoiced (FY ${data.fyLabel})`}
          value={formatMoney(data.invoicedFy, 'INR', { compact: true })}
          icon={Receipt}
          hint={`${data.invoiceCount} invoices issued`}
        />
        <StatCard
          label="Collected"
          value={formatMoney(data.collectedFy, 'INR', { compact: true })}
          icon={IndianRupee}
          tone="success"
          hint={`${collectionRate.toFixed(0)}% collection rate`}
        />
        <StatCard
          label="Outstanding"
          value={formatMoney(data.outstanding, 'INR', { compact: true })}
          icon={AlertTriangle}
          tone={data.overdueCount > 0 ? 'destructive' : 'warning'}
          hint={`${data.overdueCount} overdue`}
        />
        <StatCard
          label="Pipeline value"
          value={formatMoney(data.pipelineValue, 'INR', { compact: true })}
          icon={TrendingUp}
          hint={`${data.totalLeads} leads · ${data.conversionRate.toFixed(0)}% won`}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <RevenueChart data={data.revenueSeries} />
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1">
          <StatCard label="Active projects" value={String(data.activeProjects)} icon={FolderKanban} />
          <StatCard
            label="Overdue follow-ups"
            value={String(data.overdueFollowUps)}
            icon={PhoneCall}
            tone={data.overdueFollowUps > 0 ? 'warning' : 'default'}
          />
          <StatCard label="Open issues" value={String(data.openIssues)} icon={Bug} />
          {role === 'SUPER_ADMIN' && (
            <StatCard
              label={`Expenses (FY ${data.fyLabel})`}
              value={formatMoney(data.expensesFy, 'INR', { compact: true })}
              icon={Wallet}
            />
          )}
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader className="flex-row items-center justify-between space-y-0 pb-3">
            <CardTitle className="text-base">Recent invoices</CardTitle>
            <Button variant="ghost" size="sm" asChild>
              <Link href="/invoices">View all</Link>
            </Button>
          </CardHeader>
          <CardContent className="pt-0">
            {data.recentInvoices.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                No invoices yet. Use Quick invoice in the header to raise one.
              </p>
            ) : (
              <ul className="divide-y">
                {data.recentInvoices.map((inv) => (
                  <li key={inv.id}>
                    <Link
                      href={`/invoices/${inv.id}`}
                      className="-mx-2 flex items-center gap-3 rounded-md px-2 py-2.5 transition-colors hover:bg-accent/50"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{inv.clientName}</p>
                        <p className="truncate text-xs text-muted-foreground">
                          {inv.number} · due {formatDate(inv.dueDate)}
                        </p>
                      </div>
                      <StatusBadge status={inv.status} />
                      <span className="w-24 shrink-0 text-right text-sm font-medium tabular">
                        {formatMoney(inv.total, inv.currency)}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Pipeline by stage</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2.5 pt-0">
            {Object.entries(data.leadsByStatus).length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">No leads yet.</p>
            ) : (
              Object.entries(data.leadsByStatus).map(([status, count]) => {
                const pct = data.totalLeads > 0 ? (count / data.totalLeads) * 100 : 0;
                return (
                  <div key={status}>
                    <div className="mb-1 flex items-center justify-between text-xs">
                      <span className="capitalize text-muted-foreground">
                        {status.replace(/_/g, ' ').toLowerCase()}
                      </span>
                      <span className="font-medium tabular">{count}</span>
                    </div>
                    <div className="h-1.5 overflow-hidden rounded-full bg-secondary">
                      <div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })
            )}
            <Button variant="outline" size="sm" className="mt-4 w-full" asChild>
              <Link href="/leads">
                <Users className="mr-1" />
                Open leads
              </Link>
            </Button>
          </CardContent>
        </Card>
      </div>

      <DepartmentPanels data={departments} />
    </div>
  );
}
