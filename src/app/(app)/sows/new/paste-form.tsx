'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { AlertTriangle, ClipboardPaste, FileText, Wand2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input, Textarea } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/components/ui/toast';
import { formatMoney } from '@/lib/billing/money';
import { previewSowTextAction, createSowFromTextAction } from '@/server/actions/sow';

interface Parsed {
  title: string | null;
  sections: Array<{
    number: number | null;
    title: string;
    body: string[];
    table?: { columns: string[]; rows: string[][] };
  }>;
  detectedValue: string | null;
  warnings: string[];
}

const SAMPLE = `Statement of Work (SOW)
DoIT AI Catalogue Chatbot & Lead Management

1. Introduction
DoIT AI's product catalogue contains jewelry making machines, chemicals and consumables.

2. Project Objectives
• Make the catalogue searchable over WhatsApp
• Capture enquiries straight into the CRM

3. Deliverables
• WhatsApp catalogue bot
• Lead management dashboard

4. Investment
WhatsApp Product Catalogue Bot + Lead Management CRM ₹65,000 + GST
WordPress Website Chatbot ₹20,000 + GST
Total Development Cost ₹85,000 + GST`;

export function PasteProposalForm({ clients }: { clients: Array<{ id: string; name: string }> }) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, startTransition] = useTransition();

  const [text, setText] = useState('');
  const [clientId, setClientId] = useState('');
  const [title, setTitle] = useState('');
  const [currency, setCurrency] = useState<'INR' | 'USD'>('INR');
  const [parsed, setParsed] = useState<Parsed | null>(null);

  const preview = (value: string) => {
    setText(value);
    if (value.trim().length < 30) {
      setParsed(null);
      return;
    }
    startTransition(async () => {
      const result = (await previewSowTextAction(value)) as Parsed;
      setParsed(result);
      if (!title && result.title) setTitle(result.title);
    });
  };

  const save = () => {
    startTransition(async () => {
      const res = await createSowFromTextAction({
        clientId,
        title: title || undefined,
        text,
        value: parsed?.detectedValue ?? undefined,
        currency,
      });
      if (!res.ok || !res.data) {
        toast({ title: 'Could not create proposal', description: res.error, variant: 'error' });
        return;
      }
      toast({
        title: `${res.data.number} created`,
        description: `${res.data.sections} sections laid out.`,
        variant: 'success',
      });
      router.push(`/sows/${res.data.id}`);
    });
  };

  const ready = Boolean(clientId && parsed && parsed.sections.length > 0);

  return (
    <div className="grid gap-5 lg:grid-cols-2">
      {/* Paste */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <ClipboardPaste className="h-4 w-4" />
            Paste your text
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 pt-0">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Client</Label>
              <Select value={clientId} onValueChange={setClientId}>
                <SelectTrigger><SelectValue placeholder="Choose a client" /></SelectTrigger>
                <SelectContent>
                  {clients.map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Currency</Label>
              <Select value={currency} onValueChange={(v) => setCurrency(v as 'INR' | 'USD')}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="INR">₹ INR</SelectItem>
                  <SelectItem value="USD">$ USD</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="p-title">Title</Label>
            <Input
              id="p-title" value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Picked up from your text automatically"
            />
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label htmlFor="p-text">Proposal text</Label>
              <button
                type="button"
                onClick={() => preview(SAMPLE)}
                className="text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
              >
                Load an example
              </button>
            </div>
            <Textarea
              id="p-text"
              value={text}
              onChange={(e) => preview(e.target.value)}
              placeholder={'Paste here. Number your sections:\n\n1. Introduction\n...\n\n2. Deliverables\n• First thing\n• Second thing'}
              className="min-h-[420px] font-mono text-xs"
            />
            <p className="text-xs text-muted-foreground">
              Headings like <code>1. Introduction</code> become sections. Lines ending in an amount
              become a price table. The letterhead is added for you.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Preview */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Wand2 className="h-4 w-4" />
            What will be created
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 pt-0">
          {!parsed ? (
            <div className="py-16 text-center">
              <FileText className="mx-auto mb-3 h-6 w-6 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">
                Paste some text and the structure appears here.
              </p>
            </div>
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="default">{parsed.sections.length} sections</Badge>
                {parsed.detectedValue && (
                  <Badge variant="success">
                    Value {formatMoney(parsed.detectedValue, currency)}
                  </Badge>
                )}
                {parsed.sections.some((s) => s.table) && <Badge variant="secondary">price table</Badge>}
              </div>

              {parsed.warnings.map((w, i) => (
                <p key={i} className="flex items-start gap-1.5 rounded-md bg-warning/10 p-2 text-xs">
                  <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0 text-warning" />
                  <span>{w}</span>
                </p>
              ))}

              <div className="max-h-[420px] space-y-2 overflow-y-auto scrollbar-thin rounded-lg border p-3">
                {parsed.sections.map((s, i) => (
                  <div key={i} className="border-b pb-2 last:border-0 last:pb-0">
                    <p className="text-sm font-medium">
                      {s.number ? `${s.number}. ` : ''}{s.title}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {s.body.filter(Boolean).length} lines
                      {s.table ? ` · ${s.table.rows.length}-row table` : ''}
                    </p>
                    {s.table && (
                      <div className="mt-1.5 rounded border">
                        {s.table.rows.map((row, r) => (
                          <div key={r} className="flex justify-between gap-3 border-b px-2 py-1 text-xs last:border-0">
                            <span className="truncate text-muted-foreground">{row[0]}</span>
                            <span className="shrink-0 tabular">{row[1]}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>

              <Button onClick={save} loading={pending} disabled={!ready} className="w-full">
                Create proposal
              </Button>
              {!clientId && (
                <p className="text-center text-xs text-muted-foreground">Choose a client first.</p>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
