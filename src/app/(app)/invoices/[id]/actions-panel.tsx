'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Ban, IndianRupee, MoreHorizontal, RotateCcw, Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input, Textarea } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/misc';
import { useToast } from '@/components/ui/toast';
import { formatMoney } from '@/lib/billing/money';
import {
  approveAndSendAction, recordPaymentAction,
  createCreditNoteAction, cancelInvoiceAction,
} from '@/server/actions/billing';

interface InvoiceSummary {
  id: string;
  number: string;
  status: string;
  isLocked: boolean;
  kind: string;
  currency: 'INR' | 'USD';
  balanceDue: string;
  total: string;
  clientEmail: string | null;
  clientPhone: string | null;
  paymentLinkUrl: string | null;
}

export function InvoiceActions({
  invoice,
  permissions,
}: {
  invoice: InvoiceSummary;
  permissions: { canSend: boolean; canRecordPayment: boolean; canApprove: boolean };
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, startTransition] = useTransition();

  const [sendOpen, setSendOpen] = useState(false);
  const [payOpen, setPayOpen] = useState(false);
  const [creditOpen, setCreditOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);

  const [sendEmail, setSendEmail] = useState(Boolean(invoice.clientEmail));
  const [sendWhatsApp, setSendWhatsApp] = useState(Boolean(invoice.clientPhone));

  const [payAmount, setPayAmount] = useState(invoice.balanceDue);
  const [payMethod, setPayMethod] = useState('BANK_TRANSFER');
  const [payRef, setPayRef] = useState('');
  const [payTds, setPayTds] = useState('');

  const [creditReason, setCreditReason] = useState('');
  const [creditAmount, setCreditAmount] = useState('');
  const [cancelReason, setCancelReason] = useState('');

  const isDraft = invoice.status === 'DRAFT' || invoice.status === 'PENDING_APPROVAL';
  const isSettled = invoice.status === 'PAID' || invoice.status === 'CANCELLED';
  const isCreditNote = invoice.kind === 'CREDIT_NOTE';

  const run = (fn: () => Promise<{ ok: boolean; error?: string }>, success: string, close: () => void) => {
    startTransition(async () => {
      const res = await fn();
      if (!res.ok) {
        toast({ title: 'Action failed', description: res.error, variant: 'error' });
        return;
      }
      toast({ title: success, variant: 'success' });
      close();
      router.refresh();
    });
  };

  return (
    <>
      {permissions.canSend && !isCreditNote && (isDraft || !invoice.paymentLinkUrl) && (
        <Button onClick={() => setSendOpen(true)}>
          <Send />
          {isDraft ? 'Approve & send' : 'Resend'}
        </Button>
      )}

      {permissions.canRecordPayment && !isCreditNote && !isSettled && !isDraft && (
        <Button variant="outline" onClick={() => setPayOpen(true)}>
          <IndianRupee />
          Record payment
        </Button>
      )}

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="icon" aria-label="More actions">
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {permissions.canSend && !isDraft && !isCreditNote && (
            <DropdownMenuItem onClick={() => setSendOpen(true)}>
              <Send />
              Resend to client
            </DropdownMenuItem>
          )}
          {permissions.canApprove && invoice.isLocked && !isCreditNote && (
            <DropdownMenuItem onClick={() => setCreditOpen(true)}>
              <RotateCcw />
              Issue credit note
            </DropdownMenuItem>
          )}
          {isDraft && (
            <DropdownMenuItem
              onClick={() => setCancelOpen(true)}
              className="text-destructive focus:text-destructive"
            >
              <Ban />
              Cancel draft
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Send */}
      <Dialog open={sendOpen} onOpenChange={setSendOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{isDraft ? 'Approve & send' : 'Resend'} {invoice.number}</DialogTitle>
            <DialogDescription>
              {isDraft
                ? 'Sending locks this invoice. Corrections afterwards require a credit note.'
                : 'The client receives the PDF and payment link again.'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <Channel
              label="Email"
              detail={invoice.clientEmail ?? 'No email on file for this client'}
              checked={sendEmail}
              onChange={setSendEmail}
              disabled={!invoice.clientEmail}
            />
            <Channel
              label="WhatsApp"
              detail={invoice.clientPhone ?? 'No phone number on file for this client'}
              checked={sendWhatsApp}
              onChange={setSendWhatsApp}
              disabled={!invoice.clientPhone}
            />
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setSendOpen(false)}>Cancel</Button>
            <Button
              loading={pending}
              onClick={() =>
                run(
                  () => approveAndSendAction(invoice.id, { sendEmail, sendWhatsApp }),
                  `${invoice.number} dispatched`,
                  () => setSendOpen(false)
                )
              }
            >
              <Send />
              Send
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Record payment */}
      <Dialog open={payOpen} onOpenChange={setPayOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Record payment</DialogTitle>
            <DialogDescription>
              Balance due {formatMoney(invoice.balanceDue, invoice.currency)}. Partial payments are
              supported — the invoice stays open until the balance clears.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="pay-amount">Amount received</Label>
              <Input
                id="pay-amount"
                value={payAmount}
                onChange={(e) => setPayAmount(e.target.value)}
                inputMode="decimal"
                className="tabular"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="pay-tds">TDS deducted by client (optional)</Label>
              <Input
                id="pay-tds"
                value={payTds}
                onChange={(e) => setPayTds(e.target.value)}
                placeholder="0.00"
                inputMode="decimal"
                className="tabular"
              />
              <p className="text-xs text-muted-foreground">
                Counts towards settling the invoice — it is paid to the government on your behalf.
              </p>
            </div>

            <div className="space-y-1.5">
              <Label>Method</Label>
              <Select value={payMethod} onValueChange={setPayMethod}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="BANK_TRANSFER">Bank transfer</SelectItem>
                  <SelectItem value="UPI">UPI</SelectItem>
                  <SelectItem value="RAZORPAY">Razorpay</SelectItem>
                  <SelectItem value="STRIPE">Stripe</SelectItem>
                  <SelectItem value="CHEQUE">Cheque</SelectItem>
                  <SelectItem value="CASH">Cash</SelectItem>
                  <SelectItem value="OTHER">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="pay-ref">Reference (optional)</Label>
              <Input
                id="pay-ref"
                value={payRef}
                onChange={(e) => setPayRef(e.target.value)}
                placeholder="UTR / cheque number"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setPayOpen(false)}>Cancel</Button>
            <Button
              loading={pending}
              onClick={() =>
                run(
                  () =>
                    recordPaymentAction({
                      invoiceId: invoice.id,
                      amount: payAmount,
                      method: payMethod,
                      reference: payRef || undefined,
                      tdsDeducted: payTds || undefined,
                    }),
                  'Payment recorded',
                  () => setPayOpen(false)
                )
              }
            >
              Record payment
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Credit note */}
      <Dialog open={creditOpen} onOpenChange={setCreditOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Issue credit note</DialogTitle>
            <DialogDescription>
              An issued tax invoice cannot be edited. A credit note reverses all or part of it and
              gets its own number in the credit-note series.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="cn-amount">Taxable amount to credit</Label>
              <Input
                id="cn-amount"
                value={creditAmount}
                onChange={(e) => setCreditAmount(e.target.value)}
                placeholder="Leave blank to reverse the full invoice"
                inputMode="decimal"
                className="tabular"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cn-reason">Reason</Label>
              <Textarea
                id="cn-reason"
                value={creditReason}
                onChange={(e) => setCreditReason(e.target.value)}
                placeholder="Printed on the credit note, e.g. 'Scope reduced by mutual agreement'"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setCreditOpen(false)}>Cancel</Button>
            <Button
              loading={pending}
              disabled={creditReason.trim().length < 3}
              onClick={() =>
                run(
                  () =>
                    createCreditNoteAction({
                      invoiceId: invoice.id,
                      amount: creditAmount || undefined,
                      reason: creditReason,
                    }),
                  'Credit note issued',
                  () => setCreditOpen(false)
                )
              }
            >
              Issue credit note
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Cancel */}
      <Dialog open={cancelOpen} onOpenChange={setCancelOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cancel {invoice.number}</DialogTitle>
            <DialogDescription>
              Only unsent drafts can be cancelled. The invoice number stays consumed so the series
              remains gapless.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-1.5">
            <Label htmlFor="cancel-reason">Reason</Label>
            <Textarea
              id="cancel-reason"
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              placeholder="Why is this draft being cancelled?"
            />
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setCancelOpen(false)}>Keep draft</Button>
            <Button
              variant="destructive"
              loading={pending}
              disabled={cancelReason.trim().length < 3}
              onClick={() =>
                run(
                  () => cancelInvoiceAction(invoice.id, cancelReason),
                  'Draft cancelled',
                  () => setCancelOpen(false)
                )
              }
            >
              Cancel invoice
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function Channel({
  label, detail, checked, onChange, disabled,
}: {
  label: string; detail: string;
  checked: boolean; onChange: (v: boolean) => void; disabled?: boolean;
}) {
  return (
    <div className="flex items-center justify-between rounded-lg border p-3">
      <div className="min-w-0">
        <p className="text-sm font-medium">{label}</p>
        <p className="truncate text-xs text-muted-foreground">{detail}</p>
      </div>
      <Switch checked={checked && !disabled} onCheckedChange={onChange} disabled={disabled} />
    </div>
  );
}
