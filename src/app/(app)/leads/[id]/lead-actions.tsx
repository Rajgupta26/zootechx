'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowRightLeft, CalendarPlus, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Input, Textarea } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/components/ui/toast';
import {
  updateLeadAction, convertLeadAction, createFollowUpAction,
} from '@/server/actions/crm';

const STATUSES = [
  'NEW', 'CONTACTED', 'QUALIFIED', 'PROPOSAL_SENT', 'NEGOTIATION', 'WON', 'LOST', 'DORMANT',
];

export function LeadActions({
  lead,
  owners,
  permissions,
}: {
  lead: { id: string; status: string; ownerId: string | null; converted: boolean };
  owners: Array<{ id: string; name: string }>;
  permissions: { canUpdate: boolean; canConvert: boolean; canFollowUp: boolean };
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, startTransition] = useTransition();

  const [followUpOpen, setFollowUpOpen] = useState(false);
  const [fu, setFu] = useState({
    channel: 'CALL', subject: '', notes: '',
    dueAt: new Date(Date.now() + 86_400_000).toISOString().slice(0, 16),
  });

  const changeStatus = (status: string) => {
    startTransition(async () => {
      const res = await updateLeadAction(lead.id, { status });
      if (!res.ok) {
        toast({ title: 'Update failed', description: res.error, variant: 'error' });
        return;
      }
      toast({ title: `Moved to ${status.replace(/_/g, ' ').toLowerCase()}`, variant: 'success' });
      router.refresh();
    });
  };

  const changeOwner = (ownerId: string) => {
    startTransition(async () => {
      const res = await updateLeadAction(lead.id, { ownerId });
      if (!res.ok) {
        toast({ title: 'Reassign failed', description: res.error, variant: 'error' });
        return;
      }
      toast({ title: 'Owner updated', variant: 'success' });
      router.refresh();
    });
  };

  const convert = () => {
    startTransition(async () => {
      const res = await convertLeadAction(lead.id);
      if (!res.ok) {
        toast({ title: 'Could not convert', description: res.error, variant: 'error' });
        return;
      }
      toast({ title: 'Lead converted to a client', variant: 'success' });
      router.push(`/clients/${res.data!.clientId}`);
    });
  };

  const scheduleFollowUp = () => {
    startTransition(async () => {
      const res = await createFollowUpAction({
        leadId: lead.id,
        channel: fu.channel,
        subject: fu.subject,
        notes: fu.notes || undefined,
        dueAt: new Date(fu.dueAt).toISOString(),
      });
      if (!res.ok) {
        toast({ title: 'Could not schedule', description: res.error, variant: 'error' });
        return;
      }
      toast({ title: 'Follow-up scheduled', variant: 'success' });
      setFollowUpOpen(false);
      setFu({ ...fu, subject: '', notes: '' });
      router.refresh();
    });
  };

  return (
    <div className="flex shrink-0 flex-wrap items-center gap-2">
      {permissions.canUpdate && (
        <Select value={lead.status} onValueChange={changeStatus}>
          <SelectTrigger className="w-[150px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            {STATUSES.map((s) => (
              <SelectItem key={s} value={s}>
                {s.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase())}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      {owners.length > 0 && (
        <Select value={lead.ownerId ?? ''} onValueChange={changeOwner}>
          <SelectTrigger className="w-[150px]"><SelectValue placeholder="Owner" /></SelectTrigger>
          <SelectContent>
            {owners.map((o) => (
              <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      {permissions.canFollowUp && (
        <Button variant="outline" onClick={() => setFollowUpOpen(true)}>
          <CalendarPlus />
          Follow-up
        </Button>
      )}

      {permissions.canConvert && !lead.converted && (
        <Button onClick={convert} loading={pending}>
          <ArrowRightLeft />
          Convert to client
        </Button>
      )}

      {lead.converted && (
        <span className="flex items-center gap-1 text-xs text-success">
          <Check className="h-3.5 w-3.5" />
          Converted
        </span>
      )}

      <Dialog open={followUpOpen} onOpenChange={setFollowUpOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Schedule follow-up</DialogTitle>
            <DialogDescription>
              It lands in your follow-up queue and appears on the dashboard when overdue.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Channel</Label>
                <Select value={fu.channel} onValueChange={(v) => setFu({ ...fu, channel: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="CALL">Call</SelectItem>
                    <SelectItem value="EMAIL">Email</SelectItem>
                    <SelectItem value="WHATSAPP">WhatsApp</SelectItem>
                    <SelectItem value="MEETING">Meeting</SelectItem>
                    <SelectItem value="SMS">SMS</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="fu-due">Due</Label>
                <Input
                  id="fu-due" type="datetime-local" value={fu.dueAt}
                  onChange={(e) => setFu({ ...fu, dueAt: e.target.value })}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="fu-subject">Subject</Label>
              <Input
                id="fu-subject" value={fu.subject}
                onChange={(e) => setFu({ ...fu, subject: e.target.value })}
                placeholder="Discovery call — confirm budget and timeline"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="fu-notes">Notes</Label>
              <Textarea
                id="fu-notes" value={fu.notes}
                onChange={(e) => setFu({ ...fu, notes: e.target.value })}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setFollowUpOpen(false)}>Cancel</Button>
            <Button onClick={scheduleFollowUp} loading={pending} disabled={!fu.subject}>
              Schedule
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
