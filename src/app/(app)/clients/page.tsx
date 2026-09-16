import type { Metadata } from 'next';
import Link from 'next/link';
import { Building2 } from 'lucide-react';
import { prisma } from '@/lib/db';
import { requirePermission } from '@/lib/session';
import { can } from '@/lib/rbac';
import { PageHeader } from '@/components/layout/app-shell';
import { Card, CardContent } from '@/components/ui/card';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Pagination } from '@/components/ui/pagination';
import { EmptyState } from '@/components/ui/empty-state';
import { formatMoney, toMinor, toNumber } from '@/lib/billing/money';
import { paginate, pageCount } from '@/lib/utils';
import type { Prisma } from '@prisma/client';

export const metadata: Metadata = { title: 'Clients' };

export default async function ClientsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; q?: string }>;
}) {
  const user = await requirePermission('client', 'read');
  const params = await searchParams;
  const { skip, take, page } = paginate(params.page);

  const where: Prisma.ClientWhereInput = {
    deletedAt: null,
    ...(params.q
      ? {
          OR: [
            { name: { contains: params.q, mode: 'insensitive' } },
            { legalName: { contains: params.q, mode: 'insensitive' } },
            { email: { contains: params.q, mode: 'insensitive' } },
          ],
        }
      : {}),
  };

  const [clients, total] = await Promise.all([
    prisma.client.findMany({
      where,
      orderBy: { name: 'asc' },
      skip,
      take,
      include: {
        accountManager: { select: { name: true } },
        _count: { select: { projects: true, invoices: true } },
        invoices: {
          where: { status: { in: ['SENT', 'PARTIALLY_PAID', 'OVERDUE'] } },
          select: { balanceDue: true, currency: true },
        },
      },
    }),
    prisma.client.count({ where }),
  ]);

  return (
    <>
      <PageHeader
        title="Clients"
        subtitle="The billing directory. Place of supply here drives the GST split on every invoice."
      />

      <Card>
        <CardContent className="p-4">
          {clients.length === 0 ? (
            <EmptyState
              icon={Building2}
              title="No clients yet"
              description="Convert a won lead, or a client is created automatically the first time you invoice a new name."
            />
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Client</TableHead>
                    <TableHead>Place of supply</TableHead>
                    <TableHead>GSTIN</TableHead>
                    <TableHead>Account manager</TableHead>
                    <TableHead className="text-right">Projects</TableHead>
                    <TableHead className="text-right">Outstanding</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {clients.map((c) => {
                    const outstanding = toNumber(
                      c.invoices.reduce((acc, i) => acc + toMinor(i.balanceDue.toString()), 0n)
                    );
                    return (
                      <TableRow key={c.id}>
                        <TableCell data-label="Client">
                          <Link href={`/clients/${c.id}`} className="font-medium hover:underline">
                            {c.name}
                          </Link>
                          <p className="truncate text-xs text-muted-foreground">{c.email}</p>
                        </TableCell>
                        <TableCell data-label="Place of supply">
                          {c.country !== 'India' ? (
                            <Badge variant="warning">{c.country} · export</Badge>
                          ) : (
                            <span className="text-sm text-muted-foreground">
                              {c.stateName ?? 'Not set'}
                            </span>
                          )}
                        </TableCell>
                        <TableCell data-label="GSTIN" className="font-mono text-xs">
                          {c.gstin ?? '—'}
                        </TableCell>
                        <TableCell data-label="Account manager" className="text-muted-foreground">
                          {c.accountManager?.name ?? '—'}
                        </TableCell>
                        <TableCell data-label="Projects" className="text-right tabular">
                          {c._count.projects}
                        </TableCell>
                        <TableCell data-label="Outstanding" className="text-right tabular">
                          {outstanding > 0 ? (
                            <span className="font-medium">{formatMoney(outstanding, c.currency)}</span>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
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
