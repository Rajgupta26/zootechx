'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { signIn } from 'next-auth/react';
import { AlertCircle, Info } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

const DEMO_ACCOUNTS = [
  { label: 'Super Admin', email: 'admin@xcc.test' },
  { label: 'Sub Admin', email: 'ops@xcc.test' },
  { label: 'Sales', email: 'sales@xcc.test' },
  { label: 'Developer', email: 'dev@xcc.test' },
  { label: 'Marketing', email: 'marketing@xcc.test' },
  { label: 'Client', email: 'client@northwind.test' },
];

export function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const callbackUrl = params.get('callbackUrl');
  // Set by /api/auth/invalidate when a session was terminated server-side —
  // the account was suspended, deleted, or the database was reseeded.
  const expired = params.get('expired') === '1';

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const res = await signIn('credentials', { email, password, redirect: false });

    if (res?.error) {
      setError('That email and password combination did not work.');
      setLoading(false);
      return;
    }

    router.push(callbackUrl ?? '/');
    router.refresh();
  };

  return (
    <>
      <form onSubmit={submit} className="mt-8 space-y-4">
        {expired && !error && (
          <div className="flex items-start gap-2 rounded-lg border bg-muted/50 p-3 text-sm">
            <Info className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
            <span className="text-muted-foreground">
              Your session ended because the account is no longer active. Sign in again.
            </span>
          </div>
        )}
        {error && (
          <div className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <div className="space-y-1.5">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@company.com"
            autoComplete="email"
            required
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="password">Password</Label>
          <Input
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            autoComplete="current-password"
            required
          />
        </div>

        <Button type="submit" className="w-full" loading={loading}>
          Sign in
        </Button>
      </form>

      {process.env.NODE_ENV !== 'production' && (
        <div className="mt-8 rounded-lg border bg-muted/40 p-3">
          <p className="mb-2 text-xs font-medium text-muted-foreground">
            Seeded demo accounts — password <code className="rounded bg-background px-1 py-0.5">password123</code>
          </p>
          <div className="grid grid-cols-2 gap-1">
            {DEMO_ACCOUNTS.map((a) => (
              <button
                key={a.email}
                type="button"
                onClick={() => {
                  setEmail(a.email);
                  setPassword('password123');
                }}
                className="rounded px-2 py-1 text-left text-xs transition-colors hover:bg-accent"
              >
                <span className="block font-medium">{a.label}</span>
                <span className="block truncate text-muted-foreground">{a.email}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </>
  );
}
