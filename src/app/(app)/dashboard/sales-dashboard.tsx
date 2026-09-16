import Link from 'next/link';
import { CheckCircle2, PhoneCall, Target, TrendingUp, Users } from 'lucide-react';
import { StatCard } from '@/components/dashboard/stat-card';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { StatusBadge } from '@/components/ui/status-badge';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { formatMoney } from '@/lib/billing/money';
import { relativeTime } from '@/lib/utils';
import type { getSalesDashboard } from '@/lib/queries/dashboard';

type Data = Awaited<ReturnType<typeof getSalesDashboard>>;

const CHANNEL_LABEL: Record<string, string> = {
  EMAIL: 'Email', WHATSAPP: 'WhatsApp', CALL: 'Call', MEETING: 'Meeting', SMS: 'SMS',
};

export function SalesDashboard({ data }: { data: Data }) {
  const now = new Date();

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="My leads" value={String(data.total)} icon={Users} hint="Assigned to you" />
        <StatCard
          label="Pipeline value"
          value={formatMoney(data.pipelineValue, 'INR', { compact: true })}
          icon={TrendingUp}
          hint="Open opportunities"
        />
        <StatCard
          label="Overdue follow-ups"
          value={String(data.overdueFollowUps)}
          icon={PhoneCall}
          tone={data.overdueFollowUps > 0 ? 'destructive' : 'success'}
          hint={data.overdueFollowUps > 0 ? 'Needs attention today' : 'Nothing overdue'}
        />
        <StatCard
          label="Won this month"
          value={String(data.wonThisMonth)}
          icon={CheckCircle2}
          tone="success"
          hint={`${data.conversionRate.toFixed(0)}% overall conversion`}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="flex-row items-center justify-between space-y-0 pb-3">
            <CardTitle className="text-base">Follow-up queue</CardTitle>
            <Button variant="ghost" size="sm" asChild>
              <Link href="/follow-ups">View all</Link>
            </Button>
          </CardHeader>
          <CardContent className="pt-0">
            {data.followUps.length === 0 ? (
              <div className="py-10 text-center">
                <Target className="mx-auto mb-2 h-6 w-6 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">Queue is clear.</p>
              </div>
            ) : (
              <ul className="divide-y">
                {data.followUps.map((f) => {
                  const overdue = f.dueAt < now;
                  const subject = f.lead?.name ?? f.client?.name ?? 'Unassigned';
                  return (
                    <li key={f.id} className="flex items-center gap-3 py-2.5">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{f.subject}</p>
                        <p className="truncate text-xs text-muted-foreground">
                          {subject}
                          {f.lead?.company ? ` · ${f.lead.company}` : ''}
                        </p>
                      </div>
                      <Badge variant="muted">{CHANNEL_LABEL[f.channel]}</Badge>
                      <span
                        className={`w-24 shrink-0 text-right text-xs ${
                          overdue ? 'font-medium text-destructive' : 'text-muted-foreground'
                        }`}
                      >
                        {relativeTime(f.dueAt)}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex-row items-center justify-between space-y-0 pb-3">
            <CardTitle className="text-base">Recent leads</CardTitle>
            <Button variant="ghost" size="sm" asChild>
              <Link href="/leads">View all</Link>
            </Button>
          </CardHeader>
          <CardContent className="pt-0">
            {data.recentLeads.length === 0 ? (
              <p className="py-10 text-center text-sm text-muted-foreground">
                No leads assigned to you yet.
              </p>
            ) : (
              <ul className="divide-y">
                {data.recentLeads.map((lead) => (
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
                      {lead.estimatedValue && (
                        <span className="w-20 shrink-0 text-right text-sm tabular">
                          {formatMoney(lead.estimatedValue, lead.currency, { compact: true })}
                        </span>
                      )}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
