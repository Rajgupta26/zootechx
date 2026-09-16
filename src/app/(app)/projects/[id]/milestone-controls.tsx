'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/components/ui/toast';
import { updateMilestoneAction } from '@/server/actions/crm';

type Status = 'PENDING' | 'IN_PROGRESS' | 'BLOCKED' | 'COMPLETED' | 'APPROVED';

const OPTIONS: Array<{ value: Status; label: string }> = [
  { value: 'PENDING', label: 'Pending' },
  { value: 'IN_PROGRESS', label: 'In progress' },
  { value: 'BLOCKED', label: 'Blocked' },
  { value: 'COMPLETED', label: 'Completed' },
  { value: 'APPROVED', label: 'Approved' },
];

/** Changing a milestone recomputes the project's progress percentage server-side. */
export function MilestoneControls({ id, status }: { id: string; status: Status }) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, startTransition] = useTransition();

  const change = (next: string) => {
    startTransition(async () => {
      const res = await updateMilestoneAction(id, next as Status);
      if (!res.ok) {
        toast({ title: 'Update failed', description: res.error, variant: 'error' });
        return;
      }
      toast({ title: 'Milestone updated', variant: 'success' });
      router.refresh();
    });
  };

  return (
    <Select value={status} onValueChange={change} disabled={pending}>
      <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
      <SelectContent>
        {OPTIONS.map((o) => (
          <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
