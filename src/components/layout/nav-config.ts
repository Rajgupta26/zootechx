import {
  Bug, Building2, ClipboardList, CreditCard, FolderKanban, KeyRound,
  LayoutDashboard, ListChecks, Megaphone, Palette, PhoneCall, Receipt,
  ScrollIcon, ScrollText, Settings, TrendingUp, UserCog, Users, Wallet,
  type LucideIcon,
} from 'lucide-react';
import type { Resource, Action } from '@/lib/rbac';

/**
 * Navigation.
 *
 * Grouped rather than flat: nineteen sidebar entries meant users had to
 * remember which of six headings held the page they wanted. Now there are
 * seven doors, and the pages inside a group appear as tabs once you are in it.
 *
 * Every route keeps its original URL — the grouping is presentation only, so
 * existing links and bookmarks still work.
 */

export interface NavChild {
  label: string;
  href: string;
  icon: LucideIcon;
  permission: [Resource, Action];
  /** Shown under the tab strip to explain what this page is for. */
  hint?: string;
}

export interface NavGroup {
  label: string;
  icon: LucideIcon;
  /** Pages inside the group. A group with one child renders no tab strip. */
  children: NavChild[];
}

export const NAV_GROUPS: NavGroup[] = [
  {
    label: 'Dashboard',
    icon: LayoutDashboard,
    children: [
      { label: 'Dashboard', href: '/dashboard', icon: LayoutDashboard, permission: ['dashboard', 'read'] },
    ],
  },
  {
    label: 'Sales',
    icon: Users,
    children: [
      { label: 'Leads', href: '/leads', icon: Users, permission: ['lead', 'read'],
        hint: 'People who might buy from you' },
      { label: 'Follow-ups', href: '/follow-ups', icon: PhoneCall, permission: ['followup', 'read'],
        hint: 'Calls and emails you owe someone' },
      { label: 'Clients', href: '/clients', icon: Building2, permission: ['client', 'read'],
        hint: 'Companies you invoice' },
      { label: 'Proposals', href: '/sows', icon: ScrollText, permission: ['sow', 'read'],
        hint: 'Scope and price, sent for signature' },
    ],
  },
  {
    label: 'Software',
    icon: FolderKanban,
    children: [
      { label: 'Projects', href: '/projects', icon: FolderKanban, permission: ['project', 'read'],
        hint: 'Work you are building for clients' },
      { label: 'Issues', href: '/issues', icon: Bug, permission: ['issue', 'read'],
        hint: 'Bugs and defects to fix' },
      { label: 'Daily logs', href: '/progress-logs', icon: ClipboardList, permission: ['progresslog', 'read'],
        hint: 'What each person did today' },
    ],
  },
  {
    label: 'Money',
    icon: Receipt,
    children: [
      { label: 'Invoices', href: '/invoices', icon: Receipt, permission: ['invoice', 'read'],
        hint: 'What you have billed' },
      { label: 'Payments', href: '/payments', icon: CreditCard, permission: ['payment', 'read'],
        hint: 'What has actually come in' },
      { label: 'Expenses', href: '/expenses', icon: Wallet, permission: ['expense', 'read'],
        hint: 'What you have spent' },
    ],
  },
  {
    label: 'Marketing',
    icon: Megaphone,
    children: [
      { label: 'Campaigns', href: '/marketing/campaigns', icon: Megaphone, permission: ['campaign', 'read'],
        hint: 'Ads running, and what they cost' },
      { label: 'Brands', href: '/marketing/brands', icon: Palette, permission: ['brand', 'read'],
        hint: 'Who you run campaigns for' },
      { label: 'Ad studio', href: '/marketing/studio', icon: TrendingUp, permission: ['creative', 'read'],
        hint: 'Write an ad and preview it' },
    ],
  },
  {
    label: 'My tasks',
    icon: ListChecks,
    children: [
      { label: 'My tasks', href: '/tasks', icon: ListChecks, permission: ['task', 'read'] },
    ],
  },
  {
    label: 'Admin',
    icon: Settings,
    children: [
      { label: 'Team', href: '/team', icon: UserCog, permission: ['user', 'read'],
        hint: 'Who can sign in, and what they can see' },
      { label: 'Passwords', href: '/vault', icon: KeyRound, permission: ['credential', 'read'],
        hint: 'Shared logins and keys, encrypted' },
      { label: 'Activity log', href: '/audit', icon: ScrollIcon, permission: ['audit', 'read'],
        hint: 'Every change, and who made it' },
      { label: 'Settings', href: '/settings', icon: Settings, permission: ['settings', 'read'],
        hint: 'Company details and invoice defaults' },
    ],
  },
];

/** The group that owns a path, for highlighting and for the tab strip. */
export function findGroupForPath(pathname: string): NavGroup | undefined {
  return NAV_GROUPS.find((g) =>
    g.children.some((c) => pathname === c.href || pathname.startsWith(`${c.href}/`))
  );
}

/** Role-specific dashboard titles, matching the spec's named workspaces. */
export const DASHBOARD_TITLES: Record<string, { title: string; subtitle: string }> = {
  SUPER_ADMIN: { title: 'Command Centre', subtitle: 'Full operational view across every department' },
  SUB_ADMIN: { title: 'Operations Desk', subtitle: 'Day-to-day delivery, billing and team throughput' },
  SALES: { title: 'Sales Radar', subtitle: 'Your pipeline, follow-ups and conversions' },
  DEVELOPER: { title: 'Dev Pulse', subtitle: 'Your projects, issues and delivery status' },
  MARKETING: { title: 'Marketing Overview', subtitle: 'Campaign performance, spend and creative pipeline' },
  CLIENT: { title: 'Client Portal', subtitle: 'Your projects, documents and invoices' },
};
