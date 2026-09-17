'use client';

import { useMemo, useState, useTransition } from 'react';
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
import { createProjectAction } from '@/server/actions/crm';

/** Sentinel: Radix refuses an empty string as a SelectItem value. */
const NONE = '__none';

const PRIORITIES = ['LOW', 'MEDIUM', 'HIGH', 'URGENT'] as const;

export interface ProjectSow {
  id: string;
  number: string;
  title: string;
  clientId: string;
  milestoneCount: number;
}

export function NewProjectDialog({
  clients,
  leads,
  sows,
  autoOpen = false,
  fromSowId,
}: {
  clients: Array<{ id: string; name: string }>;
  /** Who can be tech lead — developers, plus admins who run delivery. */
  leads: Array<{ id: string; name: string }>;
  /** Signed proposals only. Anything unsigned is not yet work to deliver. */
  sows: ProjectSow[];
  autoOpen?: boolean;
  /**
   * Set when arriving from "Start project" on a signed proposal. The proposal
   * fixes the client, so that field is filled and locked.
   */
  fromSowId?: string;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, startTransition] = useTransition();

  const preset = fromSowId ? sows.find((s) => s.id === fromSowId) : undefined;
  const [open, setOpen] = useState(autoOpen);
  const [errors, setErrors] = useState<Record<string, string[]>>({});

  const [form, setForm] = useState({
    name: preset?.title ?? '',
    clientId: preset?.clientId ?? '',
    sowId: preset?.id ?? NONE,
    leadDevId: '',
    priority: 'MEDIUM',
    startDate: '',
    targetEndDate: '',
    budgetHours: '',
    description: '',
  });

  const set = (key: keyof typeof form) => (value: string) => {
    setForm((f) => ({ ...f, [key]: value }));
    setErrors((e) => (e[key] ? { ...e, [key]: [] } : e));
  };

  /** A proposal belongs to one client, so changing the client drops it. */
  const setClient = (clientId: string) => {
    setForm((f) => ({
      ...f,
      clientId,
      sowId: f.sowId !== NONE && sows.find((s) => s.id === f.sowId)?.clientId !== clientId
        ? NONE
        : f.sowId,
    }));
    setErrors((e) => (e.clientId ? { ...e, clientId: [] } : e));
  };

  /** Picking a proposal names the project, unless a name was typed already. */
  const setSow = (sowId: string) => {
    const sow = sows.find((s) => s.id === sowId);
    setForm((f) => ({
      ...f,
      sowId,
      clientId: sow?.clientId ?? f.clientId,
      name: f.name.trim() || sow?.title || '',
    }));
    setErrors((e) => (e.sowId ? { ...e, sowId: [] } : e));
  };

  const available = useMemo(
    () => (form.clientId ? sows.filter((s) => s.clientId === form.clientId) : sows),
    [sows, form.clientId]
  );

  const chosenSow = form.sowId === NONE ? undefined : sows.find((s) => s.id === form.sowId);
  const err = (key: string) => errors[key]?.[0];

  const submit = () => {
    setErrors({});
    startTransition(async () => {
      const res = await createProjectAction({
        name: form.name,
        clientId: form.clientId,
        sowId: form.sowId === NONE ? undefined : form.sowId,
        leadDevId: form.leadDevId || undefined,
        priority: form.priority,
        status: 'PLANNING',
        startDate: form.startDate || undefined,
        targetEndDate: form.targetEndDate || undefined,
        budgetHours: form.budgetHours || undefined,
        description: form.description || undefined,
      });

      if (!res.ok) {
        setErrors(res.fieldErrors ?? {});
        const first = Object.values(res.fieldErrors ?? {}).flat()[0];
        toast({
          title: 'Could not create project',
          description: first ?? res.error,
          variant: 'error',
        });
        return;
      }

      const { id, code, milestonesCopied } = res.data!;
      toast({
        title: `${code} created`,
        description: milestonesCopied
          ? `${milestonesCopied} milestone${milestonesCopied === 1 ? '' : 's'} carried over from the proposal.`
          : undefined,
        variant: 'success',
      });
      setOpen(false);
      router.push(`/projects/${id}`);
    });
  };

  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <Plus />
        New project
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New project</DialogTitle>
            <DialogDescription>
              Link a signed proposal and its payment milestones become the delivery
              schedule. Progress is then derived from those milestones.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Client</Label>
              <Select value={form.clientId} onValueChange={setClient} disabled={Boolean(preset)}>
                <SelectTrigger aria-invalid={Boolean(err('clientId'))}>
                  <SelectValue placeholder="Choose a client" />
                </SelectTrigger>
                <SelectContent>
                  {clients.map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {err('clientId') && <p className="text-xs text-destructive">{err('clientId')}</p>}
            </div>

            <div className="space-y-1.5">
              <Label>Statement of work</Label>
              <Select value={form.sowId} onValueChange={setSow} disabled={Boolean(preset)}>
                <SelectTrigger aria-invalid={Boolean(err('sowId'))}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>No proposal</SelectItem>
                  {available.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.number} — {s.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {err('sowId') ? (
                <p className="text-xs text-destructive">{err('sowId')}</p>
              ) : (
                <p className="text-xs text-muted-foreground">
                  {chosenSow
                    ? chosenSow.milestoneCount > 0
                      ? `${chosenSow.milestoneCount} payment milestone${chosenSow.milestoneCount === 1 ? '' : 's'} will be copied in.`
                      : 'This proposal has no milestones, so the project starts empty.'
                    : available.length === 0
                      ? 'No signed proposals for this client.'
                      : 'Optional. Only signed proposals are listed.'}
                </p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="p-name">Project name</Label>
              <Input
                id="p-name" value={form.name}
                onChange={(e) => set('name')(e.target.value)}
                aria-invalid={Boolean(err('name'))}
                placeholder="What is being built"
              />
              {err('name') && <p className="text-xs text-destructive">{err('name')}</p>}
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Tech lead</Label>
                <Select value={form.leadDevId} onValueChange={set('leadDevId')}>
                  <SelectTrigger><SelectValue placeholder="Assign later" /></SelectTrigger>
                  <SelectContent>
                    {leads.map((l) => (
                      <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label>Priority</Label>
                <Select value={form.priority} onValueChange={set('priority')}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {PRIORITIES.map((p) => (
                      <SelectItem key={p} value={p}>
                        {p.charAt(0) + p.slice(1).toLowerCase()}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="p-start">Start date</Label>
                <Input
                  id="p-start" type="date" value={form.startDate}
                  onChange={(e) => set('startDate')(e.target.value)}
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="p-end">Target delivery</Label>
                <Input
                  id="p-end" type="date" value={form.targetEndDate}
                  onChange={(e) => set('targetEndDate')(e.target.value)}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="p-hours">Budget hours</Label>
              <Input
                id="p-hours" value={form.budgetHours} inputMode="decimal"
                onChange={(e) => set('budgetHours')(e.target.value)}
                className="tabular"
                placeholder="Optional"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="p-desc">Description</Label>
              <Textarea
                id="p-desc" value={form.description}
                onChange={(e) => set('description')(e.target.value)}
                placeholder="What the team needs to know before they start"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={submit} loading={pending} disabled={!form.name || !form.clientId}>
              Create project
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
