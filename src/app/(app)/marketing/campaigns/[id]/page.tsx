import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, MousePointerClick, Target, TrendingUp, Users } from 'lucide-react';
import { prisma } from '@/lib/db';
import { requirePermission } from '@/lib/session';
import { scopeFilter } from '@/lib/rbac';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { StatusBadge } from '@/components/ui/status-badge';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/misc';
import { StatCard } from '@/components/dashboard/stat-card';
import { formatMoney } from '@/lib/billing/money';
import { formatDate } from '@/lib/utils';

export const metadata: Metadata = { title: 'Campaign' };

export default async function CampaignDetail({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePermission('campaign', 'read');
  const { id } = await params;

  const campaign = await prisma.campaign.findFirst({
    where: { id, ...scopeFilter(user, 'campaign') },
    include: {
      brand: { select: { id: true, name: true } },
      leads: {
        orderBy: { createdAt: 'desc' },
        take: 20,
        select: { id: true, name: true, company: true, status: true, createdAt: true },
      },
    },
  });

  if (!campaign) notFound();

  const spend = Number(campaign.spend);
  const revenue = Number(campaign.revenue);
  const budget = Number(campaign.budget);
  const roas = spend > 0 ? revenue / spend : 0;
  const ctr = campaign.impressions > 0 ? (campaign.clicks / campaign.impressions) * 100 : 0;
  const cpl = campaign.leads.length > 0 ? spend / campaign.leads.length : 0;
  const pacing = budget > 0 ? (spend / budget) * 100 : 0;

  return (
    <>
      <Button variant="ghost" size="sm" className="-ml-2 mb-3" asChild>
        <Link href="/marketing/campaigns">
          <ArrowLeft />
          Campaigns
        </Link>
      </Button>

      <div className="mb-6">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-semibold tracking-tight">{campaign.name}</h1>
          <StatusBadge status={campaign.status} />
          <Badge variant="muted">{campaign.platform}</Badge>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          {campaign.brand.name}
          {campaign.objective ? ` · ${campaign.objective}` : ''}
          {campaign.startDate ? ` · from ${formatDate(campaign.startDate)}` : ''}
        </p>
      </div>

      <div className="mb-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Spend"
          value={formatMoney(spend, campaign.currency, { compact: true })}
          icon={Target}
          hint={`${pacing.toFixed(0)}% of ${formatMoney(budget, campaign.currency, { compact: true })}`}
          tone={pacing > 90 ? 'warning' : 'default'}
        />
        <StatCard
          label="ROAS"
          value={`${roas.toFixed(2)}×`}
          icon={TrendingUp}
          tone={roas >= 2 ? 'success' : roas >= 1 ? 'warning' : 'destructive'}
          hint={`${formatMoney(revenue, campaign.currency, { compact: true })} revenue`}
        />
        <StatCard
          label="CTR"
          value={`${ctr.toFixed(2)}%`}
          icon={MousePointerClick}
          hint={`${campaign.clicks.toLocaleString('en-IN')} clicks`}
        />
        <StatCard
          label="Leads"
          value={String(campaign.leads.length)}
          icon={Users}
          hint={cpl > 0 ? `${formatMoney(cpl, campaign.currency)} per lead` : 'No leads yet'}
        />
      </div>

      <Card className="mb-5">
        <CardContent className="p-5">
          <div className="mb-2 flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Budget pacing</span>
            <span className="font-medium tabular">{pacing.toFixed(1)}%</span>
          </div>
          <Progress
            value={Math.min(pacing, 100)}
            indicatorClassName={pacing > 90 ? 'bg-destructive' : pacing > 75 ? 'bg-warning' : undefined}
          />
          <div className="mt-4 grid grid-cols-2 gap-4 text-sm sm:grid-cols-4">
            <Stat label="Impressions" value={campaign.impressions.toLocaleString('en-IN')} />
            <Stat label="Clicks" value={campaign.clicks.toLocaleString('en-IN')} />
            <Stat label="Conversions" value={campaign.conversions.toLocaleString('en-IN')} />
            <Stat
              label="Last synced"
              value={campaign.lastSyncedAt ? formatDate(campaign.lastSyncedAt) : 'Manual entry'}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Leads from this campaign</CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          {campaign.leads.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              No leads attributed yet.
            </p>
          ) : (
            <ul className="divide-y">
              {campaign.leads.map((lead) => (
                <li key={lead.id}>
                  <Link
                    href={`/leads/${lead.id}`}
                    className="-mx-2 flex items-center gap-3 rounded-md px-2 py-2.5 transition-colors hover:bg-accent/50"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{lead.name}</p>
                      {lead.company && (
                        <p className="truncate text-xs text-muted-foreground">{lead.company}</p>
                      )}
                    </div>
                    <StatusBadge status={lead.status} />
                    <span className="text-xs text-muted-foreground">{formatDate(lead.createdAt)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="font-medium tabular">{value}</p>
    </div>
  );
}
