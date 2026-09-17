'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
  AlertTriangle, Bug, FolderKanban, IndianRupee, MoveUpRight,
  PhoneCall, Receipt, TrendingUp, Users, Wallet,
} from 'lucide-react';
import { CapsuleChart } from '@/components/dashboard/capsule-chart';
import { BatteryStat } from '@/components/dashboard/battery-stat';
import { DepartmentPanels } from '@/components/dashboard/department-panels';
import { StatusBadge } from '@/components/ui/status-badge';
import { QuickInvoiceButton } from '@/components/billing/quick-invoice-modal';
import { formatMoney } from '@/lib/billing/money';
import { formatDate, cn } from '@/lib/utils';
import type { getAdminDashboard, getDepartmentPanels } from '@/lib/queries/dashboard';

type Data = Awaited<ReturnType<typeof getAdminDashboard>>;
type Departments = Awaited<ReturnType<typeof getDepartmentPanels>>;

const VIEWS = ['Money', 'Pipeline', 'Delivery'] as const;
type View = (typeof VIEWS)[number];

/**
 * The Command Centre.
 *
 * Two questions sit above everything else here: how much of what we billed has
 * arrived, and what is stuck. Both are answered before the reader scrolls —
 * the capsule chart carries the first, the outstanding card the second — and
 * the tabs below move between money, pipeline and delivery without a page
 * load, because switching view should not cost a round trip.
 */
export function AdminDashboard({
  data,
  departments,
  role,
  grants,
}: {
  data: Data;
  departments: Departments;
  role: string;
  grants?: string[];
}) {
  const [view, setView] = useState<View>('Money');

  const collectionRate = data.invoicedFy > 0 ? (data.collectedFy / data.invoicedFy) * 100 : 0;
  const outstandingShare = data.invoicedFy > 0 ? (data.outstanding / data.invoicedFy) * 100 : 0;

  return (
    <div className="space-y-6">
      <Hero data={data} collectionRate={collectionRate} role={role} grants={grants} />

      <div className="flex flex-wrap items-center gap-1.5">
        {VIEWS.map((v) => (
          <button
            key={v}
            type="button"
            onClick={() => setView(v)}
            aria-pressed={view === v}
            className={cn(
              'rounded-full px-4 py-2 text-sm font-medium transition-colors',
              view === v
                ? 'bg-foreground text-background'
                : 'text-muted-foreground hover:bg-accent hover:text-foreground'
            )}
          >
            {v}
          </button>
        ))}
      </div>

      {view === 'Money' && (
        <MoneyView
          data={data}
          role={role}
          grants={grants}
          collectionRate={collectionRate}
          outstandingShare={outstandingShare}
        />
      )}
      {view === 'Pipeline' && <PipelineView data={data} />}
      {view === 'Delivery' && <DeliveryView data={data} departments={departments} />}
    </div>
  );
}

/* ---------------------------------------------------------------- hero --- */

function Hero({
  data, collectionRate, role, grants,
}: {
  data: Data; collectionRate: number; role: string; grants?: string[];
}) {
  return (
    <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
      <div className="min-w-0">
        {/*
          Names the three tabs below in the order the work happens, so the
          headline is the map rather than a label. The chip is kept with the
          word after it so the pair never breaks across a line.
        */}
        <h1 className="display max-w-[20ch] text-[2.1rem] sm:text-[2.75rem]">
          Everything you have sold, built and{' '}
          <span className="whitespace-nowrap">
            <span className="inline-flex h-9 w-9 translate-y-[0.15em] items-center justify-center rounded-full bg-highlight text-highlight-foreground sm:h-11 sm:w-11">
              <IndianRupee className="h-4 w-4 sm:h-5 sm:w-5" />
            </span>{' '}
            been paid for
          </span>
        </h1>

        <p className="mt-4 text-sm text-muted-foreground">
          <span className="font-semibold text-foreground tabular">
            {formatMoney(data.collectedFy, 'INR', { compact: true })}
          </span>{' '}
          collected of{' '}
          <span className="font-semibold text-foreground tabular">
            {formatMoney(data.invoicedFy, 'INR', { compact: true })}
          </span>{' '}
          billed · {collectionRate.toFixed(0)}% in · {data.totalLeads} leads open
        </p>
      </div>

      <div className="flex shrink-0 flex-wrap items-center gap-2">
        {data.overdueCount > 0 && (
          <Link
            href="/invoices"
            className="flex items-center gap-2 rounded-full border border-destructive/30 bg-destructive/10 px-4 py-2 text-sm font-medium text-destructive transition-colors hover:bg-destructive/15"
          >
            <AlertTriangle className="h-4 w-4" />
            {data.overdueCount} overdue
          </Link>
        )}
        <span className="rounded-full bg-muted px-4 py-2 text-sm font-medium text-muted-foreground">
          FY {data.fyLabel}
        </span>
      </div>
    </div>
  );
}

