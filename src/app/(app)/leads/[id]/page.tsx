import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import {
  ArrowLeft, Building2, Mail, MapPin, Phone, Target, User,
} from 'lucide-react';
import { prisma } from '@/lib/db';
import { requirePagePermission } from '@/lib/session';
import { scopeFilter, can } from '@/lib/rbac';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { StatusBadge } from '@/components/ui/status-badge';
import { formatMoney } from '@/lib/billing/money';
import { formatDate, formatDateTime, relativeTime } from '@/lib/utils';
import { LeadActions } from './lead-actions';
import { NoteBody, NoteComposer } from './lead-notes';

export const metadata: Metadata = { title: 'Lead' };

export default async function LeadDetail({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePagePermission('lead', 'read');
  const { id } = await params;

  const lead = await prisma.lead.findFirst({
    where: { id, deletedAt: null, ...scopeFilter(user, 'lead') },
    include: {
      owner: { select: { id: true, name: true } },
      campaign: { select: { id: true, name: true, platform: true } },
      convertedClient: { select: { id: true, name: true } },
      followUps: { orderBy: { dueAt: 'desc' }, include: { assignee: { select: { name: true } } } },
      activities: {
        orderBy: { createdAt: 'desc' },
        take: 20,
        include: { actor: { select: { name: true } } },
      },
    },
  });

  if (!lead) notFound();

  const canComment = can(user, 'lead', 'comment');

  const owners = can(user, 'lead', 'assign')
    ? await prisma.user.findMany({
        where: { role: { in: ['SALES', 'SUB_ADMIN', 'SUPER_ADMIN'] }, status: 'ACTIVE' },
        select: { id: true, name: true },
        orderBy: { name: 'asc' },
      })
    : [];

  return (
    <>
      <Button variant="ghost" size="sm" className="-ml-2 mb-3" asChild>
        <Link href="/leads">
          <ArrowLeft />
          Leads
        </Link>
      </Button>

      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-semibold tracking-tight">{lead.name}</h1>
            <StatusBadge status={lead.status} />
            <Badge variant="muted">{lead.source.replace(/_/g, ' ')}</Badge>
          </div>
          {lead.company && <p className="mt-1 text-sm text-muted-foreground">{lead.company}</p>}
        </div>

        <LeadActions
          lead={{
            id: lead.id,
            status: lead.status,
            ownerId: lead.ownerId,
            converted: Boolean(lead.convertedClientId),
          }}
          owners={owners}
          permissions={{
            canUpdate: can(user, 'lead', 'update'),
            canConvert: can(user, 'client', 'create'),
            canFollowUp: can(user, 'followup', 'create'),
          }}
        />
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          {lead.requirement && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Requirement</CardTitle>
              </CardHeader>
              <CardContent className="pt-0">
                <p className="whitespace-pre-line text-sm text-muted-foreground">{lead.requirement}</p>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Follow-ups</CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              {lead.followUps.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">
                  No follow-ups scheduled.
                </p>
              ) : (
                <ul className="divide-y">
                  {lead.followUps.map((f) => (
                    <li key={f.id} className="flex flex-wrap items-center gap-3 py-2.5">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{f.subject}</p>
                        <p className="truncate text-xs text-muted-foreground">
                          {f.channel} · {f.assignee?.name ?? 'Unassigned'}
                          {f.outcome ? ` · ${f.outcome}` : ''}
                        </p>
                      </div>
                      <StatusBadge status={f.status} />
                      <span className="text-xs text-muted-foreground">{relativeTime(f.dueAt)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Notes &amp; activity</CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              {canComment && <NoteComposer leadId={lead.id} />}

              {lead.activities.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">
                  {canComment ? 'Nothing here yet — add the first note.' : 'No activity yet.'}
                </p>
              ) : (
                <ul className="space-y-3">
                  {lead.activities.map((a) => (
                    <li key={a.id} className="flex gap-3 text-sm">
                      <span
                        className={
                          a.type === 'note'
                            ? 'mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary'
                            : 'mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-muted-foreground/40'
                        }
                      />
                      <div className="min-w-0 flex-1">
                        {a.type === 'note' ? (
                          <NoteBody text={a.body} />
                        ) : (
                          <p className="text-muted-foreground">{a.body}</p>
                        )}
                        <p className="text-xs text-muted-foreground">
                          {a.actor?.name ? `${a.actor.name} · ` : ''}
                          {formatDateTime(a.createdAt)}
                        </p>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 pt-0 text-sm">
              {lead.email && (
                <Row icon={Mail} label="Email">
                  <a href={`mailto:${lead.email}`} className="hover:underline">{lead.email}</a>
                </Row>
              )}
              {lead.phone && (
                <Row icon={Phone} label="Phone">
                  <a href={`tel:${lead.phone}`} className="hover:underline">{lead.phone}</a>
                </Row>
              )}
              {lead.city && <Row icon={MapPin} label="Location">{lead.city}</Row>}
              <Row icon={User} label="Owner">{lead.owner?.name ?? 'Unassigned'}</Row>
              {lead.estimatedValue && (
                <Row icon={Target} label="Estimated value">
                  {formatMoney(lead.estimatedValue.toString(), lead.currency)}
                </Row>
              )}
              {lead.campaign && (
                <Row icon={Target} label="Source campaign">
                  <Link href={`/marketing/campaigns/${lead.campaign.id}`} className="hover:underline">
                    {lead.campaign.name}
                  </Link>
                </Row>
              )}
              {lead.convertedClient && (
                <Row icon={Building2} label="Converted to">
                  <Link href={`/clients/${lead.convertedClient.id}`} className="hover:underline">
                    {lead.convertedClient.name}
                  </Link>
                </Row>
              )}
              {lead.lostReason && (
                <Row icon={Target} label="Lost reason">{lead.lostReason}</Row>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Timeline</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 pt-0 text-xs text-muted-foreground">
              <p>Created {formatDate(lead.createdAt)}</p>
              {lead.lastContactedAt && <p>Last contacted {formatDate(lead.lastContactedAt)}</p>}
              {lead.nextFollowUpAt && <p>Next follow-up {relativeTime(lead.nextFollowUpAt)}</p>}
              {lead.convertedAt && <p>Converted {formatDate(lead.convertedAt)}</p>}
            </CardContent>
          </Card>

        </div>
      </div>
    </>
  );
}

function Row({
  icon: Icon, label, children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-2.5">
      <Icon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
      <div className="min-w-0 flex-1">
        <p className="text-xs text-muted-foreground">{label}</p>
        <div className="truncate">{children}</div>
      </div>
    </div>
  );
}
