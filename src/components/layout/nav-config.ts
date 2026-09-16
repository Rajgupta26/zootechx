import {
  LayoutDashboard, Users, Building2, PhoneCall, ScrollText,
  FolderKanban, ListChecks, Receipt, Wallet, CreditCard, KeyRound,
  Megaphone, Palette, UserCog, ScrollIcon, Settings, Bug, ClipboardList,
  TrendingUp, type LucideIcon,
} from 'lucide-react';
import type { Resource, Action } from '@/lib/rbac';

/**
 * Navigation is derived from the same permission matrix the server enforces,
 * so a link can never appear for a page the user would be blocked from.
 */
export interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
  permission: [Resource, Action];
}

export interface NavSection {
  heading: string;
  items: NavItem[];
}

export const NAV_SECTIONS: NavSection[] = [
  {
    heading: 'Overview',
    items: [
      { label: 'Dashboard', href: '/dashboard', icon: LayoutDashboard, permission: ['dashboard', 'read'] },
    ],
  },
  {
    heading: 'Sales',
    items: [
      { label: 'Leads', href: '/leads', icon: Users, permission: ['lead', 'read'] },
      { label: 'Follow-ups', href: '/follow-ups', icon: PhoneCall, permission: ['followup', 'read'] },
      { label: 'Clients', href: '/clients', icon: Building2, permission: ['client', 'read'] },
      { label: 'SOWs', href: '/sows', icon: ScrollText, permission: ['sow', 'read'] },
    ],
  },
  {
    heading: 'Software',
    items: [
      { label: 'Projects', href: '/projects', icon: FolderKanban, permission: ['project', 'read'] },
      { label: 'Issues', href: '/issues', icon: Bug, permission: ['issue', 'read'] },
      { label: 'Progress logs', href: '/progress-logs', icon: ClipboardList, permission: ['progresslog', 'read'] },
      { label: 'Tasks', href: '/tasks', icon: ListChecks, permission: ['task', 'read'] },
    ],
  },
  {
    heading: 'Finance',
    items: [
      { label: 'Invoices', href: '/invoices', icon: Receipt, permission: ['invoice', 'read'] },
      { label: 'Payments', href: '/payments', icon: CreditCard, permission: ['payment', 'read'] },
      { label: 'Expenses', href: '/expenses', icon: Wallet, permission: ['expense', 'read'] },
    ],
  },
  {
    heading: 'Marketing',
    items: [
      { label: 'Brands', href: '/marketing/brands', icon: Palette, permission: ['brand', 'read'] },
      { label: 'Campaigns', href: '/marketing/campaigns', icon: Megaphone, permission: ['campaign', 'read'] },
      { label: 'Ad studio', href: '/marketing/studio', icon: TrendingUp, permission: ['creative', 'read'] },
    ],
  },
  {
    heading: 'Administration',
    items: [
      { label: 'Vault', href: '/vault', icon: KeyRound, permission: ['credential', 'read'] },
      { label: 'Team', href: '/team', icon: UserCog, permission: ['user', 'read'] },
      { label: 'Audit log', href: '/audit', icon: ScrollIcon, permission: ['audit', 'read'] },
      { label: 'Settings', href: '/settings', icon: Settings, permission: ['settings', 'read'] },
    ],
  },
];

/** Role-specific dashboard titles, matching the spec's named workspaces. */
export const DASHBOARD_TITLES: Record<string, { title: string; subtitle: string }> = {
  SUPER_ADMIN: { title: 'Command Centre', subtitle: 'Full operational view across every department' },
  SUB_ADMIN: { title: 'Operations Desk', subtitle: 'Day-to-day delivery, billing and team throughput' },
  SALES: { title: 'Sales Radar', subtitle: 'Your pipeline, follow-ups and conversions' },
  DEVELOPER: { title: 'Dev Pulse', subtitle: 'Your projects, issues and delivery status' },
  MARKETING: { title: 'Marketing Overview', subtitle: 'Campaign performance, spend and creative pipeline' },
  CLIENT: { title: 'Client Portal', subtitle: 'Your projects, documents and invoices' },
};
