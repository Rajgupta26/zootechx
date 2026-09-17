import Link from 'next/link';
import { Megaphone, Target, TrendingUp, Users } from 'lucide-react';
import { StatCard } from '@/components/dashboard/stat-card';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { StatusBadge } from '@/components/ui/status-badge';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/misc';
import { formatMoney } from '@/lib/billing/money';
import type { getMarketingDashboard } from '@/lib/queries/dashboard';

type Data = Awaited<ReturnType<typeof getMarketingDashboard>>;

export function MarketingDashboard({ data }: { data: Data }) {
  const budgetUsed = data.totalBudget > 0 ? (data.totalSpend / data.totalBudget) * 100 : 0;

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Active campaigns"
          value={String(data.activeCampaigns)}
          icon={Megaphone}
          hint={`Across ${data.brands} brands`}
        />
        <StatCard
          label="Total spend"
          value={formatMoney(data.totalSpend, 'INR', { compact: true })}
          icon={Target}
          hint={`${budgetUsed.toFixed(0)}% of budget`}
        />
        <StatCard
          label="ROAS"
          value={`${data.roas.toFixed(2)}×`}
          icon={TrendingUp}
          tone={data.roas >= 2 ? 'success' : data.roas >= 1 ? 'warning' : 'destructive'}
          hint={`${formatMoney(data.totalRevenue, 'INR', { compact: true })} attributed`}
        />
        <StatCard
          label="Leads synced"
          value={String(data.syncedLeads)}
          icon={Users}
          hint="From paid channels into CRM"
        />
      </div>


      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0 pb-3">
          <CardTitle className="text-base">Campaign performance</CardTitle>
          <Button variant="ghost" size="sm" asChild>
            <Link href="/marketing/campaigns">View all</Link>
          </Button>
        </CardHeader>
        <CardContent className="pt-0">
          {data.campaigns.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">
              No campaigns yet. Create one to start tracking spend and ROAS.
            </p>
          ) : (
            <ul className="space-y-4">
              {data.campaigns.map((c) => {
                const spend = Number(c.spend);
                const revenue = Number(c.revenue);
                const budget = Number(c.budget);
                const roas = spend > 0 ? revenue / spend : 0;
                const pacing = budget > 0 ? (spend / budget) * 100 : 0;

                return (
                  <li key={c.id}>
                    <Link href={`/marketing/campaigns/${c.id}`} className="block group">
                      <div className="mb-1.5 flex flex-wrap items-center gap-2">
                        <span className="min-w-0 flex-1 truncate text-sm font-medium group-hover:underline">
                          {c.name}
                        </span>
                        <Badge variant="muted">{c.platform}</Badge>
                        <StatusBadge status={c.status} />
                      </div>
                      <div className="mb-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                        <span>{c.brand.name}</span>
                        <span className="tabular">
                          {formatMoney(spend, c.currency, { compact: true })} spent
                        </span>
                        <span className="tabular">{c._count.leads} leads</span>
                        <span
                          className={
                            roas >= 2 ? 'font-medium text-success' : roas >= 1 ? 'text-warning' : 'text-destructive'
                          }
                        >
                          {roas.toFixed(2)}× ROAS
                        </span>
                      </div>
                      <Progress
                        value={Math.min(pacing, 100)}
                        className="h-1.5"
                        indicatorClassName={pacing > 90 ? 'bg-destructive' : undefined}
                      />
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
