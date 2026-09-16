'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/components/ui/toast';
import { completeFollowUpAction } from '@/server/actions/crm';

export function CompleteFollowUp({ id, subject }: { id: string; subject: string }) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [outcome, setOutcome] = useState('');

  const complete = () => {
    startTransition(async () => {
      const res = await completeFollowUpAction(id, outcome);
      if (!res.ok) {
        toast({ title: 'Could not complete', description: res.error, variant: 'error' });
        return;
      }
      toast({ title: 'Follow-up completed', variant: 'success' });
      setOpen(false);
      setOutcome('');
      router.refresh();
    });
  };

  return (
    <>
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
        <Check />
        Done
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Complete follow-up</DialogTitle>
            <DialogDescription>{subject}</DialogDescription>
          </DialogHeader>

          <div className="space-y-1.5">
            <Label htmlFor="outcome">What happened?</Label>
            <Textarea
              id="outcome" value={outcome}
              onChange={(e) => setOutcome(e.target.value)}
              placeholder="Discussed scope; they want a revised proposal by Friday."
              autoFocus
            />
            <p className="text-xs text-muted-foreground">
              This is written to the lead&apos;s activity timeline.
            </p>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={complete} loading={pending} disabled={!outcome.trim()}>
              Mark complete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
