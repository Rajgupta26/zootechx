import type { Metadata } from 'next';
import Link from 'next/link';
import { FolderKanban } from 'lucide-react';
import { prisma } from '@/lib/db';
import { requirePermission } from '@/lib/session';
import { scopeFilter } from '@/lib/rbac';
import { PageHeader } from '@/components/layout/app-shell';
import { Card, CardContent } from '@/components/ui/card';
import { StatusBadge } from '@/components/ui/status-badge';
import { Progress } from '@/components/ui/misc';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/empty-state';
import { Pagination } from '@/components/ui/pagination';
import { formatDate, paginate, pageCount } from '@/lib/utils';

export const metadata: Metadata = { title: 'Projects' };

export default async function ProjectsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const user = await requirePermission('project', 'read');
  const params = await searchParams;
  const { skip, take, page } = paginate(params.page);
  const where = scopeFilter(user, 'project');

  const [projects, total] = await Promise.all([
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
  ]);

  return (
    <>
      <PageHeader
        title="Projects"
        subtitle="Delivery status, milestones and open issues. Progress is derived from milestone completion."
      />

      {projects.length === 0 ? (
        <Card>
          <EmptyState
            icon={FolderKanban}
            title="No projects"
            description={
              user.role === 'DEVELOPER'
                ? 'You are not assigned to any projects yet.'
                : 'Create a project from a signed statement of work.'
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
