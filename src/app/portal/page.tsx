import type { Metadata } from 'next';
import Link from 'next/link';
import { CheckCircle2, Circle, Clock, ExternalLink, FolderKanban, Receipt } from 'lucide-react';
import { prisma } from '@/lib/db';
import { requireAuth } from '@/lib/session';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/misc';
import { StatusBadge } from '@/components/ui/status-badge';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { StatCard } from '@/components/dashboard/stat-card';
import { formatMoney, toMinor, toNumber } from '@/lib/billing/money';
import { formatDate } from '@/lib/utils';

export const metadata: Metadata = { title: 'Your projects' };

export default async function PortalOverview() {
  const user = await requireAuth();
  const clientId = user.clientId!;

  const [projects, openInvoices, pendingSows] = await Promise.all([
    prisma.project.findMany({
      where: { clientId, clientVisible: true, status: { notIn: ['CANCELLED'] } },
      orderBy: { updatedAt: 'desc' },
      include: {
        milestones: {
          where: { clientVisible: true },
          orderBy: { position: 'asc' },
        },
      },
    }),
    prisma.invoice.findMany({
      where: {
        clientId,
        kind: 'TAX_INVOICE',
        status: { in: ['SENT', 'PARTIALLY_PAID', 'OVERDUE'] },
      },
      orderBy: { dueDate: 'asc' },
      select: {
        id: true, number: true, total: true, balanceDue: true,
        currency: true, status: true, dueDate: true, paymentLinkUrl: true,
      },
    }),
    prisma.sow.findMany({
      where: { clientId, status: { in: ['SENT', 'VIEWED'] } },
      select: { id: true, number: true, title: true, value: true, currency: true, status: true },
    }),
  ]);

  const outstanding = toNumber(
    openInvoices.reduce((acc, i) => acc + toMinor(i.balanceDue.toString()), 0n)
  );
  const activeProjects = projects.filter((p) =>
    ['PLANNING', 'IN_PROGRESS', 'QA'].includes(p.status)
  ).length;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Welcome back, {user.name.split(' ')[0]}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Progress on your projects, documents awaiting signature, and anything outstanding.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Active projects" value={String(activeProjects)} icon={FolderKanban} />
        <StatCard
          label="Outstanding"
          value={formatMoney(outstanding, 'INR', { compact: true })}
          icon={Receipt}
          tone={outstanding > 0 ? 'warning' : 'success'}
          hint={`${openInvoices.length} open invoice${openInvoices.length === 1 ? '' : 's'}`}
        />
        <StatCard
          label="Awaiting signature"
          value={String(pendingSows.length)}
          icon={Clock}
          tone={pendingSows.length > 0 ? 'warning' : 'default'}
        />
      </div>

      {pendingSows.length > 0 && (
        <Card className="border-warning/40 bg-warning/5">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Documents awaiting your signature</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 pt-0">
            {pendingSows.map((sow) => (
              <div key={sow.id} className="flex flex-wrap items-center gap-3 rounded-lg border bg-card p-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{sow.title}</p>
                  <p className="text-xs text-muted-foreground">
                    {sow.number} · {formatMoney(sow.value.toString(), sow.currency)}
                  </p>
                </div>
                <StatusBadge status={sow.status} />
              </div>
            ))}
            <p className="pt-1 text-xs text-muted-foreground">
              Use the signing link emailed to you to review and sign these documents.
            </p>
          </CardContent>
        </Card>
      )}

      {openInvoices.length > 0 && (
        <Card>
          <CardHeader className="flex-row items-center justify-between space-y-0 pb-3">
            <CardTitle className="text-base">Open invoices</CardTitle>
            <Button variant="ghost" size="sm" asChild>
              <Link href="/portal/invoices">View all</Link>
            </Button>
          </CardHeader>
          <CardContent className="space-y-2 pt-0">
            {openInvoices.slice(0, 4).map((inv) => (
              <div key={inv.id} className="flex flex-wrap items-center gap-3 rounded-lg border p-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">{inv.number}</p>
                  <p className="text-xs text-muted-foreground">Due {formatDate(inv.dueDate)}</p>
                </div>
                <StatusBadge status={inv.status} />
                <span className="text-sm font-medium tabular">
                  {formatMoney(inv.balanceDue.toString(), inv.currency)}
                </span>
                {inv.paymentLinkUrl && (
                  <Button size="sm" asChild>
                    <a href={inv.paymentLinkUrl} target="_blank" rel="noreferrer">
                      Pay now
                      <ExternalLink />
                    </a>
                  </Button>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <div>
        <h2 className="mb-3 text-lg font-semibold tracking-tight">Project progress</h2>
        {projects.length === 0 ? (
          <Card>
            <EmptyState
              icon={FolderKanban}
              title="No projects yet"
              description="Once a project starts, its milestones and progress will appear here."
            />
          </Card>
        ) : (
          <div className="grid gap-4 lg:grid-cols-2">
            {projects.map((project) => {
              const done = project.milestones.filter(
                (m) => m.status === 'COMPLETED' || m.status === 'APPROVED'
              ).length;

              return (
                <Card key={project.id}>
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <CardTitle className="truncate text-base">{project.name}</CardTitle>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          {project.targetEndDate
                            ? `Target ${formatDate(project.targetEndDate)}`
                            : 'Target date to be confirmed'}
                        </p>
                      </div>
                      <StatusBadge status={project.status} />
                    </div>
                  </CardHeader>
                  <CardContent className="pt-0">
                    <div className="mb-1 flex items-center justify-between text-xs">
                      <span className="text-muted-foreground">
                        {done} of {project.milestones.length} milestones
                      </span>
                      <span className="font-medium tabular">{project.progressPct}%</span>
                    </div>
                    <Progress value={project.progressPct} className="mb-4 h-1.5" />

                    <ul className="space-y-2">
                      {project.milestones.map((m) => {
                        const complete = m.status === 'COMPLETED' || m.status === 'APPROVED';
                        return (
                          <li key={m.id} className="flex items-start gap-2.5 text-sm">
                            {complete ? (
                              <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-success" />
                            ) : (
                              <Circle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                            )}
                            <div className="min-w-0 flex-1">
                              <p className={complete ? 'text-muted-foreground line-through' : ''}>
                                {m.title}
                              </p>
                              {m.dueDate && !complete && (
                                <p className="text-xs text-muted-foreground">
                                  Due {formatDate(m.dueDate)}
                                </p>
                              )}
                            </div>
                            {m.status === 'IN_PROGRESS' && <StatusBadge status={m.status} />}
                          </li>
                        );
                      })}
                    </ul>

                    <Button variant="outline" size="sm" className="mt-4 w-full" asChild>
                      <Link href={`/portal/projects/${project.id}`}>View details</Link>
                    </Button>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
