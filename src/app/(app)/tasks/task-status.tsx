'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/components/ui/toast';
import { updateTaskStatusAction } from '@/server/actions/crm';

type Status = 'TODO' | 'IN_PROGRESS' | 'BLOCKED' | 'REVIEW' | 'DONE' | 'CANCELLED';

const OPTIONS: Array<{ value: Status; label: string }> = [
  { value: 'TODO', label: 'To do' },
  { value: 'IN_PROGRESS', label: 'In progress' },
  { value: 'BLOCKED', label: 'Blocked' },
  { value: 'REVIEW', label: 'Review' },
  { value: 'DONE', label: 'Done' },
];

export function TaskStatusControl({ id, status }: { id: string; status: Status }) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, startTransition] = useTransition();

  const change = (next: string) => {
    startTransition(async () => {
      const res = await updateTaskStatusAction(id, next as Status);
      if (!res.ok) {
        toast({ title: 'Update failed', description: res.error, variant: 'error' });
        return;
      }
      router.refresh();
    });
  };

  return (
    <Select value={status} onValueChange={change} disabled={pending}>
      <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
      <SelectContent>
        {OPTIONS.map((o) => (
          <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
