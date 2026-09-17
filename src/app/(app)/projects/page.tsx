import type { Metadata } from 'next';
import Link from 'next/link';
import { FolderKanban } from 'lucide-react';
import { prisma } from '@/lib/db';
import { requirePagePermission } from '@/lib/session';
import { scopeFilter, can } from '@/lib/rbac';
import { PageHeader } from '@/components/layout/app-shell';
import { Card, CardContent } from '@/components/ui/card';
import { StatusBadge } from '@/components/ui/status-badge';
import { Progress } from '@/components/ui/misc';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/empty-state';
import { Pagination } from '@/components/ui/pagination';
import { formatDate, paginate, pageCount } from '@/lib/utils';
import { NewProjectDialog } from './new-project';

export const metadata: Metadata = { title: 'Projects' };

export default async function ProjectsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; new?: string; sow?: string }>;
}) {
  const user = await requirePagePermission('project', 'read');
  const params = await searchParams;
  const { skip, take, page } = paginate(params.page);
  const where = scopeFilter(user, 'project');

  // Only two roles can create, so the pickers are only worth loading for them.
  const mayCreate = can(user, 'project', 'create');

  const [projects, total, clients, leads, sows] = await Promise.all([
    prisma.project.findMany({
      where,
      orderBy: [{ status: 'asc' }, { targetEndDate: 'asc' }],
      skip,
      take,
      include: {
        client: { select: { id: true, name: true } },
        leadDev: { select: { name: true } },
        members: { select: { user: { select: { name: true } } } },
        _count: {
          select: {
            milestones: true,
            issues: { where: { status: { in: ['OPEN', 'TRIAGED', 'IN_PROGRESS'] } } },
          },
        },
      },
    }),
    prisma.project.count({ where }),
    mayCreate
      ? prisma.client.findMany({
          where: { deletedAt: null },
          select: { id: true, name: true },
          orderBy: { name: 'asc' },
        })
      : Promise.resolve([]),
    mayCreate
      ? prisma.user.findMany({
          where: { role: { in: ['DEVELOPER', 'SUB_ADMIN', 'SUPER_ADMIN'] }, status: 'ACTIVE', deletedAt: null },
          select: { id: true, name: true },
          orderBy: { name: 'asc' },
        })
      : Promise.resolve([]),
    mayCreate
      ? prisma.sow.findMany({
          where: { status: 'SIGNED' },
          select: {
            id: true, number: true, title: true, clientId: true,
            _count: { select: { milestones: true } },
          },
          orderBy: { signedAt: 'desc' },
        })
      : Promise.resolve([]),
  ]);

  return (
    <>
      <PageHeader
        title="Projects"
        subtitle="Delivery status, milestones and open issues. Progress is derived from milestone completion."
        action={
          mayCreate ? (
            <NewProjectDialog
              clients={clients}
              leads={leads}
              sows={sows.map((s) => ({
                id: s.id, number: s.number, title: s.title,
                clientId: s.clientId, milestoneCount: s._count.milestones,
              }))}
              autoOpen={params.new === '1'}
              fromSowId={params.sow}
            />
          ) : undefined
        }
      />

      {projects.length === 0 ? (
        <Card>
          <EmptyState
            icon={FolderKanban}
            title="No projects"
            description={
              user.role === 'DEVELOPER'
                ? 'You are not assigned to any projects yet.'
                : mayCreate
                  ? 'Start one from a signed proposal, or create a standalone project.'
                  : 'Nothing in delivery yet.'
            }
          />
        </Card>
      ) : (
        <>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {projects.map((p) => (
              <Card key={p.id}>
                <CardContent className="p-4">
                  <div className="mb-2 flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <Link href={`/projects/${p.id}`} className="block truncate font-medium hover:underline">
                        {p.name}
                      </Link>
                      <Link
                        href={`/clients/${p.client.id}`}
                        className="block truncate text-xs text-muted-foreground hover:underline"
                      >
                        {p.client.name}
                      </Link>
                    </div>
                    <StatusBadge status={p.status} />
                  </div>

                  <div className="mb-1.5 flex items-center justify-between text-xs text-muted-foreground">
                    <span>{p.code}</span>
                    <span className="font-medium tabular">{p.progressPct}%</span>
                  </div>
                  <Progress value={p.progressPct} className="mb-3 h-1.5" />

                  <div className="flex flex-wrap items-center gap-1.5 text-xs">
                    <Badge variant="muted">{p._count.milestones} milestones</Badge>
                    {p._count.issues > 0 && (
                      <Badge variant="destructive">{p._count.issues} open issues</Badge>
                    )}
                    <StatusBadge status={p.priority} />
                  </div>

                  <p className="mt-3 truncate text-xs text-muted-foreground">
                    {p.leadDev ? `Lead: ${p.leadDev.name}` : 'No lead assigned'}
                    {p.targetEndDate ? ` · due ${formatDate(p.targetEndDate)}` : ''}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>

          <div className="mt-4">
            <Pagination page={page} pageCount={pageCount(total)} total={total} />
          </div>
        </>
      )}
    </>
  );
}
