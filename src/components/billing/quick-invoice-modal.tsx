'use client';

import { useCallback, useEffect, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { AlertTriangle, Check, ChevronsUpDown, Copy, ExternalLink, FileText, Loader2, Mail, MessageCircle, Plus, Receipt, Send, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch, Separator } from '@/components/ui/misc';
import { useToast } from '@/components/ui/toast';
import { cn, formatDate } from '@/lib/utils';
import { formatMoney } from '@/lib/billing/money';
import {
  createQuickInvoiceAction, previewQuickInvoice,
  approveAndSendAction, searchClientsAction,
} from '@/server/actions/billing';

/**
 * THE 2-FIELD QUICK INVOICE.
 *
 * Step 1 asks for a client and an amount — nothing else. Everything below the
 * fold is a live, server-computed preview of what those two inputs produce.
 * Step 2 is the "Approve & Send" confirmation. Step 3 shows the result.
 */

interface ClientOption {
  id: string; name: string; email: string;
  stateName: string | null; currency: string;
}

interface Preview {
  treatment: string; gstRate: number;
  subTotal: string; cgst: string; sgst: string; igst: string;
  taxTotal: string; roundOff: string; total: string;
  tdsRate: number; tdsAmount: string; netReceivable: string;
  applyTds: boolean;
  clientLabel: string; placeOfSupply: string | null;
  nextNumber: string; dueDate: string; currency: 'INR' | 'USD';
}

const TREATMENT_COPY: Record<string, string> = {
  INTRA_STATE: 'Same state — CGST + SGST',
  INTER_STATE: 'Different state — IGST',
  EXPORT_LUT: 'Export under LUT — zero rated',
  EXPORT_WITH_TAX: 'Export with IGST paid',
  EXEMPT: 'Exempt supply',
};

/**
 * Opens the invoice modal directly, with no menu in between.
 *
 * Used where the surrounding copy has already said this is about invoicing —
 * offering "Quick action" there would ask the reader to choose again after
 * they have chosen.
 */
export function QuickInvoiceButton({ className }: { className?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)} className={cn('hidden sm:inline-flex', className)}>
        <Plus />
        Quick invoice
      </Button>
      <Button size="icon" variant="ghost" onClick={() => setOpen(true)} className="sm:hidden" aria-label="Quick invoice">
        <Receipt className="h-4 w-4" />
      </Button>
      <QuickInvoiceModal open={open} onOpenChange={setOpen} />
    </>
  );
}

