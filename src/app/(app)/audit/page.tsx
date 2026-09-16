import type { Metadata } from 'next';
import { ShieldAlert, ShieldCheck, ScrollText } from 'lucide-react';
import { prisma } from '@/lib/db';
import { requirePermission } from '@/lib/session';
import { verifyAuditChain } from '@/lib/audit';
import { PageHeader } from '@/components/layout/app-shell';
import { Card, CardContent } from '@/components/ui/card';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Pagination } from '@/components/ui/pagination';
import { EmptyState } from '@/components/ui/empty-state';
import { formatDateTime, paginate, pageCount } from '@/lib/utils';
import { ROLE_LABELS } from '@/lib/rbac';
import type { Prisma } from '@prisma/client';

export const metadata: Metadata = { title: 'Audit log' };

/** Colour-code by what the action touches. */
function actionTone(action: string): 'destructive' | 'warning' | 'success' | 'muted' {
  if (action.includes('delete') || action.includes('revoke') || action.includes('denied')) return 'destructive';
  if (action.includes('reveal') || action.includes('sudo') || action.includes('copy')) return 'warning';
  if (action.includes('sign') || action.includes('payment') || action.includes('approve')) return 'success';
  return 'muted';
}

export default async function AuditPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; entity?: string; action?: string }>;
}) {
  await requirePermission('audit', 'read');
  const params = await searchParams;
  const { skip, take, page } = paginate(params.page, 50);

  const where: Prisma.AuditLogWhereInput = {
    ...(params.entity ? { entity: params.entity } : {}),
    ...(params.action ? { action: { contains: params.action } } : {}),
  };

  const [entries, total, integrity] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      orderBy: { seq: 'desc' },
      skip,
      take,
      include: { actor: { select: { name: true } } },
    }),
    prisma.auditLog.count({ where }),
    // Replaying the chain proves no row was edited or deleted.
    verifyAuditChain(2000),
  ]);

  return (
    <>
      <PageHeader
        title="Audit log"
        subtitle="Append-only and hash-chained. Every entry links to the one before it."
      />

      <Card
        className={`mb-5 ${
          integrity.valid ? 'border-success/40 bg-success/5' : 'border-destructive/40 bg-destructive/5'
        }`}
      >
        <CardContent className="flex items-start gap-3 p-4">
          {integrity.valid ? (
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-success" />
          ) : (
            <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
          )}
          <div className="text-sm">
            <p className="font-medium">
              {integrity.valid
                ? `Chain verified across ${integrity.checked} entries`
                : 'Chain integrity check FAILED'}
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {integrity.valid
                ? 'Each entry hashes the one before it, so a deleted or modified row would break the chain.'
                : `The chain breaks at sequence ${integrity.brokenAtSeq}. An entry has been altered or removed — investigate immediately.`}
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-4">
          {entries.length === 0 ? (
            <EmptyState icon={ScrollText} title="No audit entries" description="Activity will be recorded here." />
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-16">#</TableHead>
                    <TableHead>When</TableHead>
                    <TableHead>Actor</TableHead>
                    <TableHead>Action</TableHead>
                    <TableHead>Summary</TableHead>
                    <TableHead>IP</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {entries.map((e) => (
                    <TableRow key={e.id}>
                      <TableCell data-label="#" className="font-mono text-xs text-muted-foreground">
                        {e.seq.toString()}
                      </TableCell>
                      <TableCell data-label="When" className="whitespace-nowrap text-xs text-muted-foreground">
                        {formatDateTime(e.createdAt)}
                      </TableCell>
                      <TableCell data-label="Actor">
                        <p className="text-sm">{e.actor?.name ?? e.actorEmail ?? 'System'}</p>
                        {e.actorRole && (
                          <p className="text-xs text-muted-foreground">{ROLE_LABELS[e.actorRole]}</p>
                        )}
                      </TableCell>
                      <TableCell data-label="Action">
                        <Badge variant={actionTone(e.action)}>{e.action}</Badge>
                      </TableCell>
                      <TableCell data-label="Summary" className="max-w-[420px] text-sm">
                        {e.summary}
                      </TableCell>
                      <TableCell data-label="IP" className="font-mono text-xs text-muted-foreground">
                        {e.ip ?? '—'}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>

              <Pagination page={page} pageCount={pageCount(total, 50)} total={total} pageSize={50} />
            </>
          )}
        </CardContent>
      </Card>
    </>
  );
}
