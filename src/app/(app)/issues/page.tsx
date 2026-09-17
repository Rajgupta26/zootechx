import type { Metadata } from 'next';
import Link from 'next/link';
import { Bug } from 'lucide-react';
import { prisma } from '@/lib/db';
import { requirePagePermission } from '@/lib/session';
import { scopeFilter, can } from '@/lib/rbac';
import { PageHeader } from '@/components/layout/app-shell';
import { Card, CardContent } from '@/components/ui/card';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { StatusBadge } from '@/components/ui/status-badge';
import { EmptyState } from '@/components/ui/empty-state';
import { Pagination } from '@/components/ui/pagination';
import { formatDate, paginate, pageCount } from '@/lib/utils';
import { IssueStatusControl } from './issue-status';

export const metadata: Metadata = { title: 'Issues' };

export default async function IssuesPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const user = await requirePagePermission('issue', 'read');
  const params = await searchParams;
  const { skip, take, page } = paginate(params.page);
  const where = scopeFilter(user, 'issue');

  const [issues, total] = await Promise.all([
    prisma.issue.findMany({
      where,
      orderBy: [{ status: 'asc' }, { severity: 'desc' }, { createdAt: 'desc' }],
      skip,
      take,
      include: {
        project: { select: { id: true, name: true } },
        assignee: { select: { name: true } },
        reporter: { select: { name: true } },
      },
    }),
    prisma.issue.count({ where }),
  ]);

  const canUpdate = can(user, 'issue', 'update');

  return (
    <>
      <PageHeader title="Issues" subtitle="Bug and defect tracking across delivery projects." />

      <Card>
        <CardContent className="p-4">
          {issues.length === 0 ? (
            <EmptyState icon={Bug} title="No issues" description="Nothing has been raised yet." />
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Key</TableHead>
                    <TableHead>Title</TableHead>
                    <TableHead>Project</TableHead>
                    <TableHead>Assignee</TableHead>
                    <TableHead>Severity</TableHead>
                    <TableHead>Raised</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {issues.map((i) => (
                    <TableRow key={i.id}>
                      <TableCell data-label="Key" className="font-mono text-xs">{i.key}</TableCell>
                      <TableCell data-label="Title" className="max-w-[320px]">
                        <p className="truncate font-medium">{i.title}</p>
                        {i.environment && (
                          <p className="text-xs text-muted-foreground">{i.environment}</p>
                        )}
                      </TableCell>
                      <TableCell data-label="Project">
                        <Link href={`/projects/${i.project.id}`} className="text-sm hover:underline">
                          {i.project.name}
                        </Link>
                      </TableCell>
                      <TableCell data-label="Assignee" className="text-muted-foreground">
                        {i.assignee?.name ?? 'Unassigned'}
                      </TableCell>
                      <TableCell data-label="Severity">
                        <StatusBadge status={i.severity} />
                      </TableCell>
                      <TableCell data-label="Raised" className="text-muted-foreground">
                        {formatDate(i.createdAt)}
                      </TableCell>
                      <TableCell data-label="Status">
                        {canUpdate ? (
                          <IssueStatusControl id={i.id} status={i.status} />
                        ) : (
                          <StatusBadge status={i.status} />
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>

              <Pagination page={page} pageCount={pageCount(total)} total={total} />
            </>
          )}
        </CardContent>
      </Card>
    </>
  );
}
