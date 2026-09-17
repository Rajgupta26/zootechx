import type { Metadata } from 'next';
import { prisma } from '@/lib/db';
import { requirePagePermission } from '@/lib/session';
import { scopeFilter } from '@/lib/rbac';
import { PageHeader } from '@/components/layout/app-shell';
import { ProgressLogForm } from './form';

export const metadata: Metadata = { title: 'Log progress' };

export default async function NewProgressLogPage() {
  const user = await requirePagePermission('progresslog', 'create');

  const projects = await prisma.project.findMany({
    where: { status: { notIn: ['CLOSED', 'CANCELLED'] }, ...scopeFilter(user, 'project') },
    select: { id: true, name: true },
    orderBy: { name: 'asc' },
  });

  return (
    <>
      <PageHeader
        title="Log progress"
        subtitle="One entry per project per day. Saving again for the same day updates that entry."
      />
      <ProgressLogForm projects={projects} />
    </>
  );
}
