import Link from 'next/link';
import { Bug, Clock, FolderKanban, ListChecks, PenLine } from 'lucide-react';
import { StatCard } from '@/components/dashboard/stat-card';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { StatusBadge } from '@/components/ui/status-badge';
import { Progress } from '@/components/ui/misc';
import { Button } from '@/components/ui/button';
import { formatDate, relativeTime } from '@/lib/utils';
import type { getDeveloperDashboard } from '@/lib/queries/dashboard';

type Data = Awaited<ReturnType<typeof getDeveloperDashboard>>;

export function DeveloperDashboard({ data }: { data: Data }) {
  return (
    <div className="space-y-6">
      {!data.hasLoggedToday && (
        <Card className="border-warning/40 bg-warning/5">
          <CardContent className="flex flex-col items-start gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3">
              <PenLine className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
              <div>
                <p className="text-sm font-medium">Today&apos;s progress log is missing</p>
                <p className="text-xs text-muted-foreground">
                  Daily logs feed the client portal timeline and project profitability.
                </p>
              </div>
            </div>
            <Button size="sm" asChild>
              <Link href="/progress-logs/new">Log progress</Link>
            </Button>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Active projects" value={String(data.activeProjects)} icon={FolderKanban} />
        <StatCard
          label="Open issues"
          value={String(data.openIssues)}
          icon={Bug}
          tone={data.openIssues > 0 ? 'warning' : 'success'}
          hint="Assigned to you"
        />
        <StatCard label="Open tasks" value={String(data.tasks.length)} icon={ListChecks} />
        <StatCard
          label="Hours this week"
          value={data.weekHours.toFixed(1)}
          icon={Clock}
          hint="From your progress logs"
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="flex-row items-center justify-between space-y-0 pb-3">
            <CardTitle className="text-base">My projects</CardTitle>
            <Button variant="ghost" size="sm" asChild>
              <Link href="/projects">View all</Link>
            </Button>
          </CardHeader>
          <CardContent className="pt-0">
            {data.projects.length === 0 ? (
              <p className="py-10 text-center text-sm text-muted-foreground">
                You are not assigned to any active projects.
              </p>
            ) : (
              <ul className="space-y-4">
                {data.projects.map((p) => (
                  <li key={p.id}>
                    <Link href={`/projects/${p.id}`} className="block group">
                      <div className="mb-1.5 flex items-center gap-2">
                        <span className="min-w-0 flex-1 truncate text-sm font-medium group-hover:underline">
                          {p.name}
                        </span>
                        <StatusBadge status={p.status} />
                      </div>
                      <div className="mb-1.5 flex items-center justify-between text-xs text-muted-foreground">
                        <span className="truncate">{p.client.name}</span>
                        <span className="shrink-0">
                          {p.targetEndDate ? `Due ${formatDate(p.targetEndDate)}` : 'No target date'}
                        </span>
                      </div>
                      <Progress value={p.progressPct} className="h-1.5" />
                      <p className="mt-1 text-xs text-muted-foreground">
                        {p.progressPct}% · {p._count.milestones} milestones
                        {p._count.issues > 0 && ` · ${p._count.issues} open issues`}
                      </p>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex-row items-center justify-between space-y-0 pb-3">
            <CardTitle className="text-base">My tasks</CardTitle>
            <Button variant="ghost" size="sm" asChild>
              <Link href="/tasks">View all</Link>
            </Button>
          </CardHeader>
          <CardContent className="pt-0">
            {data.tasks.length === 0 ? (
              <p className="py-10 text-center text-sm text-muted-foreground">No open tasks.</p>
            ) : (
              <ul className="divide-y">
                {data.tasks.map((t) => (
                  <li key={t.id} className="flex items-center gap-3 py-2.5">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{t.title}</p>
                      {t.project && (
                        <p className="truncate text-xs text-muted-foreground">{t.project.name}</p>
                      )}
                    </div>
                    <StatusBadge status={t.priority} />
                    {t.dueDate && (
                      <span
                        className={`w-24 shrink-0 text-right text-xs ${
                          t.dueDate < new Date() ? 'font-medium text-destructive' : 'text-muted-foreground'
                        }`}
                      >
                        {relativeTime(t.dueDate)}
                      </span>
                    )}
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
