'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Ban, Copy, Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/components/ui/toast';
import { shareSowAction, revokeSowLinksAction } from '@/server/actions/sow';

export function SowActions({
  sowId, status, clientEmail, hasActiveLink, permissions,
}: {
  sowId: string;
  status: string;
  clientEmail: string;
  hasActiveLink: boolean;
  permissions: { canSend: boolean; canUpdate: boolean };
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, startTransition] = useTransition();

  const [shareOpen, setShareOpen] = useState(false);
  const [email, setEmail] = useState(clientEmail);
  const [expiryDays, setExpiryDays] = useState('30');
  const [generated, setGenerated] = useState<string | null>(null);

  const signed = status === 'SIGNED';

  const share = () => {
    startTransition(async () => {
      const res = await shareSowAction(sowId, {
        email: email || undefined,
        expiryDays: Number(expiryDays) || 30,
      });
      if (!res.ok) {
        toast({ title: 'Could not share', description: res.error, variant: 'error' });
        return;
      }
      setGenerated(res.data!.url);
      toast({ title: 'Signing link sent', variant: 'success' });
      router.refresh();
    });
  };

  const revoke = () => {
    startTransition(async () => {
      const res = await revokeSowLinksAction(sowId);
      if (!res.ok) {
        toast({ title: 'Could not revoke', description: res.error, variant: 'error' });
        return;
      }
      toast({
        title: `${res.data!.revoked} link(s) revoked`,
        description: 'Anyone with the old link now sees a revoked notice.',
        variant: 'success',
      });
      router.refresh();
    });
  };

  return (
    <div className="flex shrink-0 flex-wrap items-center gap-2">
      {permissions.canSend && !signed && (
        <Button onClick={() => { setGenerated(null); setShareOpen(true); }}>
          <Send />
          {hasActiveLink ? 'Resend link' : 'Send for signature'}
        </Button>
      )}

      {permissions.canUpdate && hasActiveLink && !signed && (
        <Button variant="outline" onClick={revoke} loading={pending}>
          <Ban />
          Revoke links
        </Button>
      )}

      <Dialog open={shareOpen} onOpenChange={setShareOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Send for signature</DialogTitle>
            <DialogDescription>
              Creates a tokenised link with an expiry. The client can review and sign without an
              account.
            </DialogDescription>
          </DialogHeader>

          {generated ? (
            <div className="space-y-2">
              <Label>Signing link</Label>
              <div className="flex items-center gap-2 rounded-lg border p-2.5">
                <p className="min-w-0 flex-1 truncate text-sm">{generated}</p>
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={() => {
                    navigator.clipboard.writeText(generated);
                    toast({ title: 'Link copied', variant: 'success' });
                  }}
                  aria-label="Copy link"
                >
                  <Copy className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="s-email">Send to</Label>
                <Input
                  id="s-email" type="email" value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="client@company.com"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="s-expiry">Link expires after (days)</Label>
                <Input
                  id="s-expiry" type="number" min="1" max="365"
                  value={expiryDays}
                  onChange={(e) => setExpiryDays(e.target.value)}
                />
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setShareOpen(false)}>
              {generated ? 'Done' : 'Cancel'}
            </Button>
            {!generated && (
              <Button onClick={share} loading={pending}>
                <Send />
                Create &amp; send
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
