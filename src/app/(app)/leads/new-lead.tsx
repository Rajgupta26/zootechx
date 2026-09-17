'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Plus } from 'lucide-react';
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
import { createLeadAction } from '@/server/actions/crm';

const SOURCES = [
  'WEBSITE', 'REFERRAL', 'META_ADS', 'GOOGLE_ADS', 'LINKEDIN',
  'COLD_OUTREACH', 'EVENT', 'WHATSAPP', 'OTHER',
];

export function NewLeadDialog({
  owners,
  autoOpen = false,
}: {
  owners: Array<{ id: string; name: string }>;
  /**
   * Opened straight away when arriving from the Quick action menu. The owner
   * list is loaded by the page, so the menu links here rather than carrying a
   * second copy of this form into the header.
   */
  autoOpen?: boolean;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(autoOpen);
  const [duplicateId, setDuplicateId] = useState<string | null>(null);

  const [form, setForm] = useState({
    name: '', company: '', email: '', phone: '',
    source: 'WEBSITE', status: 'NEW', estimatedValue: '',
    requirement: '', city: '', ownerId: '',
  });

  const set = (key: keyof typeof form) => (value: string) =>
    setForm((f) => ({ ...f, [key]: value }));

  const submit = () => {
    setDuplicateId(null);
    startTransition(async () => {
      const res = await createLeadAction({
        ...form,
        ownerId: form.ownerId || undefined,
        currency: 'INR',
      });

      if (!res.ok) {
        if (res.data?.duplicate) setDuplicateId(res.data.duplicate);
        toast({ title: 'Could not create lead', description: res.error, variant: 'error' });
        return;
      }

      toast({ title: 'Lead added', variant: 'success' });
      setOpen(false);
      setForm({
        name: '', company: '', email: '', phone: '', source: 'WEBSITE',
        status: 'NEW', estimatedValue: '', requirement: '', city: '', ownerId: '',
      });
      router.refresh();
    });
  };

  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <Plus />
        New lead
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New lead</DialogTitle>
            <DialogDescription>
              An email or phone number is required, and is checked against existing leads.
            </DialogDescription>
          </DialogHeader>

          {duplicateId && (
            <div className="rounded-lg border border-warning/40 bg-warning/5 p-3 text-xs">
              A matching lead already exists.{' '}
              <a href={`/leads/${duplicateId}`} className="font-medium underline">
                Open it instead
              </a>
              .
            </div>
          )}

          <div className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="l-name">Contact name</Label>
                <Input id="l-name" value={form.name} onChange={(e) => set('name')(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="l-company">Company</Label>
                <Input id="l-company" value={form.company} onChange={(e) => set('company')(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="l-email">Email</Label>
                <Input id="l-email" type="email" value={form.email} onChange={(e) => set('email')(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="l-phone">Phone</Label>
                <Input id="l-phone" value={form.phone} onChange={(e) => set('phone')(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Source</Label>
                <Select value={form.source} onValueChange={set('source')}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {SOURCES.map((s) => (
                      <SelectItem key={s} value={s}>
                        {s.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase())}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="l-value">Estimated value (₹)</Label>
                <Input
                  id="l-value" value={form.estimatedValue} inputMode="decimal"
                  onChange={(e) => set('estimatedValue')(e.target.value)}
                  className="tabular"
                />
              </div>
            </div>

            {owners.length > 0 && (
              <div className="space-y-1.5">
                <Label>Owner</Label>
                <Select value={form.ownerId} onValueChange={set('ownerId')}>
                  <SelectTrigger><SelectValue placeholder="Assign to me" /></SelectTrigger>
                  <SelectContent>
                    {owners.map((o) => (
                      <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="space-y-1.5">
              <Label htmlFor="l-req">Requirement</Label>
              <Textarea
                id="l-req" value={form.requirement}
                onChange={(e) => set('requirement')(e.target.value)}
                placeholder="What are they looking for?"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button
              onClick={submit}
              loading={pending}
              disabled={!form.name || (!form.email && !form.phone)}
            >
              Create lead
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
