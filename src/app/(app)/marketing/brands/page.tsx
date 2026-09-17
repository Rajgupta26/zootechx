import type { Metadata } from 'next';
import Link from 'next/link';
import { Palette } from 'lucide-react';
import { prisma } from '@/lib/db';
import { requirePermission } from '@/lib/session';
import { scopeFilter } from '@/lib/rbac';
import { PageHeader } from '@/components/layout/app-shell';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/empty-state';
import { formatMoney, toMinor, toNumber } from '@/lib/billing/money';

export const metadata: Metadata = { title: 'Brands' };

export default async function BrandsPage() {
  const user = await requirePermission('brand', 'read');

  const brands = await prisma.brand.findMany({
    where: scopeFilter(user, 'brand'),
    orderBy: { name: 'asc' },
    include: {
      client: { select: { id: true, name: true } },
      campaigns: { select: { spend: true, revenue: true, status: true } },
      _count: { select: { campaigns: true } },
    },
  });

  return (
    <>
      <PageHeader
        title="Brands"
        subtitle="Each brand groups campaigns and brand assets, and links back to a CRM client."
      />

      {brands.length === 0 ? (
        <Card>
          <EmptyState icon={Palette} title="No brands" description="Add a brand to start running campaigns." />
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {brands.map((b) => {
            const spend = toNumber(b.campaigns.reduce((a, c) => a + toMinor(c.spend.toString()), 0n));
            const revenue = toNumber(b.campaigns.reduce((a, c) => a + toMinor(c.revenue.toString()), 0n));
            const roas = spend > 0 ? revenue / spend : 0;
            const active = b.campaigns.filter((c) => c.status === 'ACTIVE').length;

            return (
              <Card key={b.id}>
                <CardContent className="p-4">
                  <div className="mb-3 flex items-start gap-3">
                    <div
                      className="h-9 w-9 shrink-0 rounded-lg"
                      style={{
                        background: `linear-gradient(135deg, ${b.primaryColor ?? '#4F46E5'}, ${b.secondaryColor ?? '#0EA5E9'})`,
                      }}
                    />
                    <div className="min-w-0">
                      <p className="truncate font-medium">{b.name}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {b.industry ?? 'No industry set'}
                      </p>
                    </div>
                  </div>

                  {b.client && (
                    <Link
                      href={`/clients/${b.client.id}`}
                      className="mb-3 block truncate text-xs text-primary hover:underline"
                    >
                      {b.client.name}
                    </Link>
                  )}

                  <div className="mb-3 grid grid-cols-3 gap-2 text-center">
                    <Metric label="Spend" value={formatMoney(spend, 'INR', { compact: true })} />
                    <Metric label="Revenue" value={formatMoney(revenue, 'INR', { compact: true })} />
                    <Metric label="ROAS" value={`${roas.toFixed(2)}×`} />
                  </div>

                  <div className="flex flex-wrap gap-1.5">
                    <Badge variant="muted">{b._count.campaigns} campaigns</Badge>
                    {active > 0 && <Badge variant="success">{active} active</Badge>}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md bg-muted/50 p-2">
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="text-sm font-semibold tabular">{value}</p>
    </div>
  );
}
