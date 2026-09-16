import type { Metadata } from 'next';
import { UserCog } from 'lucide-react';
import { prisma } from '@/lib/db';
import { requirePermission } from '@/lib/session';
import { PageHeader } from '@/components/layout/app-shell';
import { Card, CardContent } from '@/components/ui/card';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { StatusBadge } from '@/components/ui/status-badge';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/misc';
import { EmptyState } from '@/components/ui/empty-state';
import { ROLE_LABELS } from '@/lib/rbac';
import { formatDate, initials } from '@/lib/utils';

export const metadata: Metadata = { title: 'Team' };

export default async function TeamPage() {
  const user = await requirePermission('user', 'read');

  const users = await prisma.user.findMany({
    where: {
      deletedAt: null,
      // A Sub Admin cannot see or manage Super Admin accounts.
      ...(user.role === 'SUB_ADMIN' ? { role: { not: 'SUPER_ADMIN' } } : {}),
    },
    orderBy: [{ role: 'asc' }, { name: 'asc' }],
    include: {
      client: { select: { name: true } },
      _count: { select: { ownedLeads: true, tasksAssigned: true, grants: true } },
    },
  });

  const staff = users.filter((u) => u.role !== 'CLIENT');
  const portal = users.filter((u) => u.role === 'CLIENT');

  return (
    <>
      <PageHeader
        title="Team"
        subtitle="Roles determine what each person can see and do. Permissions are enforced server-side."
      />

      <Card className="mb-5">
        <CardContent className="p-4">
          <h2 className="mb-3 text-sm font-semibold">Staff</h2>
          {staff.length === 0 ? (
            <EmptyState icon={UserCog} title="No staff accounts" />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Department</TableHead>
                  <TableHead>Last sign-in</TableHead>
                  <TableHead>Extra grants</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {staff.map((u) => (
                  <TableRow key={u.id}>
                    <TableCell data-label="Name">
                      <div className="flex items-center gap-2.5">
                        <Avatar className="h-7 w-7">
                          <AvatarFallback>{initials(u.name)}</AvatarFallback>
                        </Avatar>
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium">{u.name}</p>
                          <p className="truncate text-xs text-muted-foreground">{u.email}</p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell data-label="Role">
                      <Badge variant={u.role === 'SUPER_ADMIN' ? 'default' : 'secondary'}>
                        {ROLE_LABELS[u.role]}
                      </Badge>
                    </TableCell>
                    <TableCell data-label="Department" className="text-muted-foreground">
                      {u.department ?? '—'}
                    </TableCell>
                    <TableCell data-label="Last sign-in" className="text-muted-foreground">
                      {u.lastLoginAt ? formatDate(u.lastLoginAt) : 'Never'}
                    </TableCell>
                    <TableCell data-label="Extra grants" className="tabular">
                      {u._count.grants > 0 ? (
                        <Badge variant="warning">{u._count.grants}</Badge>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell data-label="Status">
                      <StatusBadge status={u.status} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {portal.length > 0 && (
        <Card>
          <CardContent className="p-4">
            <h2 className="mb-1 text-sm font-semibold">Client portal accounts</h2>
            <p className="mb-3 text-xs text-muted-foreground">
              These accounts can only reach /portal and only ever see their own company&apos;s data.
            </p>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Company</TableHead>
                  <TableHead>Last sign-in</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {portal.map((u) => (
                  <TableRow key={u.id}>
                    <TableCell data-label="Name">
                      <p className="text-sm font-medium">{u.name}</p>
                      <p className="text-xs text-muted-foreground">{u.email}</p>
                    </TableCell>
                    <TableCell data-label="Company">{u.client?.name ?? '—'}</TableCell>
                    <TableCell data-label="Last sign-in" className="text-muted-foreground">
                      {u.lastLoginAt ? formatDate(u.lastLoginAt) : 'Never'}
                    </TableCell>
                    <TableCell data-label="Status">
                      <StatusBadge status={u.status} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </>
  );
}
