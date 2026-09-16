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
import { createCredentialAction } from '@/server/actions/vault';

export function NewCredentialDialog() {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);

  const [form, setForm] = useState({
    name: '', description: '', category: 'api_key',
    environment: 'production', username: '', url: '',
    secret: '', sensitivity: 'STANDARD',
  });

  const set = (key: keyof typeof form) => (value: string) =>
    setForm((f) => ({ ...f, [key]: value }));

  const submit = () => {
    startTransition(async () => {
      const res = await createCredentialAction(form);
      if (!res.ok) {
        toast({ title: 'Could not save', description: res.error, variant: 'error' });
        return;
      }
      toast({ title: 'Credential encrypted and stored', variant: 'success' });
      setOpen(false);
      setForm({
        name: '', description: '', category: 'api_key', environment: 'production',
        username: '', url: '', secret: '', sensitivity: 'STANDARD',
      });
      router.refresh();
    });
  };

  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <Plus />
        Add credential
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add credential</DialogTitle>
            <DialogDescription>
              The secret is encrypted with AES-256-GCM before it touches the database.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="c-name">Name</Label>
              <Input
                id="c-name" value={form.name}
                onChange={(e) => set('name')(e.target.value)}
                placeholder="Razorpay — Production"
              />
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Category</Label>
                <Select value={form.category} onValueChange={set('category')}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="api_key">API key</SelectItem>
                    <SelectItem value="payment_gateway">Payment gateway</SelectItem>
                    <SelectItem value="database">Database</SelectItem>
                    <SelectItem value="email">Email</SelectItem>
                    <SelectItem value="storage">Storage</SelectItem>
                    <SelectItem value="marketing">Marketing</SelectItem>
                    <SelectItem value="other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Environment</Label>
                <Select value={form.environment} onValueChange={set('environment')}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="production">Production</SelectItem>
                    <SelectItem value="staging">Staging</SelectItem>
                    <SelectItem value="development">Development</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="c-secret">Secret</Label>
              <Textarea
                id="c-secret" value={form.secret}
                onChange={(e) => set('secret')(e.target.value)}
                placeholder="Paste the key or connection string"
                className="font-mono text-xs"
              />
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="c-user">Username (optional)</Label>
                <Input id="c-user" value={form.username} onChange={(e) => set('username')(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Sensitivity</Label>
                <Select value={form.sensitivity} onValueChange={set('sensitivity')}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="STANDARD">Standard</SelectItem>
                    <SelectItem value="CRITICAL">Critical — requires re-auth</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="c-url">Dashboard URL (optional)</Label>
              <Input
                id="c-url" value={form.url}
                onChange={(e) => set('url')(e.target.value)}
                placeholder="https://dashboard.example.com"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={submit} loading={pending} disabled={!form.name || !form.secret}>
              Encrypt &amp; save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
