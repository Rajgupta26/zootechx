'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/components/ui/toast';
import { updateIssueStatusAction } from '@/server/actions/crm';

type Status = 'OPEN' | 'TRIAGED' | 'IN_PROGRESS' | 'RESOLVED' | 'CLOSED' | 'WONT_FIX';

const OPTIONS: Array<{ value: Status; label: string }> = [
  { value: 'OPEN', label: 'Open' },
  { value: 'TRIAGED', label: 'Triaged' },
  { value: 'IN_PROGRESS', label: 'In progress' },
  { value: 'RESOLVED', label: 'Resolved' },
  { value: 'CLOSED', label: 'Closed' },
  { value: 'WONT_FIX', label: "Won't fix" },
];

export function IssueStatusControl({ id, status }: { id: string; status: Status }) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, startTransition] = useTransition();

  return (
    <Select
      value={status}
      disabled={pending}
      onValueChange={(next) =>
        startTransition(async () => {
          const res = await updateIssueStatusAction(id, next as Status);
          if (!res.ok) {
            toast({ title: 'Update failed', description: res.error, variant: 'error' });
            return;
          }
          router.refresh();
        })
      }
    >
      <SelectTrigger className="h-8 w-[130px] text-xs"><SelectValue /></SelectTrigger>
      <SelectContent>
        {OPTIONS.map((o) => (
          <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
