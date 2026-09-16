'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Save } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input, Textarea } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/misc';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/components/ui/toast';
import { GST_STATE_CODES } from '@/lib/billing/gst';
import { updateCompanyProfileAction } from '@/server/actions/settings';

interface CompanyForm {
  legalName: string; tradeName: string | null; gstin: string | null;
  pan: string | null; cin: string | null;
  addressLine1: string; addressLine2: string | null;
  city: string; stateCode: string; postalCode: string; country: string;
  email: string; phone: string; website: string | null;
  bankName: string | null; bankAccountName: string | null;
  bankAccountNumber: string | null; bankIfsc: string | null;
  bankSwift: string | null; upiId: string | null;
  defaultGstRate: number; defaultSacCode: string;
  defaultAmountBasis: string; defaultPaymentTermDays: number;
  exportUnderLut: boolean; defaultTdsRate: number; applyTdsByDefault: boolean;
  invoicePrefix: string; defaultTerms: string; defaultNotes: string | null;
  updatedAt: string;
}

export function SettingsForm({ company }: { company: CompanyForm }) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, startTransition] = useTransition();
  const [errors, setErrors] = useState<Record<string, string[]>>({});

  const [form, setForm] = useState({
    ...company,
    tradeName: company.tradeName ?? '',
    gstin: company.gstin ?? '',
    pan: company.pan ?? '',
    cin: company.cin ?? '',
    addressLine2: company.addressLine2 ?? '',
    website: company.website ?? '',
    bankName: company.bankName ?? '',
    bankAccountName: company.bankAccountName ?? '',
    bankAccountNumber: company.bankAccountNumber ?? '',
    bankIfsc: company.bankIfsc ?? '',
    bankSwift: company.bankSwift ?? '',
    upiId: company.upiId ?? '',
    defaultNotes: company.defaultNotes ?? '',
  });

  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const save = () => {
    setErrors({});
    startTransition(async () => {
      const res = await updateCompanyProfileAction(form);
      if (!res.ok) {
        setErrors(res.fieldErrors ?? {});
        toast({ title: 'Could not save', description: res.error, variant: 'error' });
        return;
      }
      toast({ title: 'Settings saved', variant: 'success' });
      router.refresh();
    });
  };

  const err = (field: string) => errors[field]?.[0];

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Company</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 pt-0 sm:grid-cols-2">
          <Field label="Legal name" value={form.legalName} onChange={(v) => set('legalName', v)} error={err('legalName')} />
          <Field label="Trade name" value={form.tradeName} onChange={(v) => set('tradeName', v)} />
          <Field label="GSTIN" value={form.gstin} onChange={(v) => set('gstin', v.toUpperCase())} error={err('gstin')} hint="15 characters; validated including checksum" />
          <Field label="PAN" value={form.pan} onChange={(v) => set('pan', v.toUpperCase())} />
          <Field label="CIN" value={form.cin} onChange={(v) => set('cin', v.toUpperCase())} />
          <Field label="Email" value={form.email} onChange={(v) => set('email', v)} error={err('email')} />
          <Field label="Phone" value={form.phone} onChange={(v) => set('phone', v)} />
          <Field label="Website" value={form.website} onChange={(v) => set('website', v)} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Registered address</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 pt-0 sm:grid-cols-2">
          <Field label="Address line 1" value={form.addressLine1} onChange={(v) => set('addressLine1', v)} error={err('addressLine1')} />
          <Field label="Address line 2" value={form.addressLine2} onChange={(v) => set('addressLine2', v)} />
          <Field label="City" value={form.city} onChange={(v) => set('city', v)} />
          <div className="space-y-1.5">
            <Label>State (place of supply)</Label>
            <Select value={form.stateCode} onValueChange={(v) => set('stateCode', v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {Object.entries(GST_STATE_CODES).map(([code, name]) => (
                  <SelectItem key={code} value={code}>
                    {code} — {name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Compared against each client&apos;s state to choose CGST+SGST or IGST.
            </p>
            {err('stateCode') && <p className="text-xs text-destructive">{err('stateCode')}</p>}
          </div>
          <Field label="Postal code" value={form.postalCode} onChange={(v) => set('postalCode', v)} />
          <Field label="Country" value={form.country} onChange={(v) => set('country', v)} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Billing defaults</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 pt-0">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Field
              label="Default GST rate (%)"
              value={String(form.defaultGstRate)}
              onChange={(v) => set('defaultGstRate', Number(v) || 0)}
              type="number"
            />
            <Field label="Default SAC code" value={form.defaultSacCode} onChange={(v) => set('defaultSacCode', v)} hint="998314 = IT design & development" />
            <Field label="Invoice prefix" value={form.invoicePrefix} onChange={(v) => set('invoicePrefix', v.toUpperCase())} hint="e.g. XCC/26-27/0001" />
            <Field
              label="Payment terms (days)"
              value={String(form.defaultPaymentTermDays)}
              onChange={(v) => set('defaultPaymentTermDays', Number(v) || 0)}
              type="number"
            />
          </div>

          <div className="space-y-1.5">
            <Label>Quick-invoice amount basis</Label>
            <Select
              value={form.defaultAmountBasis}
              onValueChange={(v) => set('defaultAmountBasis', v)}
            >
              <SelectTrigger className="sm:max-w-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="EXCLUSIVE">Exclusive — GST added on top</SelectItem>
                <SelectItem value="INCLUSIVE">Inclusive — GST extracted from the total</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Exclusive: ₹1,00,000 entered → ₹1,18,000 payable. Inclusive: ₹1,00,000 entered →
              ₹84,745.76 taxable + ₹15,254.24 GST.
            </p>
          </div>

          <Toggle
            label="Zero-rate exports under LUT"
            hint="USD/overseas invoices carry no IGST when a Letter of Undertaking is in force."
            checked={form.exportUnderLut}
            onChange={(v) => set('exportUnderLut', v)}
          />

          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              label="Default TDS rate (%)"
              value={String(form.defaultTdsRate)}
              onChange={(v) => set('defaultTdsRate', Number(v) || 0)}
              type="number"
              hint="Section 194J — computed on the taxable value, not the GST-inclusive total."
            />
            <Toggle
              label="Apply TDS by default"
              hint="Most clients do; can be overridden per client."
              checked={form.applyTdsByDefault}
              onChange={(v) => set('applyTdsByDefault', v)}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Bank details</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 pt-0 sm:grid-cols-2">
          <Field label="Bank name" value={form.bankName} onChange={(v) => set('bankName', v)} />
          <Field label="Account name" value={form.bankAccountName} onChange={(v) => set('bankAccountName', v)} />
          <Field label="Account number" value={form.bankAccountNumber} onChange={(v) => set('bankAccountNumber', v)} />
          <Field label="IFSC" value={form.bankIfsc} onChange={(v) => set('bankIfsc', v.toUpperCase())} />
          <Field label="SWIFT (for USD)" value={form.bankSwift} onChange={(v) => set('bankSwift', v.toUpperCase())} />
          <Field label="UPI ID" value={form.upiId} onChange={(v) => set('upiId', v)} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Invoice text</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 pt-0">
          <div className="space-y-1.5">
            <Label htmlFor="terms">Default terms</Label>
            <Textarea id="terms" value={form.defaultTerms} onChange={(e) => set('defaultTerms', e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="notes">Default notes</Label>
            <Textarea id="notes" value={form.defaultNotes} onChange={(e) => set('defaultNotes', e.target.value)} />
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button onClick={save} loading={pending}>
          <Save />
          Save settings
        </Button>
      </div>
    </div>
  );
}

function Field({
  label, value, onChange, error, hint, type = 'text',
}: {
  label: string; value: string; onChange: (v: string) => void;
  error?: string; hint?: string; type?: string;
}) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <Input type={type} value={value} onChange={(e) => onChange(e.target.value)} />
      {hint && !error && <p className="text-xs text-muted-foreground">{hint}</p>}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}

function Toggle({
  label, hint, checked, onChange,
}: {
  label: string; hint: string; checked: boolean; onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-start justify-between gap-3 rounded-lg border p-3">
      <div className="min-w-0">
        <Label>{label}</Label>
        <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>
      </div>
      <Switch checked={checked} onCheckedChange={onChange} />
    </div>
  );
}