/* --------------------------------------------------------------- money --- */

function MoneyView({
  data,
  role,
  grants,
  collectionRate,
  outstandingShare,
}: {
  data: Data;
  role: string;
  grants?: string[];
  collectionRate: number;
  outstandingShare: number;
}) {
  return (
    <>
      <div className="grid gap-4 lg:grid-cols-3">
        <BatteryStat
          label="Collected"
          icon={IndianRupee}
          value={formatMoney(data.collectedFy, 'INR', { compact: true })}
          of={formatMoney(data.invoicedFy, 'INR', { compact: true })}
          percent={collectionRate}
          hint={`${data.invoiceCount} invoices issued this year`}
          href="/payments"
          tone="highlight"
        />
        <BatteryStat
          label="Outstanding"
          icon={AlertTriangle}
          value={formatMoney(data.outstanding, 'INR', { compact: true })}
          of={formatMoney(data.invoicedFy, 'INR', { compact: true })}
          percent={outstandingShare}
          hint={data.overdueCount > 0 ? `${data.overdueCount} past their due date` : 'Nothing overdue'}
          href="/invoices"
        />
        <BillingCta
          expenses={role === 'SUPER_ADMIN' ? data.expensesFy : null}
          fyLabel={data.fyLabel}
          role={role}
          grants={grants}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Panel title="Invoiced vs collected" className="lg:col-span-2">
          <CapsuleChart data={data.revenueSeries} />
        </Panel>

        <Panel title="Recent invoices" action={{ label: 'All invoices', href: '/invoices' }}>
          {data.recentInvoices.length === 0 ? (
            <Empty>No invoices yet. Raise one with Quick invoice.</Empty>
          ) : (
            <ul className="-mx-2 divide-y divide-border/70">
              {data.recentInvoices.map((inv) => (
                <li key={inv.id}>
                  <Link
                    href={`/invoices/${inv.id}`}
                    className="flex items-center gap-3 rounded-lg px-2 py-2.5 transition-colors hover:bg-accent/60"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{inv.clientName}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {inv.number} · due {formatDate(inv.dueDate)}
                      </p>
                    </div>
                    <StatusBadge status={inv.status} />
                    <span className="shrink-0 text-sm font-semibold tabular">
                      {formatMoney(inv.total, inv.currency, { compact: true })}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
    </>
  );
}

/** The black card in the reference's third slot, doing real work. */
function BillingCta({
  expenses, fyLabel, role, grants,
}: {
  expenses: number | null; fyLabel: string; role: string; grants?: string[];
}) {
  return (
    <div className="flex flex-col justify-between rounded-card bg-foreground p-5 text-background">
      <div>
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-background/10">
          <Receipt className="h-4 w-4" />
        </span>
        <p className="display mt-5 max-w-[15rem] text-[1.6rem]">
          Bill a client in two fields
        </p>
        <p className="mt-2 max-w-[18rem] text-sm text-background/60">
          Name and amount. GST, the invoice number and the PDF are worked out for you.
        </p>
      </div>

      <div className="mt-6 flex items-center justify-between gap-3">
        <QuickInvoiceButton className="bg-background text-foreground hover:bg-background/90" />
        {expenses !== null && (
          <Link
            href="/expenses"
            className="flex items-center gap-1.5 text-xs text-background/60 transition-colors hover:text-background"
          >
            <Wallet className="h-3.5 w-3.5" />
            {formatMoney(expenses, 'INR', { compact: true })} spent in {fyLabel}
            <MoveUpRight className="h-3 w-3" />
          </Link>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------ pipeline --- */

function PipelineView({ data }: { data: Data }) {
  const stages = Object.entries(data.leadsByStatus);

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <BatteryStat
        label="Pipeline value"
        icon={TrendingUp}
        value={formatMoney(data.pipelineValue, 'INR', { compact: true })}
        percent={data.conversionRate}
        hint={`${data.totalLeads} leads · ${data.conversionRate.toFixed(0)}% won`}
        href="/leads"
        tone="highlight"
      />
      <BatteryStat
        label="Overdue follow-ups"
        icon={PhoneCall}
        value={String(data.overdueFollowUps)}
        percent={data.overdueFollowUps > 0 ? 100 : 0}
        hint={data.overdueFollowUps > 0 ? 'Someone is waiting to hear back' : 'Everyone has been called back'}
        href="/follow-ups"
      />

      <Panel title="By stage" className="lg:row-span-2">
        {stages.length === 0 ? (
          <Empty>No leads yet.</Empty>
        ) : (
          <div className="space-y-3">
            {stages.map(([status, count]) => {
              const pct = data.totalLeads > 0 ? (count / data.totalLeads) * 100 : 0;
              return (
                <div key={status}>
                  <div className="mb-1.5 flex items-center justify-between text-xs">
                    <span className="capitalize text-muted-foreground">
                      {status.replace(/_/g, ' ').toLowerCase()}
                    </span>
                    <span className="font-semibold tabular">{count}</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-muted">
                    <div className="h-full rounded-full bg-foreground" style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })}
            <Link
              href="/leads"
              className="mt-4 flex items-center justify-center gap-1.5 rounded-full bg-foreground px-4 py-2.5 text-sm font-medium text-background transition-opacity hover:opacity-90"
            >
              <Users className="h-4 w-4" />
              Open leads
            </Link>
          </div>
        )}
      </Panel>

      <Panel title="Where the money is sitting" className="lg:col-span-2">
        <CapsuleChart data={data.revenueSeries} />
      </Panel>
    </div>
  );
}

/* ------------------------------------------------------------ delivery --- */

function DeliveryView({ data, departments }: { data: Data; departments: Departments }) {
  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <BatteryStat
          label="Active projects"
          icon={FolderKanban}
          value={String(data.activeProjects)}
          percent={data.activeProjects > 0 ? 100 : 0}
          hint="Currently being built"
          href="/projects"
          tone="highlight"
        />
        <BatteryStat
          label="Open issues"
          icon={Bug}
          value={String(data.openIssues)}
          percent={data.openIssues > 0 ? 100 : 0}
          hint={data.openIssues > 0 ? 'Waiting on a developer' : 'Nothing open'}
          href="/issues"
        />
        <BatteryStat
          label="Overdue follow-ups"
          icon={PhoneCall}
          value={String(data.overdueFollowUps)}
          percent={data.overdueFollowUps > 0 ? 100 : 0}
          hint="Across the whole team"
          href="/follow-ups"
        />
      </div>

      <DepartmentPanels data={departments} />
    </div>
  );
}

/* ------------------------------------------------------------- shared --- */

function Panel({
  title,
  action,
  className,
  children,
}: {
  title: string;
  action?: { label: string; href: string };
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <section className={cn('rounded-card border bg-card p-5', className)}>
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="text-base font-semibold tracking-tight">{title}</h2>
        {action && (
          <Link
            href={action.href}
            className="flex items-center gap-1 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            {action.label}
            <MoveUpRight className="h-3 w-3" />
          </Link>
        )}
      </div>
      {children}
    </section>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="py-10 text-center text-sm text-muted-foreground">{children}</p>;
}
