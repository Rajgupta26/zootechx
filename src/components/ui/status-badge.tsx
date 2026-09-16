import { Badge, type BadgeProps } from './badge';

/**
 * Status → colour mapping for every enum the app displays.
 * Centralised so an invoice's "PAID" is the same green everywhere it appears.
 */
const VARIANTS: Record<string, BadgeProps['variant']> = {
  // Invoice
  DRAFT: 'muted', PENDING_APPROVAL: 'warning', SENT: 'default',
  PARTIALLY_PAID: 'warning', PAID: 'success', OVERDUE: 'destructive',
  CANCELLED: 'muted', WRITTEN_OFF: 'muted',
  // Payment
  PENDING: 'warning', SUCCESS: 'success', FAILED: 'destructive', REFUNDED: 'muted',
  // Lead
  NEW: 'default', CONTACTED: 'secondary', QUALIFIED: 'default',
  PROPOSAL_SENT: 'warning', NEGOTIATION: 'warning', WON: 'success',
  LOST: 'destructive', DORMANT: 'muted',
  // SOW / Quotation
  VIEWED: 'secondary', SIGNED: 'success', ACCEPTED: 'success',
  REJECTED: 'destructive', EXPIRED: 'muted', REVOKED: 'destructive',
  // Project / Milestone
  PLANNING: 'secondary', IN_PROGRESS: 'default', ON_HOLD: 'warning',
  QA: 'warning', DELIVERED: 'success', CLOSED: 'muted',
  COMPLETED: 'success', APPROVED: 'success', BLOCKED: 'destructive',
  // Task / Issue
  TODO: 'muted', REVIEW: 'warning', DONE: 'success',
  OPEN: 'destructive', TRIAGED: 'warning', RESOLVED: 'success', WONT_FIX: 'muted',
  // Priority
  LOW: 'muted', MEDIUM: 'secondary', HIGH: 'warning', URGENT: 'destructive',
  // Campaign / Creative
  ACTIVE: 'success', PAUSED: 'warning', ARCHIVED: 'muted',
  LIVE: 'success',
  // Message
  QUEUED: 'muted', SENDING: 'warning', DELIVERED_MSG: 'success', DEAD_LETTER: 'destructive',
  // User
  INVITED: 'warning', SUSPENDED: 'destructive',
  // Expense
  SUBMITTED: 'warning', REIMBURSED: 'success',
};

export function StatusBadge({ status, className }: { status: string; className?: string }) {
  const label = status.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
  return (
    <Badge variant={VARIANTS[status] ?? 'secondary'} className={className}>
      {label}
    </Badge>
  );
}
