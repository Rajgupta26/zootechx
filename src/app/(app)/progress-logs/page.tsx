import type { Metadata } from 'next';
import Link from 'next/link';
import { ClipboardList, Plus } from 'lucide-react';
import { prisma } from '@/lib/db';
import { requirePagePermission } from '@/lib/session';
import { scopeFilter, can } from '@/lib/rbac';
import { PageHeader } from '@/components/layout/app-shell';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/empty-state';
import { Pagination } from '@/components/ui/pagination';
import { formatDate, paginate, pageCount } from '@/lib/utils';

export const metadata: Metadata = { title: 'Progress logs' };

export default async function ProgressLogsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const user = await requirePagePermission('progresslog', 'read');
  const params = await searchParams;
  const { skip, take, page } = paginate(params.page);
  const where = scopeFilter(user, 'progresslog');

  const [logs, total] = await Promise.all([
    prisma.progressLog.findMany({
      where,
      orderBy: { logDate: 'desc' },
      skip,
      take,
      include: {
        project: { select: { id: true, name: true } },
        author: { select: { name: true } },
      },
    }),
    prisma.progressLog.count({ where }),
  ]);

  return (
    <>
      <PageHeader
        title="Progress logs"
        subtitle="Daily delivery updates. Logs marked client-visible appear in the client portal."
        action={
          can(user, 'progresslog', 'create') ? (
            <Button asChild>
              <Link href="/progress-logs/new">
                <Plus />
                Log progress
              </Link>
            </Button>
          ) : undefined
        }
      />

      {logs.length === 0 ? (
        <Card>
          <EmptyState
            icon={ClipboardList}
            title="No progress logs"
            description="Daily logs feed project profitability and the client-facing timeline."
          />
        </Card>
      ) : (
        <>
          <div className="space-y-3">
            {logs.map((log) => (
              <Card key={log.id}>
                <CardContent className="p-4">
                  <div className="mb-2 flex flex-wrap items-center gap-2">
                    <Link href={`/projects/${log.project.id}`} className="text-sm font-medium hover:underline">
                      {log.project.name}
                    </Link>
                    <Badge variant="muted">{Number(log.hoursSpent)}h</Badge>
                    {log.clientVisible && <Badge variant="success">Shared with client</Badge>}
                    <span className="ml-auto text-xs text-muted-foreground">
                      {log.author.name} · {formatDate(log.logDate)}
                    </span>
                  </div>
                  <p className="text-sm">{log.summary}</p>
                  {log.blockers && (
                    <p className="mt-2 rounded-md bg-destructive/5 p-2 text-xs text-destructive">
                      Blocked: {log.blockers}
                    </p>
                  )}
                  {log.nextSteps && (
                    <p className="mt-1.5 text-xs text-muted-foreground">Next: {log.nextSteps}</p>
                  )}
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
