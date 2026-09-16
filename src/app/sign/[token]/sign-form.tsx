'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { AlertCircle, CheckCircle2, PenLine } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { signSowAction } from '@/server/actions/sow';

const CONSENT_TEXT =
  'I confirm that I am authorised to sign on behalf of the client, that I have read and agree ' +
  'to this Statement of Work, and that this electronic signature is legally binding and has the ' +
  'same effect as a handwritten signature.';

export function SignForm({ token, sowNumber }: { token: string; sowNumber: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const [signerName, setSignerName] = useState('');
  const [signerEmail, setSignerEmail] = useState('');
  const [signerTitle, setSignerTitle] = useState('');
  const [signature, setSignature] = useState('');
  const [consent, setConsent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    startTransition(async () => {
      const res = await signSowAction({
        token, signerName, signerEmail,
        signerTitle: signerTitle || undefined,
        signature, consent,
      });

      if (!res.ok) {
        setError(res.error ?? 'Could not record the signature.');
        return;
      }
      setDone(true);
      router.refresh();
    });
  };

  if (done) {
    return (
      <div className="mt-6 rounded-xl border border-success/40 bg-success/5 p-6 text-center">
        <CheckCircle2 className="mx-auto mb-3 h-8 w-8 text-success" />
        <h2 className="text-base font-semibold">{sowNumber} signed</h2>
        <p className="mt-1.5 text-sm text-muted-foreground">
          Thank you. A copy has been recorded and your account team has been notified.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="mt-6 rounded-xl border bg-card p-6">
      <div className="mb-5 flex items-center gap-2">
        <PenLine className="h-4 w-4 text-primary" />
        <h2 className="text-base font-semibold">Sign this document</h2>
      </div>

      {error && (
        <div className="mb-4 flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="s-name">Full name</Label>
          <Input
            id="s-name" value={signerName} required
            onChange={(e) => setSignerName(e.target.value)}
            placeholder="Priya Sharma"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="s-email">Email</Label>
          <Input
            id="s-email" type="email" value={signerEmail} required
            onChange={(e) => setSignerEmail(e.target.value)}
            placeholder="priya@company.com"
          />
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="s-title">Title (optional)</Label>
          <Input
            id="s-title" value={signerTitle}
            onChange={(e) => setSignerTitle(e.target.value)}
            placeholder="Director, Operations"
          />
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="s-sign">Type your full name to sign</Label>
          <Input
            id="s-sign" value={signature} required
            onChange={(e) => setSignature(e.target.value)}
            placeholder="Your signature"
            className="font-serif text-lg italic"
          />
        </div>
      </div>

      <label className="mt-4 flex cursor-pointer items-start gap-2.5 rounded-lg bg-muted/40 p-3">
        <input
          type="checkbox"
          checked={consent}
          onChange={(e) => setConsent(e.target.checked)}
          className="mt-0.5 h-4 w-4 shrink-0 rounded border-input accent-[hsl(var(--primary))]"
          required
        />
        <span className="text-xs leading-relaxed text-muted-foreground">{CONSENT_TEXT}</span>
      </label>

      <p className="mt-3 text-xs text-muted-foreground">
        Your name, email, IP address, browser and the exact document contents are recorded with
        your signature as proof of agreement.
      </p>

      <Button
        type="submit"
        className="mt-5 w-full"
        loading={pending}
        disabled={!consent || !signerName || !signerEmail || !signature}
      >
        Sign {sowNumber}
      </Button>
    </form>
  );
}
