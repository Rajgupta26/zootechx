'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Eye, EyeOff, RefreshCw, UserPlus } from 'lucide-react';
import type { Role } from '@prisma/client';
import { Button } from '@/components/ui/button';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/components/ui/toast';
import { createTeamMemberAction } from '@/server/actions/team';

/** What each role actually gets, in the reader's terms rather than the matrix's. */
const ROLE_COPY: Record<Role, string> = {
  SUPER_ADMIN: 'Everything, including the credentials vault and company settings',
  SUB_ADMIN: 'Everything day to day — no vault secrets, no settings',
  SALES: 'Their own leads and clients, proposals and invoices',
  DEVELOPER: 'Projects they are on, milestones and issues. No money',
  MARKETING: 'Campaigns, brands and leads. No money',
  CLIENT: 'A portal login for one client company — their own records only',
};

const ROLE_LABEL: Record<Role, string> = {
  SUPER_ADMIN: 'Super admin',
  SUB_ADMIN: 'Sub admin',
  SALES: 'Sales',
  DEVELOPER: 'Developer',
  MARKETING: 'Marketing',
  CLIENT: 'Client portal',
};

/** Readable, and long enough that nobody is tempted to shorten it. */
function suggestPassword(): string {
  const words = [
    'harbour', 'lantern', 'copper', 'meadow', 'falcon', 'pebble', 'cedar',
    'ripple', 'anvil', 'mosaic', 'willow', 'quartz', 'ember', 'thistle',
  ];
  const pick = () => words[Math.floor(Math.random() * words.length)];
  return `${pick()}-${pick()}-${Math.floor(Math.random() * 90 + 10)}`;
}

export function NewMemberDialog({
  assignable,
  clients,
}: {
  /** Roles this signed-in person is allowed to hand out. */
  assignable: Role[];
  clients: Array<{ id: string; name: string }>;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, startTransition] = useTransition();

  const [open, setOpen] = useState(false);
  const [errors, setErrors] = useState<Record<string, string[]>>({});
  const [reveal, setReveal] = useState(false);

  const blank = useMemo(
    () => ({
      name: '',
      email: '',
      phone: '',
      role: (assignable.includes('SALES') ? 'SALES' : assignable[0]) as Role,
      department: '',
      clientId: '',
      password: suggestPassword(),
    }),
    [assignable]
  );
  const [form, setForm] = useState(blank);

  const set = (key: keyof typeof form) => (value: string) => {
    setForm((f) => ({ ...f, [key]: value }));
    setErrors((e) => (e[key] ? { ...e, [key]: [] } : e));
  };

  const err = (key: string) => errors[key]?.[0];
  const isPortal = form.role === 'CLIENT';

  const submit = () => {
    setErrors({});
    startTransition(async () => {
      const res = await createTeamMemberAction({
        name: form.name,
        email: form.email,
        phone: form.phone || undefined,
        role: form.role,
        department: form.department || undefined,
        clientId: isPortal ? form.clientId || undefined : undefined,
        password: form.password,
        status: 'ACTIVE',
      });

      if (!res.ok) {
        setErrors(res.fieldErrors ?? {});
        const first = Object.values(res.fieldErrors ?? {}).flat()[0];
        toast({
          title: 'Could not create the account',
          description: first ?? res.error,
          variant: 'error',
        });
        return;
      }

      toast({
        title: `${res.data!.name} can now sign in`,
        description: 'Send them the email and password — the app cannot do it for you yet.',
        variant: 'success',
      });
      setOpen(false);
      setForm({ ...blank, password: suggestPassword() });
      router.refresh();
    });
  };

  return (
    <>
      <Button onClick={() => { setForm({ ...blank, password: suggestPassword() }); setOpen(true); }}>
        <UserPlus />
        Add member
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add a team member</DialogTitle>
            <DialogDescription>
              One account per person. A shared login leaves an audit trail that
              cannot say who did anything.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="m-name">Full name</Label>
                <Input
                  id="m-name" value={form.name}
                  onChange={(e) => set('name')(e.target.value)}
                  aria-invalid={Boolean(err('name'))}
                />
                {err('name') && <p className="text-xs text-destructive">{err('name')}</p>}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="m-email">Email</Label>
                <Input
                  id="m-email" type="email" value={form.email}
                  onChange={(e) => set('email')(e.target.value)}
                  aria-invalid={Boolean(err('email'))}
                  placeholder="name@zootechx.com"
                />
                {err('email') && <p className="text-xs text-destructive">{err('email')}</p>}
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Role</Label>
              <Select value={form.role} onValueChange={(v) => set('role')(v)}>
                <SelectTrigger aria-invalid={Boolean(err('role'))}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {assignable.map((r) => (
                    <SelectItem key={r} value={r}>{ROLE_LABEL[r]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">{ROLE_COPY[form.role]}</p>
              {err('role') && <p className="text-xs text-destructive">{err('role')}</p>}
            </div>

            {isPortal && (
              <div className="space-y-1.5">
                <Label>Client company</Label>
                <Select value={form.clientId} onValueChange={set('clientId')}>
                  <SelectTrigger aria-invalid={Boolean(err('clientId'))}>
                    <SelectValue placeholder="Whose records may they see?" />
                  </SelectTrigger>
                  <SelectContent>
                    {clients.map((c) => (
                      <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {err('clientId') ? (
                  <p className="text-xs text-destructive">{err('clientId')}</p>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    A portal account sees this company&apos;s projects, proposals and invoices, and
                    nothing else.
                  </p>
                )}
              </div>
            )}

            {!isPortal && (
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="m-dept">Department</Label>
                  <Input
                    id="m-dept" value={form.department}
                    onChange={(e) => set('department')(e.target.value)}
                    placeholder="Optional"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="m-phone">Phone</Label>
                  <Input
                    id="m-phone" value={form.phone}
                    onChange={(e) => set('phone')(e.target.value)}
                    placeholder="Optional"
                  />
                </div>
              </div>
            )}

            <div className="space-y-1.5">
              <Label htmlFor="m-password">Starting password</Label>
              <div className="flex gap-1.5">
                <Input
                  id="m-password"
                  type={reveal ? 'text' : 'password'}
                  value={form.password}
                  onChange={(e) => set('password')(e.target.value)}
                  aria-invalid={Boolean(err('password'))}
                  className="font-mono"
                />
                <Button
                  type="button" variant="outline" size="icon"
                  onClick={() => setReveal((r) => !r)}
                  aria-label={reveal ? 'Hide password' : 'Show password'}
                >
                  {reveal ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                </Button>
                <Button
                  type="button" variant="outline" size="icon"
                  onClick={() => set('password')(suggestPassword())}
                  aria-label="Suggest another"
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                </Button>
              </div>
              {err('password') ? (
                <p className="text-xs text-destructive">{err('password')}</p>
              ) : (
                <p className="text-xs text-muted-foreground">
                  You will have to pass this on yourself — no invitation email is sent.
                </p>
              )}
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button
              onClick={submit}
              loading={pending}
              disabled={!form.name || !form.email || (isPortal && !form.clientId)}
            >
              Create account
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
