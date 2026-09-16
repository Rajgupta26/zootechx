import type { Metadata } from 'next';
import { requirePermission } from '@/lib/session';
import { getCompanyProfile } from '@/lib/billing/invoice-service';
import { PageHeader } from '@/components/layout/app-shell';
import { SettingsForm } from './settings-form';

export const metadata: Metadata = { title: 'Settings' };

export default async function SettingsPage() {
  await requirePermission('settings', 'read');
  const company = await getCompanyProfile();

  return (
    <>
      <PageHeader
        title="Settings"
        subtitle="Company details and the billing defaults the quick-invoice engine applies automatically."
      />
      <SettingsForm
        company={{
          ...company,
          defaultGstRate: Number(company.defaultGstRate),
          defaultTdsRate: Number(company.defaultTdsRate),
          updatedAt: company.updatedAt.toISOString(),
        }}
      />
    </>
  );
}
