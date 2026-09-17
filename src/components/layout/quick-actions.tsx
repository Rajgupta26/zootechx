'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronDown, Plus, Receipt, ScrollText, UserPlus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { QuickInvoiceModal } from '@/components/billing/quick-invoice-modal';
import { can, type Action, type Resource } from '@/lib/rbac';
import type { Role } from '@prisma/client';

/**
 * One button for the three things people start from anywhere.
 *
 * Only the invoice is a modal, because it is genuinely two fields and opening
 * a page for it would be the slower path. A proposal needs the paste screen
 * and a lead needs the owner list, so both are links to where that work
 * already lives rather than a second copy of the form.
 *
 * Entries the signed-in role cannot use are not shown; if none are left the
 * button does not render at all.
 */
export function QuickActions({
  role,
  grants,
  variant = 'default',
}: {
  role: Role;
  /** Optional to match `Actor`, where per-record grants may be absent. */
  grants?: string[];
  /** `onDark` sits on the ink cards, where the default button disappears. */
  variant?: 'default' | 'onDark';
}) {
  const router = useRouter();
  const [invoiceOpen, setInvoiceOpen] = useState(false);
  const actor = { role, grants };
  const allowed = (r: Resource, a: Action) => can(actor, r, a);

  const items = [
    allowed('invoice', 'create') && {
      key: 'invoice',
      label: 'Quick invoice',
      hint: 'Client and amount — GST and the PDF follow',
      icon: Receipt,
      run: () => setInvoiceOpen(true),
    },
    allowed('sow', 'create') && {
      key: 'sow',
      label: 'Quick proposal',
      hint: 'Paste the text, it becomes a Statement of Work',
      icon: ScrollText,
      run: () => router.push('/sows/new'),
    },
    allowed('lead', 'create') && {
      key: 'lead',
      label: 'New lead',
      hint: 'Someone who might buy from you',
      icon: UserPlus,
      run: () => router.push('/leads?new=1'),
    },
  ].filter(Boolean) as Array<{
    key: string; label: string; hint: string;
    icon: typeof Receipt; run: () => void;
  }>;

  if (items.length === 0) return null;

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            size="sm"
            variant={variant === 'onDark' ? 'secondary' : 'default'}
            className={variant === 'onDark' ? 'bg-background text-foreground hover:bg-background/90' : undefined}
          >
            <Plus />
            Quick action
            <ChevronDown className="opacity-60" />
          </Button>
        </DropdownMenuTrigger>

        <DropdownMenuContent align="end" className="w-64">
          {items.map((item) => (
            <DropdownMenuItem
              key={item.key}
              onSelect={item.run}
              className="flex items-start gap-2.5 py-2"
            >
              <item.icon className="mt-0.5 h-4 w-4 shrink-0" />
              <span className="min-w-0">
                <span className="block text-sm font-medium">{item.label}</span>
                <span className="block text-xs text-muted-foreground">{item.hint}</span>
              </span>
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      <QuickInvoiceModal open={invoiceOpen} onOpenChange={setInvoiceOpen} />
    </>
  );
}
