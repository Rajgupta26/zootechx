'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Save } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input, Textarea } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/misc';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/components/ui/toast';
import { createProgressLogAction } from '@/server/actions/crm';

export function ProgressLogForm({ projects }: { projects: Array<{ id: string; name: string }> }) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, startTransition] = useTransition();

  const [form, setForm] = useState({
    projectId: projects[0]?.id ?? '',
    logDate: new Date().toISOString().slice(0, 10),
    hoursSpent: '8',
    summary: '',
    blockers: '',
    nextSteps: '',
    clientVisible: false,
  });

  const submit = () => {
    startTransition(async () => {
      const res = await createProgressLogAction({
        ...form,
        hoursSpent: Number(form.hoursSpent),
        blockers: form.blockers || undefined,
        nextSteps: form.nextSteps || undefined,
      });
      if (!res.ok) {
        toast({ title: 'Could not save log', description: res.error, variant: 'error' });
        return;
      }
      toast({ title: 'Progress logged', variant: 'success' });
      router.push('/progress-logs');
    });
  };

  if (projects.length === 0) {
    return (
      <Card>
        <CardContent className="p-8 text-center text-sm text-muted-foreground">
          You are not assigned to any active projects.
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="max-w-2xl">
      <CardContent className="space-y-4 p-5">
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="space-y-1.5 sm:col-span-2">
            <Label>Project</Label>
            <Select value={form.projectId} onValueChange={(v) => setForm({ ...form, projectId: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {projects.map((p) => (
                  <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="hours">Hours</Label>
            <Input
              id="hours" type="number" step="0.5" min="0" max="24"
              value={form.hoursSpent}
              onChange={(e) => setForm({ ...form, hoursSpent: e.target.value })}
              className="tabular"
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="date">Date</Label>
          <Input
            id="date" type="date" value={form.logDate}
            onChange={(e) => setForm({ ...form, logDate: e.target.value })}
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="summary">What did you work on?</Label>
          <Textarea
            id="summary" value={form.summary}
            onChange={(e) => setForm({ ...form, summary: e.target.value })}
            placeholder="Reworked the points expiry job to handle tier transitions in one pass."
            className="min-h-[100px]"
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="blockers">Blockers (optional)</Label>
          <Textarea
            id="blockers" value={form.blockers}
            onChange={(e) => setForm({ ...form, blockers: e.target.value })}
            placeholder="Waiting on sandbox rate limits being raised."
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="next">Next steps (optional)</Label>
          <Textarea
            id="next" value={form.nextSteps}
            onChange={(e) => setForm({ ...form, nextSteps: e.target.value })}
          />
        </div>

        <div className="flex items-start justify-between gap-3 rounded-lg border p-3">
          <div>
            <Label htmlFor="visible">Share with the client</Label>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Shown on the client portal timeline. Keep internal notes unshared.
            </p>
          </div>
          <Switch
            id="visible"
            checked={form.clientVisible}
            onCheckedChange={(v) => setForm({ ...form, clientVisible: v })}
          />
        </div>

        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => router.back()}>Cancel</Button>
          <Button onClick={submit} loading={pending} disabled={form.summary.trim().length < 5}>
            <Save />
            Save log
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
