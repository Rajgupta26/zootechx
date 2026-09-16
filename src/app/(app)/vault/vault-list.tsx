'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  Copy, Eye, EyeOff, ExternalLink, KeyRound, Lock, ShieldCheck,
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { useToast } from '@/components/ui/toast';
import { formatDate } from '@/lib/utils';
import {
  revealSecretAction, logCredentialCopyAction, enterSudoModeAction,
} from '@/server/actions/vault';

interface CredentialRow {
  id: string; name: string; description: string | null;
  category: string; environment: string;
  username: string | null; url: string | null;
  sensitivity: 'STANDARD' | 'CRITICAL';
  createdAt: string; rotatedAt: string | null; expiresAt: string | null;
  owner: { name: string } | null;
  _count: { accessLogs: number };
  canReveal: boolean;
}

export function VaultList({
  credentials,
  sudoActive,
}: {
  credentials: CredentialRow[];
  sudoActive: boolean;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, startTransition] = useTransition();

  const [revealed, setRevealed] = useState<Record<string, string>>({});
  const [sudoOpen, setSudoOpen] = useState(false);
  const [sudoPassword, setSudoPassword] = useState('');
  const [sudoError, setSudoError] = useState<string | null>(null);
  const [pendingReveal, setPendingReveal] = useState<string | null>(null);

  const reveal = (id: string) => {
    if (revealed[id]) {
      setRevealed((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
      return;
    }

    startTransition(async () => {
      const res = await revealSecretAction(id);

      if (!res.ok) {
        if (res.fieldErrors?.sudo) {
          // CRITICAL secret and no active sudo window — prompt for the password.
          setPendingReveal(id);
          setSudoOpen(true);
          return;
        }
        toast({ title: 'Cannot reveal', description: res.error, variant: 'error' });
        return;
      }

      setRevealed((prev) => ({ ...prev, [id]: res.data!.secret }));
    });
  };

  const confirmSudo = () => {
    setSudoError(null);
    startTransition(async () => {
      const res = await enterSudoModeAction({ password: sudoPassword });
      if (!res.ok) {
        setSudoError(res.error ?? 'Could not verify your password.');
        return;
      }
      setSudoOpen(false);
      setSudoPassword('');
      toast({ title: 'Sudo mode active for 10 minutes', variant: 'success' });
      router.refresh();

      if (pendingReveal) {
        const id = pendingReveal;
        setPendingReveal(null);
        const again = await revealSecretAction(id);
        if (again.ok) setRevealed((prev) => ({ ...prev, [id]: again.data!.secret }));
      }
    });
  };

  const copy = async (id: string, name: string) => {
    const secret = revealed[id];
    if (!secret) {
      toast({ title: 'Reveal the secret before copying', variant: 'warning' });
      return;
    }
    await navigator.clipboard.writeText(secret);
    await logCredentialCopyAction(id);
    toast({ title: `${name} copied`, description: 'This copy has been logged.', variant: 'success' });
  };

  return (
    <>
      {sudoActive && (
        <div className="mb-4 flex items-center gap-2 rounded-lg border border-success/40 bg-success/5 px-3 py-2 text-xs">
          <ShieldCheck className="h-3.5 w-3.5 text-success" />
          <span>Sudo mode is active — critical secrets can be revealed without re-entering your password.</span>
        </div>
      )}

      <div className="grid gap-3 md:grid-cols-2">
        {credentials.map((c) => {
          const isRevealed = Boolean(revealed[c.id]);
          const expired = c.expiresAt && new Date(c.expiresAt) < new Date();

          return (
            <Card key={c.id}>
              <CardContent className="p-4">
                <div className="mb-3 flex items-start justify-between gap-3">
                  <div className="flex min-w-0 items-start gap-2.5">
                    <div className="mt-0.5 shrink-0 rounded-md bg-primary/10 p-1.5">
                      <KeyRound className="h-3.5 w-3.5 text-primary" />
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{c.name}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {c.category.replace(/_/g, ' ')} · {c.environment}
                      </p>
                    </div>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    {c.sensitivity === 'CRITICAL' && (
                      <Badge variant="destructive">
                        <Lock className="mr-1 h-2.5 w-2.5" />
                        Critical
                      </Badge>
                    )}
                    {expired && <Badge variant="warning">Expired</Badge>}
                  </div>
                </div>

                {c.description && (
                  <p className="mb-3 text-xs text-muted-foreground">{c.description}</p>
                )}

                {c.username && (
                  <div className="mb-2 flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">Username</span>
                    <span className="font-mono">{c.username}</span>
                  </div>
                )}

                <div className="mb-3 rounded-md border bg-muted/40 p-2">
                  <code className="block break-all font-mono text-xs">
                    {isRevealed ? revealed[c.id] : '••••••••••••••••••••'}
                  </code>
                </div>

                <div className="flex flex-wrap items-center gap-1.5">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => reveal(c.id)}
                    disabled={!c.canReveal || pending}
                  >
                    {isRevealed ? <EyeOff /> : <Eye />}
                    {isRevealed ? 'Hide' : 'Reveal'}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => copy(c.id, c.name)}
                    disabled={!isRevealed}
                  >
                    <Copy />
                    Copy
                  </Button>
                  {c.url && (
                    <Button size="sm" variant="ghost" asChild>
                      <a href={c.url} target="_blank" rel="noreferrer">
                        <ExternalLink />
                      </a>
                    </Button>
                  )}
                  <span className="ml-auto text-[11px] text-muted-foreground">
                    {c._count.accessLogs} access{c._count.accessLogs === 1 ? '' : 'es'}
                  </span>
                </div>

                {!c.canReveal && (
                  <p className="mt-2 text-[11px] text-muted-foreground">
                    You do not have reveal access to this credential.
                  </p>
                )}

                <p className="mt-2 text-[11px] text-muted-foreground">
                  Added {formatDate(c.createdAt)}
                  {c.owner ? ` by ${c.owner.name}` : ''}
                  {c.rotatedAt ? ` · rotated ${formatDate(c.rotatedAt)}` : ''}
                </p>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Dialog open={sudoOpen} onOpenChange={setSudoOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Lock className="h-4 w-4" />
              Confirm your password
            </DialogTitle>
            <DialogDescription>
              This is a production secret. Re-enter your password to unlock critical reveals for
              the next 10 minutes.
            </DialogDescription>
          </DialogHeader>

          {sudoError && (
            <p className="rounded-lg border border-destructive/40 bg-destructive/5 p-2.5 text-xs text-destructive">
              {sudoError}
            </p>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="sudo-pw">Password</Label>
            <Input
              id="sudo-pw"
              type="password"
              value={sudoPassword}
              onChange={(e) => setSudoPassword(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && confirmSudo()}
              autoFocus
            />
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setSudoOpen(false)}>Cancel</Button>
            <Button onClick={confirmSudo} loading={pending} disabled={!sudoPassword}>
              Unlock
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
