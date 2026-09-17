import type { Metadata } from 'next';
import { prisma } from '@/lib/db';
import { requirePagePermission } from '@/lib/session';
import { PageHeader } from '@/components/layout/app-shell';
import { PasteProposalForm } from './paste-form';

export const metadata: Metadata = { title: 'New proposal' };

export default async function NewSowPage() {
  await requirePagePermission('sow', 'create');

  const clients = await prisma.client.findMany({
    where: { deletedAt: null },
    select: { id: true, name: true },
    orderBy: { name: 'asc' },
  });

  return (
    <>
      <PageHeader
        title="New proposal"
        subtitle="Paste your write-up and it will be laid out on the ZootechX letterhead."
      />
      <PasteProposalForm clients={clients} />
    </>
  );
}
