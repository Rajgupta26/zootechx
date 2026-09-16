import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, CheckCircle2, Circle, Clock } from 'lucide-react';
import { prisma } from '@/lib/db';
import { requireAuth } from '@/lib/session';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/misc';
import { StatusBadge } from '@/components/ui/status-badge';
import { Button } from '@/components/ui/button';
import { formatDate } from '@/lib/utils';

export const metadata: Metadata = { title: 'Project' };

export default async function PortalProject({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireAuth();
  const { id } = await params;

  const project = await prisma.project.findFirst({
    // clientId in the where clause is what stops one client reading another's project.
    where: { id, clientId: user.clientId!, clientVisible: true },
    include: {
      milestones: { where: { clientVisible: true }, orderBy: { position: 'asc' } },
      progressLogs: {
        where: { clientVisible: true },
        orderBy: { logDate: 'desc' },
        take: 15,
        include: { author: { select: { name: true } } },
      },
      sow: { select: { id: true, number: true, title: true } },
    },
  });

  if (!project) notFound();

  return (
    <>
      <Button variant="ghost" size="sm" className="-ml-2 mb-3" asChild>
        <Link href="/portal">
          <ArrowLeft />
          Back
        </Link>
      </Button>

      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight">{project.name}</h1>
          {project.description && (
            <p className="mt-1 text-sm text-muted-foreground">{project.description}</p>
          )}
        </div>
        <StatusBadge status={project.status} />
      </div>

      <Card className="mb-5">
        <CardContent className="p-5">
          <div className="mb-2 flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Overall progress</span>
            <span className="font-semibold tabular">{project.progressPct}%</span>
          </div>
          <Progress value={project.progressPct} className="h-2" />
          <div className="mt-4 grid gap-4 text-sm sm:grid-cols-3">
            <div>
              <p className="text-xs text-muted-foreground">Started</p>
              <p>{project.startDate ? formatDate(project.startDate) : 'Not started'}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Target completion</p>
              <p>{project.targetEndDate ? formatDate(project.targetEndDate) : 'To be confirmed'}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Statement of work</p>
              <p>{project.sow ? project.sow.number : '—'}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Milestones</CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            {project.milestones.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                Milestones will appear here once planned.
              </p>
            ) : (
              <ol className="relative space-y-4 border-l pl-6">
                {project.milestones.map((m) => {
                  const complete = m.status === 'COMPLETED' || m.status === 'APPROVED';
                  const active = m.status === 'IN_PROGRESS';
                  return (
                    <li key={m.id} className="relative">
                      <span className="absolute -left-[31px] top-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-background">
                        {complete ? (
                          <CheckCircle2 className="h-4 w-4 text-success" />
                        ) : active ? (
                          <Clock className="h-4 w-4 text-primary" />
                        ) : (
                          <Circle className="h-4 w-4 text-muted-foreground" />
                        )}
                      </span>
                      <div className="flex flex-wrap items-center gap-2">
                        <p className={`text-sm font-medium ${complete ? 'text-muted-foreground' : ''}`}>
                          {m.title}
                        </p>
                        <StatusBadge status={m.status} />
                      </div>
                      {m.description && (
                        <p className="mt-0.5 text-xs text-muted-foreground">{m.description}</p>
                      )}
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {complete && m.completedAt
                          ? `Completed ${formatDate(m.completedAt)}`
                          : m.dueDate
                            ? `Due ${formatDate(m.dueDate)}`
                            : ''}
                      </p>
                    </li>
                  );
                })}
              </ol>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Recent updates</CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            {project.progressLogs.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                No shared updates yet.
              </p>
            ) : (
              <ul className="divide-y">
                {project.progressLogs.map((log) => (
                  <li key={log.id} className="py-3 first:pt-0 last:pb-0">
                    <div className="mb-1 flex items-center justify-between gap-2 text-xs text-muted-foreground">
                      <span>{log.author.name}</span>
                      <span>{formatDate(log.logDate)}</span>
                    </div>
                    <p className="text-sm">{log.summary}</p>
                    {log.nextSteps && (
                      <p className="mt-1 text-xs text-muted-foreground">Next: {log.nextSteps}</p>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
