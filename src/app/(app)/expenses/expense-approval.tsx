'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Check, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';
import { approveExpenseAction } from '@/server/actions/crm';

export function ExpenseApproval({ id }: { id: string }) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, startTransition] = useTransition();

  const decide = (approve: boolean) => {
    startTransition(async () => {
      const res = await approveExpenseAction(id, approve);
      if (!res.ok) {
        toast({ title: 'Action failed', description: res.error, variant: 'error' });
        return;
      }
      toast({ title: approve ? 'Expense approved' : 'Expense rejected', variant: 'success' });
      router.refresh();
    });
  };

  return (
    <div className="flex justify-end gap-1">
      <Button size="icon" variant="ghost" onClick={() => decide(true)} disabled={pending} aria-label="Approve">
        <Check className="h-3.5 w-3.5 text-success" />
      </Button>
      <Button size="icon" variant="ghost" onClick={() => decide(false)} disabled={pending} aria-label="Reject">
        <X className="h-3.5 w-3.5 text-destructive" />
      </Button>
    </div>
  );
}
