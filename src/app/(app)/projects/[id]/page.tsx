import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, Bug, Clock, ExternalLink, GitBranch, Users } from 'lucide-react';
import { prisma } from '@/lib/db';
import { requirePermission } from '@/lib/session';
import { scopeFilter, can } from '@/lib/rbac';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { StatusBadge } from '@/components/ui/status-badge';
import { Progress } from '@/components/ui/misc';
import { Badge } from '@/components/ui/badge';
import { formatMoney } from '@/lib/billing/money';
import { formatDate } from '@/lib/utils';
import { MilestoneControls } from './milestone-controls';

export const metadata: Metadata = { title: 'Project' };

export default async function ProjectDetail({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePermission('project', 'read');
  const { id } = await params;

  const project = await prisma.project.findFirst({
    where: { id, ...scopeFilter(user, 'project') },
    include: {
      client: { select: { id: true, name: true } },
      sow: { select: { id: true, number: true, title: true } },
      leadDev: { select: { name: true } },
      members: { include: { user: { select: { id: true, name: true } } } },
      milestones: { orderBy: { position: 'asc' } },
      issues: { orderBy: [{ severity: 'desc' }, { createdAt: 'desc' }], include: { assignee: { select: { name: true } } } },
      progressLogs: {
        orderBy: { logDate: 'desc' },
        take: 10,
        include: { author: { select: { name: true } } },
      },
      invoices: { select: { id: true, number: true, total: true, currency: true, status: true } },
      tasks: { where: { status: { notIn: ['DONE', 'CANCELLED'] } }, include: { assignee: { select: { name: true } } } },
    },
  });

  if (!project) notFound();

  const canUpdateMilestone = can(user, 'milestone', 'update');
  const totalHours = project.progressLogs.reduce((a, l) => a + Number(l.hoursSpent), 0);

  return (
    <>
      <Button variant="ghost" size="sm" className="-ml-2 mb-3" asChild>
        <Link href="/projects">
          <ArrowLeft />
          Projects
        </Link>
      </Button>

      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-semibold tracking-tight">{project.name}</h1>
            <StatusBadge status={project.status} />
            <StatusBadge status={project.priority} />
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            {project.code} ·{' '}
            <Link href={`/clients/${project.client.id}`} className="hover:underline">
              {project.client.name}
            </Link>
          </p>
        </div>
        <div className="flex shrink-0 gap-2">
          {project.stagingUrl && (
            <Button variant="outline" size="sm" asChild>
              <a href={project.stagingUrl} target="_blank" rel="noreferrer">
                <ExternalLink />
                Staging
              </a>
            </Button>
          )}
          {project.repoUrl && (
            <Button variant="outline" size="sm" asChild>
              <a href={project.repoUrl} target="_blank" rel="noreferrer">
                <GitBranch />
                Repo
              </a>
            </Button>
          )}
        </div>
      </div>

      <Card className="mb-5">
        <CardContent className="p-5">
          <div className="mb-2 flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Progress (derived from milestones)</span>
            <span className="font-semibold tabular">{project.progressPct}%</span>
          </div>
          <Progress value={project.progressPct} className="h-2" />
          <div className="mt-4 grid gap-4 text-sm sm:grid-cols-4">
            <Stat label="Started" value={project.startDate ? formatDate(project.startDate) : '—'} />
            <Stat label="Target" value={project.targetEndDate ? formatDate(project.targetEndDate) : '—'} />
            <Stat label="Budget" value={project.budgetHours ? `${Number(project.budgetHours)} h` : '—'} />
            <Stat label="Logged (recent)" value={`${totalHours.toFixed(1)} h`} />
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Milestones</CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              {project.milestones.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">No milestones yet.</p>
              ) : (
                <ul className="divide-y">
                  {project.milestones.map((m) => (
                    <li key={m.id} className="flex flex-wrap items-center gap-3 py-3">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium">{m.title}</p>
                        <p className="text-xs text-muted-foreground">
                          {m.dueDate ? `Due ${formatDate(m.dueDate)}` : 'No due date'}
                          {m.billableAmount ? ` · ${formatMoney(m.billableAmount.toString(), 'INR')} billable` : ''}
                          {m.clientVisible ? '' : ' · internal only'}
                        </p>
                      </div>
                      {canUpdateMilestone ? (
                        <MilestoneControls id={m.id} status={m.status} />
                      ) : (
                        <StatusBadge status={m.status} />
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex-row items-center justify-between space-y-0 pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <Bug className="h-4 w-4" />
                Issues
              </CardTitle>
              <Badge variant="muted">
                {project.issues.filter((i) => ['OPEN', 'TRIAGED', 'IN_PROGRESS'].includes(i.status)).length} open
              </Badge>
            </CardHeader>
            <CardContent className="pt-0">
              {project.issues.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">No issues raised.</p>
              ) : (
                <ul className="divide-y">
                  {project.issues.map((i) => (
                    <li key={i.id} className="flex flex-wrap items-center gap-3 py-2.5">
                      <span className="shrink-0 font-mono text-xs text-muted-foreground">{i.key}</span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm">{i.title}</p>
                        <p className="text-xs text-muted-foreground">
                          {i.assignee?.name ?? 'Unassigned'}
                        </p>
                      </div>
                      <StatusBadge status={i.severity} />
                      <StatusBadge status={i.status} />
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <Clock className="h-4 w-4" />
                Progress log
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              {project.progressLogs.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">No logs yet.</p>
              ) : (
                <ul className="divide-y">
                  {project.progressLogs.map((log) => (
                    <li key={log.id} className="py-3">
                      <div className="mb-1 flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
                        <span>
                          {log.author.name} · {Number(log.hoursSpent)}h
                          {log.clientVisible && ' · shared with client'}
                        </span>
                        <span>{formatDate(log.logDate)}</span>
                      </div>
                      <p className="text-sm">{log.summary}</p>
                      {log.blockers && (
                        <p className="mt-1 text-xs text-destructive">Blocked: {log.blockers}</p>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <Users className="h-4 w-4" />
                Team
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 pt-0 text-sm">
              {project.members.map((m) => (
                <div key={m.id} className="flex items-center justify-between">
                  <span>{m.user.name}</span>
                  <Badge variant="muted">{m.roleLabel}</Badge>
                </div>
              ))}
              {project.members.length === 0 && (
                <p className="text-muted-foreground">No members assigned.</p>
              )}
            </CardContent>
          </Card>

          {project.sow && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Statement of work</CardTitle>
              </CardHeader>
              <CardContent className="pt-0">
                <Link href={`/sows/${project.sow.id}`} className="text-sm hover:underline">
                  {project.sow.number} — {project.sow.title}
                </Link>
              </CardContent>
            </Card>
          )}

          {project.tasks.length > 0 && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Open tasks</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 pt-0 text-sm">
                {project.tasks.map((t) => (
                  <div key={t.id} className="flex items-start justify-between gap-2">
                    <span className="min-w-0 flex-1 truncate">{t.title}</span>
                    <StatusBadge status={t.priority} />
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {project.invoices.length > 0 && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Invoices</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 pt-0">
                {project.invoices.map((inv) => (
                  <Link
                    key={inv.id}
                    href={`/invoices/${inv.id}`}
                    className="flex items-center justify-between rounded-md border p-2.5 text-sm transition-colors hover:bg-accent/50"
                  >
                    <span className="font-medium">{inv.number}</span>
                    <span className="tabular">{formatMoney(inv.total.toString(), inv.currency)}</span>
                  </Link>
                ))}
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="font-medium">{value}</p>
    </div>
  );
}
