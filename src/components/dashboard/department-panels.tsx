import Link from 'next/link';
import {
  AlertTriangle, Bug, Clock, FolderKanban, Megaphone,
  PenLine, PhoneCall, Target, TrendingUp, Users,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/misc';
import { Avatar, AvatarFallback } from '@/components/ui/misc';
import { formatMoney } from '@/lib/billing/money';
import { cn, initials } from '@/lib/utils';
import type { getDepartmentPanels } from '@/lib/queries/dashboard';

type Data = Awaited<ReturnType<typeof getDepartmentPanels>>;

/**
 * Per-person workload across the three client-facing departments.
 *
 * The admin dashboards otherwise show org-wide totals, which hide who is
 * actually carrying what. These panels answer "where does everything stand
 * right now" without having to sign in as each role.
 */
export function DepartmentPanels({ data }: { data: Data }) {
  return (
    <section>
      <div className="mb-3 flex items-center gap-2">
        <h2 className="text-lg font-semibold tracking-tight">By department</h2>
        <span className="text-sm text-muted-foreground">
          who is holding what right now
        </span>
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <SalesPanel data={data.sales} />
        <SoftwarePanel data={data.software} />
        <MarketingPanel data={data.marketing} />
      </div>
    </section>
  );
}

// ---------- Sales ----------

function SalesPanel({ data }: { data: Data['sales'] }) {
  const totalLeads = data.rows.reduce((a, r) => a + r.openLeads, 0);
  const totalOverdue = data.rows.reduce((a, r) => a + r.overdue, 0);

  return (
    <Panel
      title="Sales"
      icon={Users}
      href="/leads"
      headline={`${totalLeads} open lead${totalLeads === 1 ? '' : 's'}`}
      alert={totalOverdue > 0 ? `${totalOverdue} overdue` : undefined}
      empty={data.rows.length === 0 ? 'No sales users yet.' : undefined}
    >
      {data.rows.map((person) => (
        <PersonRow key={person.id} name={person.name}>
          <Metric
            icon={Target}
            label={`${person.openLeads} open`}
            detail={formatMoney(person.pipelineValue, 'INR', { compact: true })}
          />
          <Metric
            icon={PhoneCall}
            label={person.overdue > 0 ? `${person.overdue} overdue` : 'on top of follow-ups'}
            tone={person.overdue > 0 ? 'danger' : 'ok'}
          />
          {person.wonThisMonth > 0 && (
            <Badge variant="success">{person.wonThisMonth} won this month</Badge>
          )}
        </PersonRow>
      ))}

      {data.strayLeads > 0 && (
        <Note tone="warning">
          {data.strayLeads} open lead{data.strayLeads === 1 ? ' is' : 's are'} owned by someone
          outside the sales team, or unassigned — nobody on Sales can see {data.strayLeads === 1 ? 'it' : 'them'}.
        </Note>
      )}
    </Panel>
  );
}

// ---------- Software ----------

function SoftwarePanel({ data }: { data: Data['software'] }) {
  const totalProjects = new Set(data.rows.flatMap((r) => r.projectNames)).size;
  const totalIssues = data.rows.reduce((a, r) => a + r.openIssues, 0);
  const missingLogs = data.rows.filter((r) => !r.loggedToday).length;

  return (
    <Panel
      title="Software"
      icon={FolderKanban}
      href="/projects"
      headline={`${totalProjects} active project${totalProjects === 1 ? '' : 's'}`}
      alert={totalIssues > 0 ? `${totalIssues} open issue${totalIssues === 1 ? '' : 's'}` : undefined}
      empty={data.rows.length === 0 ? 'No developers yet.' : undefined}
    >
      {data.rows.map((person) => (
        <PersonRow key={person.id} name={person.name}>
          <Metric
            icon={FolderKanban}
            label={`${person.projects} project${person.projects === 1 ? '' : 's'}`}
            detail={person.projects > 0 ? `${person.avgProgress}% avg` : undefined}
          />
          <Metric
            icon={Bug}
            label={person.openIssues > 0 ? `${person.openIssues} issue${person.openIssues === 1 ? '' : 's'}` : 'no open issues'}
            tone={person.openIssues > 2 ? 'danger' : person.openIssues > 0 ? 'warn' : 'ok'}
          />
          <Metric icon={Clock} label={`${person.weekHours.toFixed(1)}h this week`} />
          {!person.loggedToday && (
            <Badge variant="warning">
              <PenLine className="mr-1 h-2.5 w-2.5" />
              no log today
            </Badge>
          )}
          {person.projects > 0 && (
            <Progress value={person.avgProgress} className="mt-1.5 h-1" />
          )}
        </PersonRow>
      ))}

      {missingLogs > 0 && data.rows.length > 0 && (
        <Note tone="muted">
          {missingLogs} of {data.rows.length} {missingLogs === 1 ? 'has' : 'have'} not filed
          today&apos;s progress log. Client-visible logs feed the portal timeline.
        </Note>
      )}

      {data.unstaffedProjects > 0 && (
        <Note tone="warning">
          {data.unstaffedProjects} active project{data.unstaffedProjects === 1 ? ' has' : 's have'} no
          developer assigned.
        </Note>
      )}
    </Panel>
  );
}

// ---------- Marketing ----------

function MarketingPanel({ data }: { data: Data['marketing'] }) {
  const totalActive = data.rows.reduce((a, r) => a + r.activeCampaigns, 0);
  const totalPending = data.rows.reduce((a, r) => a + r.pendingCreatives, 0);

  return (
    <Panel
      title="Marketing"
      icon={Megaphone}
      href="/marketing/campaigns"
      headline={`${totalActive} live campaign${totalActive === 1 ? '' : 's'}`}
      alert={totalPending > 0 ? `${totalPending} awaiting approval` : undefined}
      empty={data.rows.length === 0 ? 'No marketing users yet.' : undefined}
    >
      {data.rows.map((person) => {
        const pacing = person.budget > 0 ? (person.spend / person.budget) * 100 : 0;
        return (
          <PersonRow key={person.id} name={person.name}>
            <Metric
              icon={Megaphone}
              label={`${person.activeCampaigns} live`}
              detail={person.totalCampaigns > person.activeCampaigns
                ? `${person.totalCampaigns - person.activeCampaigns} paused`
                : undefined}
            />
            <Metric
              icon={Target}
              label={formatMoney(person.spend, 'INR', { compact: true })}
              detail={person.budget > 0 ? `${pacing.toFixed(0)}% of budget` : undefined}
              tone={pacing > 90 ? 'danger' : pacing > 75 ? 'warn' : undefined}
            />
            <Metric
              icon={TrendingUp}
              label={`${person.roas.toFixed(2)}× return`}
              tone={person.roas >= 2 ? 'ok' : person.roas >= 1 ? 'warn' : 'danger'}
            />
            {person.leads > 0 && <Badge variant="secondary">{person.leads} leads synced</Badge>}
            {person.pendingCreatives > 0 && (
              <Badge variant="warning">{person.pendingCreatives} to approve</Badge>
            )}
            {person.budget > 0 && (
              <Progress
                value={Math.min(pacing, 100)}
                className="mt-1.5 h-1"
                indicatorClassName={pacing > 90 ? 'bg-destructive' : undefined}
              />
            )}
          </PersonRow>
        );
      })}
    </Panel>
  );
}

// ---------- Shared pieces ----------

function Panel({
  title, icon: Icon, href, headline, alert, empty, children,
}: {
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  href: string;
  headline: string;
  alert?: string;
  empty?: string;
  children: React.ReactNode;
}) {
  return (
    <Card className="flex flex-col">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2">
            <span className="shrink-0 rounded-md bg-primary/10 p-1.5">
              <Icon className="h-3.5 w-3.5 text-primary" />
            </span>
            <CardTitle className="text-base">
              <Link href={href} className="hover:underline">{title}</Link>
            </CardTitle>
          </div>
          {alert && <Badge variant="warning">{alert}</Badge>}
        </div>
        <p className="text-sm text-muted-foreground">{headline}</p>
      </CardHeader>
      <CardContent className="flex-1 space-y-3 pt-0">
        {empty ? (
          <p className="py-6 text-center text-sm text-muted-foreground">{empty}</p>
        ) : (
          children
        )}
      </CardContent>
    </Card>
  );
}

function PersonRow({ name, children }: { name: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border p-2.5">
      <div className="mb-1.5 flex items-center gap-2">
        <Avatar className="h-6 w-6">
          <AvatarFallback className="text-[10px]">{initials(name)}</AvatarFallback>
        </Avatar>
        <span className="truncate text-sm font-medium">{name}</span>
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">{children}</div>
    </div>
  );
}

function Metric({
  icon: Icon, label, detail, tone,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  detail?: string;
  tone?: 'ok' | 'warn' | 'danger';
}) {
  const toneClass = {
    ok: 'text-success',
    warn: 'text-warning',
    danger: 'text-destructive font-medium',
  };
  return (
    <span className={cn('flex items-center gap-1 text-xs', tone ? toneClass[tone] : 'text-muted-foreground')}>
      <Icon className="h-3 w-3 shrink-0" />
      <span className="tabular">{label}</span>
      {detail && <span className="text-muted-foreground">· {detail}</span>}
    </span>
  );
}

function Note({ tone, children }: { tone: 'warning' | 'muted'; children: React.ReactNode }) {
  return (
    <p
      className={cn(
        'flex items-start gap-1.5 rounded-md p-2 text-xs',
        tone === 'warning'
          ? 'bg-warning/10 text-warning-foreground dark:text-warning'
          : 'bg-muted/60 text-muted-foreground'
      )}
    >
      <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
      <span>{children}</span>
    </p>
  );
}
