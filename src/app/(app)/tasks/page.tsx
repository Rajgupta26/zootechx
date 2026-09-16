import type { Metadata } from 'next';
import { ListChecks } from 'lucide-react';
import { prisma } from '@/lib/db';
import { requirePermission } from '@/lib/session';
import { scopeFilter, can } from '@/lib/rbac';
import { PageHeader } from '@/components/layout/app-shell';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { StatusBadge } from '@/components/ui/status-badge';
import { EmptyState } from '@/components/ui/empty-state';
import { relativeTime } from '@/lib/utils';
import { TaskStatusControl } from './task-status';

export const metadata: Metadata = { title: 'Tasks' };

const COLUMNS = [
  { status: 'TODO', label: 'To do' },
  { status: 'IN_PROGRESS', label: 'In progress' },
  { status: 'BLOCKED', label: 'Blocked' },
  { status: 'REVIEW', label: 'Review' },
  { status: 'DONE', label: 'Done' },
] as const;

export default async function TasksPage() {
  const user = await requirePermission('task', 'read');

  const tasks = await prisma.task.findMany({
    where: { status: { not: 'CANCELLED' }, ...scopeFilter(user, 'task') },
    orderBy: [{ priority: 'desc' }, { dueDate: 'asc' }],
    include: {
      assignee: { select: { name: true } },
      project: { select: { id: true, name: true } },
    },
    take: 200,
  });

  const canUpdate = can(user, 'task', 'update');

  return (
    <>
      <PageHeader
        title="Tasks"
        subtitle={
          user.role === 'SUPER_ADMIN' || user.role === 'SUB_ADMIN'
            ? 'Cross-departmental work across sales, delivery and marketing.'
            : 'Work assigned to you.'
        }
      />

      {tasks.length === 0 ? (
        <Card>
          <EmptyState icon={ListChecks} title="No tasks" description="Nothing is assigned right now." />
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
          {COLUMNS.map((col) => {
            const items = tasks.filter((t) => t.status === col.status);
            return (
              <Card key={col.status} className="flex flex-col">
                <CardHeader className="flex-row items-center justify-between space-y-0 pb-3">
                  <CardTitle className="text-sm">{col.label}</CardTitle>
                  <span className="rounded-full bg-muted px-2 py-0.5 text-xs tabular">
                    {items.length}
                  </span>
                </CardHeader>
                <CardContent className="flex-1 space-y-2 pt-0">
                  {items.length === 0 ? (
                    <p className="py-4 text-center text-xs text-muted-foreground">Empty</p>
                  ) : (
                    items.map((task) => {
                      const overdue =
                        task.dueDate && task.dueDate < new Date() && task.status !== 'DONE';
                      return (
                        <div key={task.id} className="rounded-lg border p-2.5">
                          <p className="mb-1 text-sm font-medium leading-snug">{task.title}</p>
                          <div className="mb-2 flex flex-wrap items-center gap-1.5">
                            <StatusBadge status={task.priority} />
                            {task.department && (
                              <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
                                {task.department}
                              </span>
                            )}
                          </div>
                          <p className="truncate text-xs text-muted-foreground">
                            {task.assignee?.name ?? 'Unassigned'}
                            {task.project ? ` · ${task.project.name}` : ''}
                          </p>
                          {task.dueDate && (
                            <p
                              className={`mt-0.5 text-xs ${
                                overdue ? 'font-medium text-destructive' : 'text-muted-foreground'
                              }`}
                            >
                              {relativeTime(task.dueDate)}
                            </p>
                          )}
                          {canUpdate && (
                            <div className="mt-2">
                              <TaskStatusControl id={task.id} status={task.status} />
                            </div>
                          )}
                        </div>
                      );
                    })
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </>
  );
}
