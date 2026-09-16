import type { Metadata } from 'next';
import Link from 'next/link';
import { PhoneCall } from 'lucide-react';
import { prisma } from '@/lib/db';
import { requirePermission } from '@/lib/session';
import { scopeFilter } from '@/lib/rbac';
import { PageHeader } from '@/components/layout/app-shell';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { StatusBadge } from '@/components/ui/status-badge';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/empty-state';
import { relativeTime, formatDate } from '@/lib/utils';
import { CompleteFollowUp } from './complete-follow-up';

export const metadata: Metadata = { title: 'Follow-ups' };

export default async function FollowUpsPage() {
  const user = await requirePermission('followup', 'read');
  const now = new Date();

  const followUps = await prisma.followUp.findMany({
    where: { status: 'PENDING', ...scopeFilter(user, 'followup') },
    orderBy: { dueAt: 'asc' },
    include: {
      lead: { select: { id: true, name: true, company: true } },
      client: { select: { id: true, name: true } },
      assignee: { select: { name: true } },
    },
    take: 100,
  });

  const overdue = followUps.filter((f) => f.dueAt < now);
  const today = followUps.filter(
    (f) => f.dueAt >= now && f.dueAt < new Date(now.getTime() + 86_400_000)
  );
  const upcoming = followUps.filter((f) => f.dueAt >= new Date(now.getTime() + 86_400_000));

  const groups = [
    { title: 'Overdue', items: overdue, tone: 'destructive' as const },
    { title: 'Due today', items: today, tone: 'warning' as const },
    { title: 'Upcoming', items: upcoming, tone: 'muted' as const },
  ];

  return (
    <>
      <PageHeader
        title="Follow-ups"
        subtitle="Your queue across email, WhatsApp, calls and meetings."
      />

      {followUps.length === 0 ? (
        <Card>
          <EmptyState
            icon={PhoneCall}
            title="Queue is clear"
            description="Nothing pending. Schedule follow-ups from a lead's page."
          />
        </Card>
      ) : (
        <div className="space-y-5">
          {groups.map((group) =>
            group.items.length === 0 ? null : (
              <Card key={group.title}>
                <CardHeader className="flex-row items-center justify-between space-y-0 pb-3">
                  <CardTitle className="text-base">{group.title}</CardTitle>
                  <Badge variant={group.tone}>{group.items.length}</Badge>
                </CardHeader>
                <CardContent className="pt-0">
                  <ul className="divide-y">
                    {group.items.map((f) => (
                      <li key={f.id} className="flex flex-wrap items-center gap-3 py-3">
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium">{f.subject}</p>
                          <p className="truncate text-xs text-muted-foreground">
                            {f.lead ? (
                              <Link href={`/leads/${f.lead.id}`} className="hover:underline">
                                {f.lead.name}
                                {f.lead.company ? ` · ${f.lead.company}` : ''}
                              </Link>
                            ) : f.client ? (
                              <Link href={`/clients/${f.client.id}`} className="hover:underline">
                                {f.client.name}
                              </Link>
                            ) : (
                              'No linked record'
                            )}
                            {f.assignee ? ` · ${f.assignee.name}` : ''}
                          </p>
                        </div>
                        <Badge variant="muted">{f.channel}</Badge>
                        <span
                          className={`text-xs ${
                            f.dueAt < now ? 'font-medium text-destructive' : 'text-muted-foreground'
                          }`}
                        >
                          {relativeTime(f.dueAt)}
                        </span>
                        <CompleteFollowUp id={f.id} subject={f.subject} />
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            )
          )}
        </div>
      )}
    </>
  );
}
