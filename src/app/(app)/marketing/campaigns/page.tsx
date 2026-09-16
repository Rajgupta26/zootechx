import type { Metadata } from 'next';
import Link from 'next/link';
import { Megaphone } from 'lucide-react';
import { prisma } from '@/lib/db';
import { requirePermission } from '@/lib/session';
import { scopeFilter } from '@/lib/rbac';
import { PageHeader } from '@/components/layout/app-shell';
import { Card, CardContent } from '@/components/ui/card';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { StatusBadge } from '@/components/ui/status-badge';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/empty-state';
import { Pagination } from '@/components/ui/pagination';
import { formatMoney } from '@/lib/billing/money';
import { paginate, pageCount } from '@/lib/utils';

export const metadata: Metadata = { title: 'Campaigns' };

export default async function CampaignsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const user = await requirePermission('campaign', 'read');
  const params = await searchParams;
  const { skip, take, page } = paginate(params.page);
  const where = scopeFilter(user, 'campaign');

  const [campaigns, total] = await Promise.all([
    prisma.campaign.findMany({
      where,
      orderBy: [{ status: 'asc' }, { spend: 'desc' }],
      skip,
      take,
      include: {
        brand: { select: { id: true, name: true } },
        _count: { select: { leads: true, creatives: true } },
      },
    }),
    prisma.campaign.count({ where }),
  ]);

  return (
    <>
      <PageHeader
        title="Campaigns"
        subtitle="Budget, spend and ROAS by platform. Leads sync straight into the CRM pipeline."
      />

      <Card>
        <CardContent className="p-4">
          {campaigns.length === 0 ? (
            <EmptyState icon={Megaphone} title="No campaigns" description="Create a campaign against a brand." />
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Campaign</TableHead>
                    <TableHead>Platform</TableHead>
                    <TableHead className="text-right">Budget</TableHead>
                    <TableHead className="text-right">Spend</TableHead>
                    <TableHead className="text-right">ROAS</TableHead>
                    <TableHead className="text-right">Leads</TableHead>
                    <TableHead className="text-right">CPL</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {campaigns.map((c) => {
                    const spend = Number(c.spend);
                    const revenue = Number(c.revenue);
                    const roas = spend > 0 ? revenue / spend : 0;
                    const cpl = c._count.leads > 0 ? spend / c._count.leads : 0;

                    return (
                      <TableRow key={c.id}>
                        <TableCell data-label="Campaign">
                          <Link href={`/marketing/campaigns/${c.id}`} className="font-medium hover:underline">
                            {c.name}
                          </Link>
                          <Link
                            href={`/marketing/brands`}
                            className="block truncate text-xs text-muted-foreground hover:underline"
                          >
                            {c.brand.name}
                          </Link>
                        </TableCell>
                        <TableCell data-label="Platform">
                          <Badge variant="muted">{c.platform}</Badge>
                        </TableCell>
                        <TableCell data-label="Budget" className="text-right tabular">
                          {formatMoney(c.budget.toString(), c.currency, { compact: true })}
                        </TableCell>
                        <TableCell data-label="Spend" className="text-right font-medium tabular">
                          {formatMoney(spend, c.currency, { compact: true })}
                        </TableCell>
                        <TableCell data-label="ROAS" className="text-right tabular">
                          <span
                            className={
                              roas >= 2 ? 'font-medium text-success' : roas >= 1 ? 'text-warning' : 'text-destructive'
                            }
                          >
                            {roas.toFixed(2)}×
                          </span>
                        </TableCell>
                        <TableCell data-label="Leads" className="text-right tabular">
                          {c._count.leads}
                        </TableCell>
                        <TableCell data-label="CPL" className="text-right tabular">
                          {cpl > 0 ? formatMoney(cpl, c.currency, { compact: true }) : '—'}
                        </TableCell>
                        <TableCell data-label="Status">
                          <StatusBadge status={c.status} />
                        </TableCell>
                      </TableRow>
                    );
                  })}
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
