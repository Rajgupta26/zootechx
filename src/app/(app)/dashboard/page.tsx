import type { Metadata } from 'next';
import { requireAuth } from '@/lib/session';
import { PageHeader } from '@/components/layout/app-shell';
import { DASHBOARD_TITLES } from '@/components/layout/nav-config';
import {
  getAdminDashboard, getSalesDashboard,
  getDeveloperDashboard, getMarketingDashboard,
} from '@/lib/queries/dashboard';
import { AdminDashboard } from './admin-dashboard';
import { SalesDashboard } from './sales-dashboard';
import { DeveloperDashboard } from './developer-dashboard';
import { MarketingDashboard } from './marketing-dashboard';

export const metadata: Metadata = { title: 'Dashboard' };

/**
 * One route, six workspaces. The role decides which aggregate query runs, so a
 * sales user never triggers the org-wide finance rollup.
 */
export default async function DashboardPage() {
  const user = await requireAuth();
  const copy = DASHBOARD_TITLES[user.role];

  return (
    <>
      <PageHeader title={copy.title} subtitle={copy.subtitle} />
      {(user.role === 'SUPER_ADMIN' || user.role === 'SUB_ADMIN') && (
        <AdminDashboard data={await getAdminDashboard()} role={user.role} />
      )}
      {user.role === 'SALES' && <SalesDashboard data={await getSalesDashboard(user)} />}
      {user.role === 'DEVELOPER' && <DeveloperDashboard data={await getDeveloperDashboard(user)} />}
      {user.role === 'MARKETING' && <MarketingDashboard data={await getMarketingDashboard()} />}
    </>
  );
}
