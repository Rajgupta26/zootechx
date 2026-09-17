'use client';

import { useState, useTransition } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/components/ui/toast';
import { changeMyPasswordAction } from '@/server/actions/account';

const MIN = 12;

export function ChangePassword() {
  const { toast } = useToast();
  const [pending, startTransition] = useTransition();
  const [reveal, setReveal] = useState(false);
  const [errors, setErrors] = useState<Record<string, string[]>>({});
  const [done, setDone] = useState(false);

  const [form, setForm] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  });

  const set = (key: keyof typeof form) => (value: string) => {
    setForm((f) => ({ ...f, [key]: value }));
    setErrors((e) => (e[key] ? { ...e, [key]: [] } : e));
    setDone(false);
  };

  const err = (key: string) => errors[key]?.[0];

  const submit = () => {
    setErrors({});
    startTransition(async () => {
      const res = await changeMyPasswordAction(form);

      if (!res.ok) {
        setErrors(res.fieldErrors ?? {});
        const first = Object.values(res.fieldErrors ?? {}).flat()[0];
        toast({
          title: 'Password not changed',
          description: first ?? res.error,
          variant: 'error',
        });
        return;
      }

      setForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
      setDone(true);
      toast({ title: 'Password changed', variant: 'success' });
    });
  };

  const ready =
    form.currentPassword.length > 0 &&
    form.newPassword.length >= MIN &&
    form.confirmPassword.length > 0;

  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <Label htmlFor="a-current">Current password</Label>
        <Input
          id="a-current"
          type="password"
          autoComplete="current-password"
          value={form.currentPassword}
          onChange={(e) => set('currentPassword')(e.target.value)}
          aria-invalid={Boolean(err('currentPassword'))}
        />
        {err('currentPassword') && (
          <p className="text-xs text-destructive">{err('currentPassword')}</p>
        )}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="a-new">New password</Label>
        <div className="flex gap-1.5">
          <Input
            id="a-new"
            type={reveal ? 'text' : 'password'}
            autoComplete="new-password"
            value={form.newPassword}
            onChange={(e) => set('newPassword')(e.target.value)}
            aria-invalid={Boolean(err('newPassword'))}
          />
          <Button
            type="button" variant="outline" size="icon"
            onClick={() => setReveal((r) => !r)}
            aria-label={reveal ? 'Hide password' : 'Show password'}
          >
            {reveal ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
          </Button>
        </div>
        {err('newPassword') ? (
          <p className="text-xs text-destructive">{err('newPassword')}</p>
        ) : (
          <p className="text-xs text-muted-foreground">
            At least {MIN} characters. A phrase of a few words beats a short scramble.
          </p>
        )}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="a-confirm">New password again</Label>
        <Input
          id="a-confirm"
          type={reveal ? 'text' : 'password'}
          autoComplete="new-password"
          value={form.confirmPassword}
          onChange={(e) => set('confirmPassword')(e.target.value)}
          aria-invalid={Boolean(err('confirmPassword'))}
        />
        {err('confirmPassword') && (
          <p className="text-xs text-destructive">{err('confirmPassword')}</p>
        )}
      </div>

      <div className="flex items-center gap-3 pt-1">
        <Button onClick={submit} loading={pending} disabled={!ready}>
          Change password
        </Button>
        {done && <p className="text-xs text-success">Saved. Use it next time you sign in.</p>}
      </div>
    </div>
  );
}