export function QuickInvoiceModal({
  open, onOpenChange, defaultClientId,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  defaultClientId?: string;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, startTransition] = useTransition();

  const [step, setStep] = useState<'input' | 'review' | 'done'>('input');

  // The two fields.
  const [clientId, setClientId] = useState(defaultClientId ?? '');
  const [clientName, setClientName] = useState('');
  const [amount, setAmount] = useState('');

  // Optional overrides, collapsed by default.
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [basis, setBasis] = useState<'EXCLUSIVE' | 'INCLUSIVE'>('EXCLUSIVE');
  const [description, setDescription] = useState('');
  // undefined = inherit the client's TDS setting; a boolean is an explicit
  // override for this invoice only.
  const [applyTds, setApplyTds] = useState<boolean | undefined>(undefined);

  const [clients, setClients] = useState<ClientOption[]>([]);
  const [clientQuery, setClientQuery] = useState('');
  const [pickerOpen, setPickerOpen] = useState(false);

  const [preview, setPreview] = useState<Preview | null>(null);
  const [previewing, setPreviewing] = useState(false);

  const [created, setCreated] = useState<{ invoiceId: string; number: string } | null>(null);
  const [sendEmail, setSendEmail] = useState(true);
  const [sendWhatsApp, setSendWhatsApp] = useState(true);
  const [result, setResult] = useState<{ paymentUrl: string; viewUrl: string; channels: string[] } | null>(null);

  const pickerRef = useRef<HTMLDivElement>(null);

  const reset = useCallback(() => {
    setStep('input');
    setClientId(defaultClientId ?? '');
    setClientName('');
    setAmount('');
    setDescription('');
    setPreview(null);
    setCreated(null);
    setResult(null);
    setShowAdvanced(false);
    setApplyTds(undefined);
    setBasis('EXCLUSIVE');
  }, [defaultClientId]);

  useEffect(() => {
    if (!open) setTimeout(reset, 200);
  }, [open, reset]);

  // Load the client directory when the picker opens or the query changes.
  useEffect(() => {
    if (!open) return;
    const timer = setTimeout(() => {
      searchClientsAction(clientQuery).then(setClients).catch(() => setClients([]));
    }, 200);
    return () => clearTimeout(timer);
  }, [clientQuery, open]);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (!pickerRef.current?.contains(e.target as Node)) setPickerOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  // Live tax preview, debounced.
  useEffect(() => {
    const numeric = Number(amount.replace(/[,\s]/g, ''));
    if (!numeric || numeric <= 0 || (!clientId && !clientName.trim())) {
      setPreview(null);
      return;
    }

    setPreviewing(true);
    const timer = setTimeout(async () => {
      const res = await previewQuickInvoice({
        clientId: clientId || undefined,
        clientName: clientName || undefined,
        amount,
        basis,
        applyTds,
      });
      if (res.ok && res.data) setPreview(res.data as Preview);
      setPreviewing(false);
    }, 350);

    return () => clearTimeout(timer);
  }, [amount, clientId, clientName, basis, applyTds]);

  const selectedClient = clients.find((c) => c.id === clientId);
  // What will actually happen: the explicit override if the user set one,
  // otherwise whatever the server resolved from the client's configuration.
  const effectiveTds = applyTds ?? preview?.applyTds ?? false;
  const displayClient = selectedClient?.name || clientName;
  const currency = (preview?.currency ?? selectedClient?.currency ?? 'INR') as 'INR' | 'USD';
  const canContinue = Boolean(preview && (clientId || clientName.trim()) && Number(amount.replace(/[,\s]/g, '')) > 0);

  const handleCreate = () => {
    startTransition(async () => {
      const res = await createQuickInvoiceAction({
        clientId: clientId || undefined,
        clientName: clientId ? undefined : clientName,
        amount,
        currency,
        basis,
        description: description || undefined,
        applyTds,
      });

      if (!res.ok || !res.data) {
        toast({ title: 'Could not create invoice', description: res.error, variant: 'error' });
        return;
      }

      setCreated({ invoiceId: res.data.invoiceId, number: res.data.number });
      setStep('review');
    });
  };

  const handleSend = () => {
    if (!created) return;
    startTransition(async () => {
      const res = await approveAndSendAction(created.invoiceId, { sendEmail, sendWhatsApp });
      if (!res.ok || !res.data) {
        toast({ title: 'Dispatch failed', description: res.error, variant: 'error' });
        return;
      }
      setResult(res.data);
      setStep('done');
      toast({
        title: `${created.number} sent`,
        description: res.data.channels.length
          ? `Delivered via ${res.data.channels.join(' and ')}.`
          : 'No delivery channel was available for this client.',
        variant: 'success',
      });
      router.refresh();
    });
  };

  const copy = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast({ title: `${label} copied`, variant: 'success' });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        {step === 'input' && (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-primary" />
                Quick invoice
              </DialogTitle>
              <DialogDescription>
                Two fields. Tax, numbering, terms and the payment link are applied automatically.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4">
              {/* FIELD 1 — Client */}
              <div ref={pickerRef} className="relative space-y-1.5">
                <Label htmlFor="qi-client">Client</Label>
                <div className="relative">
                  <Input
                    id="qi-client"
                    value={clientId ? (selectedClient?.name ?? '') : clientName}
                    onChange={(e) => {
                      setClientId('');
                      setClientName(e.target.value);
                      setClientQuery(e.target.value);
                      setPickerOpen(true);
                    }}
                    onFocus={() => setPickerOpen(true)}
                    placeholder="Select from directory or type a new name"
                    autoComplete="off"
                    className="pr-9"
                  />
                  <ChevronsUpDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                </div>

                {pickerOpen && clients.length > 0 && (
                  <div className="absolute left-0 right-0 top-[68px] z-50 max-h-56 overflow-y-auto scrollbar-thin rounded-md border bg-popover p-1 shadow-lg">
                    {clients.map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => {
                          setClientId(c.id);
                          setClientName(c.name);
                          setPickerOpen(false);
                        }}
                        className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm hover:bg-accent"
                      >
                        <Check className={cn('h-3.5 w-3.5 shrink-0', clientId === c.id ? 'opacity-100' : 'opacity-0')} />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate font-medium">{c.name}</span>
                          <span className="block truncate text-xs text-muted-foreground">
                            {c.stateName ?? 'No place of supply set'} · {c.currency}
                          </span>
                        </span>
                      </button>
                    ))}
                  </div>
                )}
                {!clientId && clientName.trim() && (
                  <p className="text-xs text-muted-foreground">
                    No match selected — a new client record will be created.
                  </p>
                )}
              </div>

              {/* FIELD 2 — Amount */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label htmlFor="qi-amount">Total amount</Label>
                  <button
                    type="button"
                    onClick={() => setBasis((b) => (b === 'EXCLUSIVE' ? 'INCLUSIVE' : 'EXCLUSIVE'))}
                    className="text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
                  >
                    {basis === 'EXCLUSIVE' ? 'Excluding GST' : 'Including GST'}
                  </button>
                </div>
                <div className="relative">
                  <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                    {currency === 'INR' ? '₹' : '$'}
                  </span>
                  <Input
                    id="qi-amount"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    placeholder="100000"
                    inputMode="decimal"
                    className="pl-7 text-lg font-medium tabular"
                    autoFocus
                  />
                </div>
              </div>

              {/* Live preview */}
              {(preview || previewing) && (
                <div className="rounded-lg border bg-muted/40 p-3.5">
                  {previewing && !preview ? (
                    <div className="flex items-center justify-center gap-2 py-4 text-sm text-muted-foreground">
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      Calculating…
                    </div>
                  ) : preview ? (
                    <div className="space-y-1.5 text-sm">
                      <div className="mb-2.5 flex flex-wrap items-center gap-2">
                        <Badge variant="secondary">{preview.nextNumber}</Badge>
                        <Badge variant="outline">{TREATMENT_COPY[preview.treatment] ?? preview.treatment}</Badge>
                        {preview.placeOfSupply && (
                          <span className="text-xs text-muted-foreground">
                            Client&apos;s state: {preview.placeOfSupply}
                          </span>
                        )}
                      </div>

                      {/*
                        Without a place of supply the tax engine falls back to
                        intra-state, which is right for a local walk-in and
                        wrong for a client in another state. The totals match
                        either way at the same rate, but the heads do not, and
                        the heads are what gets filed. Say so before the
                        invoice is raised rather than after.
                      */}
                      {!preview.placeOfSupply
                        && (preview.treatment === 'INTRA_STATE' || preview.treatment === 'INTER_STATE') && (
                        <div className="mb-2.5 flex items-start gap-2 rounded-lg border border-warning/40 bg-warning/5 p-2.5 text-xs">
                          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warning" />
                          <span>
                            This client has no place of supply, so the split is
                            assumed to be CGST + SGST. If they are in another
                            state it should be IGST — set their state on the
                            client record first.
                          </span>
                        </div>
                      )}

                      <Row label="Taxable value" value={formatMoney(preview.subTotal, currency)} />
                      {Number(preview.cgst) > 0 && (
                        <>
                          <Row label={`CGST @ ${(preview.gstRate / 2).toFixed(2)}%`} value={formatMoney(preview.cgst, currency)} muted />
                          <Row label={`SGST @ ${(preview.gstRate / 2).toFixed(2)}%`} value={formatMoney(preview.sgst, currency)} muted />
                        </>
                      )}
                      {Number(preview.igst) > 0 && (
                        <Row label={`IGST @ ${preview.gstRate.toFixed(2)}%`} value={formatMoney(preview.igst, currency)} muted />
                      )}
                      {preview.gstRate === 0 && (
                        <Row label="GST (zero-rated)" value={formatMoney('0', currency)} muted />
                      )}
                      {Math.abs(Number(preview.roundOff)) > 0.001 && (
                        <Row label="Round off" value={formatMoney(preview.roundOff, currency)} muted />
                      )}

                      <Separator className="my-2" />
                      <div className="flex items-center justify-between">
                        <span className="font-medium">Total payable</span>
                        <span className="text-lg font-semibold tabular">{formatMoney(preview.total, currency)}</span>
                      </div>

                      {Number(preview.tdsAmount) > 0 && (
                        <>
                          <Row label={`Less TDS @ ${preview.tdsRate}% (194J)`} value={`− ${formatMoney(preview.tdsAmount, currency)}`} muted />
                          <div className="flex items-center justify-between pt-0.5">
                            <span className="text-xs font-medium">Expected in bank</span>
                            <span className="text-sm font-semibold tabular">{formatMoney(preview.netReceivable, currency)}</span>
                          </div>
                        </>
                      )}

                      <p className="pt-1.5 text-xs text-muted-foreground">
                        Due {formatDate(preview.dueDate)}
                      </p>
                    </div>
                  ) : null}
                </div>
              )}

              {/* Advanced */}
              <button
                type="button"
                onClick={() => setShowAdvanced((s) => !s)}
                className="text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
              >
                {showAdvanced ? 'Hide' : 'Show'} optional details
              </button>

              {showAdvanced && (
                <div className="space-y-3 rounded-lg border p-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="qi-desc">Line description</Label>
                    <Input
                      id="qi-desc"
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      placeholder="Professional services"
                    />
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <Label htmlFor="qi-tds">Client deducts TDS</Label>
                      <p className="text-xs text-muted-foreground">
                        {preview && applyTds === undefined && preview.applyTds
                          ? `${preview.tdsRate}% u/s 194J — from this client's settings`
                          : 'Deducted u/s 194J on the taxable value, not the total'}
                      </p>
                    </div>
                    <Switch id="qi-tds" checked={effectiveTds} onCheckedChange={setApplyTds} />
                  </div>
                </div>
              )}
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
              <Button onClick={handleCreate} disabled={!canContinue} loading={pending}>
                Continue
              </Button>
            </DialogFooter>
          </>
        )}

        {step === 'review' && created && preview && (
          <>
            <DialogHeader>
              <DialogTitle>Approve &amp; send</DialogTitle>
              <DialogDescription>
                {created.number} is ready. Sending locks it — corrections then need a credit note.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4">
              <div className="rounded-lg border p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate font-medium">{displayClient}</p>
                    <p className="text-xs text-muted-foreground">
                      {created.number} · due {formatDate(preview.dueDate)}
                    </p>
                  </div>
                  <p className="shrink-0 text-xl font-semibold tabular">
                    {formatMoney(preview.total, currency)}
                  </p>
                </div>
              </div>

              <div className="space-y-2.5">
                <ChannelRow
                  icon={Mail}
                  title="Email"
                  subtitle="PDF invoice attached, with a pay-now button"
                  checked={sendEmail}
                  onChange={setSendEmail}
                />
                <ChannelRow
                  icon={MessageCircle}
                  title="WhatsApp"
                  subtitle="Sent using the approved invoice template"
                  checked={sendWhatsApp}
                  onChange={setSendWhatsApp}
                />
              </div>

              <div className="flex items-start gap-2 rounded-lg bg-muted/50 p-3 text-xs text-muted-foreground">
                <FileText className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <span>
                  A print-ready PDF and a payment link are generated on send, and a pending
                  receivable is opened in the payments ledger.
                </span>
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setStep('input')}>Back</Button>
              <Button onClick={handleSend} loading={pending}>
                <Send />
                Approve &amp; send
              </Button>
            </DialogFooter>
          </>
        )}

        {step === 'done' && created && result && (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-success/15">
                  <Check className="h-3.5 w-3.5 text-success" />
                </span>
                {created.number} sent
              </DialogTitle>
              <DialogDescription>
                {result.channels.length
                  ? `Queued for delivery via ${result.channels.join(' and ')}.`
                  : 'The invoice was issued, but the client has no email or phone on file.'}
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-2">
              <LinkRow label="Payment link" url={result.paymentUrl} onCopy={copy} />
              <LinkRow label="Client view" url={result.viewUrl} onCopy={copy} />
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => { reset(); }}>
                Create another
              </Button>
              <Button
                onClick={() => {
                  onOpenChange(false);
                  router.push(`/invoices/${created.invoiceId}`);
                }}
              >
                View invoice
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Row({ label, value, muted }: { label: string; value: string; muted?: boolean }) {
  return (
    <div className={cn('flex items-center justify-between', muted && 'text-muted-foreground')}>
      <span className="text-xs">{label}</span>
      <span className="text-sm tabular">{value}</span>
    </div>
  );
}

function ChannelRow({
  icon: Icon, title, subtitle, checked, onChange,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string; subtitle: string;
  checked: boolean; onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between rounded-lg border p-3">
      <div className="flex min-w-0 items-center gap-3">
        <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
        <div className="min-w-0">
          <p className="text-sm font-medium">{title}</p>
          <p className="truncate text-xs text-muted-foreground">{subtitle}</p>
        </div>
      </div>
      <Switch checked={checked} onCheckedChange={onChange} />
    </div>
  );
}

function LinkRow({
  label, url, onCopy,
}: {
  label: string; url: string; onCopy: (text: string, label: string) => void;
}) {
  return (
    <div className="flex items-center gap-2 rounded-lg border p-2.5">
      <div className="min-w-0 flex-1">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="truncate text-sm">{url}</p>
      </div>
      <Button size="icon" variant="ghost" onClick={() => onCopy(url, label)} aria-label={`Copy ${label}`}>
        <Copy className="h-3.5 w-3.5" />
      </Button>
      <Button size="icon" variant="ghost" asChild aria-label={`Open ${label}`}>
        <a href={url} target="_blank" rel="noreferrer">
          <ExternalLink className="h-3.5 w-3.5" />
        </a>
      </Button>
    </div>
  );
}
