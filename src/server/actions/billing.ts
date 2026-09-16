'use server';

import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/db';
import { requirePermission, requestContext, AuthorizationError } from '@/lib/session';
import {
  createQuickInvoice, applyPayment, createCreditNote, cancelInvoice,
  getCompanyProfile, type QuickInvoiceActor,
} from '@/lib/billing/invoice-service';
import { approveAndSendInvoice, generateInvoicePdf } from '@/lib/billing/dispatch';
import { calculateTax, resolveTaxTreatment, type TaxTreatment } from '@/lib/billing/gst';
import { toDecimalString } from '@/lib/billing/money';
import { peekNextInvoiceNumber } from '@/lib/billing/invoice-number';
import {
  quickInvoiceSchema, recordPaymentSchema, creditNoteSchema, recurringInvoiceSchema,
} from '@/lib/validators';

/**
 * Billing server actions.
 *
 * Every action re-checks permissions server-side — the UI hiding a button is a
 * convenience, never the control.
 */

export interface ActionResult<T = unknown> {
  ok: boolean;
  data?: T;
  error?: string;
  fieldErrors?: Record<string, string[]>;
}

async function actor(): Promise<QuickInvoiceActor & { name: string }> {
  const user = await requirePermission('invoice', 'create');
  const ctx = await requestContext();
  return { id: user.id, email: user.email, role: user.role, name: user.name, ...ctx };
}

function toError<T = unknown>(err: unknown): ActionResult<T> {
  const message =
    err instanceof AuthorizationError
      ? err.message
      : err instanceof Error
        ? err.message
        : 'Something went wrong.';
  return { ok: false, error: message };
}

/**
 * Live tax preview for the quick-invoice modal.
 * Runs on the server so the client never needs the tax rules or company config.
 */
export interface InvoicePreview {
  treatment: TaxTreatment;
  gstRate: number;
  subTotal: string; cgst: string; sgst: string; igst: string;
  taxTotal: string; roundOff: string; total: string;
  tdsRate: number; tdsAmount: string; netReceivable: string;
  /// The resolved TDS decision — client setting unless the caller overrode it.
  applyTds: boolean;
  clientLabel: string; placeOfSupply: string | null;
  nextNumber: string; dueDate: string; currency: 'INR' | 'USD';
}

export async function previewQuickInvoice(input: {
  clientId?: string;
  clientName?: string;
  amount: string;
  currency?: 'INR' | 'USD';
  basis?: 'EXCLUSIVE' | 'INCLUSIVE';
  gstRate?: number;
  discount?: string;
  applyTds?: boolean;
}): Promise<ActionResult<InvoicePreview>> {
  try {
    await requirePermission('invoice', 'create');
    const company = await getCompanyProfile();

    const client = input.clientId
      ? await prisma.client.findUnique({ where: { id: input.clientId } })
      : null;

    const treatment = resolveTaxTreatment({
      companyStateCode: company.stateCode,
      companyCountry: company.country,
      clientStateCode: client?.stateCode,
      clientCountry: client?.country,
      exportUnderLut: company.exportUnderLut,
      override: (client?.taxTreatmentOverride as TaxTreatment | null) ?? null,
    });

    const currency = input.currency ?? client?.currency ?? 'INR';
    const applyTds = input.applyTds ?? client?.applyTds ?? company.applyTdsByDefault;

    const tax = calculateTax({
      amount: input.amount || '0',
      basis: input.basis ?? company.defaultAmountBasis,
      gstRate: input.gstRate ?? Number(company.defaultGstRate),
      discount: input.discount,
      treatment,
      applyTds,
      tdsRate: Number(client?.tdsRate ?? company.defaultTdsRate),
    });

    const termDays = client?.paymentTermDays ?? company.defaultPaymentTermDays;

    return {
      ok: true,
      data: {
        treatment,
        gstRate: tax.gstRate,
        subTotal: toDecimalString(tax.subTotal),
        cgst: toDecimalString(tax.cgst),
        sgst: toDecimalString(tax.sgst),
        igst: toDecimalString(tax.igst),
        taxTotal: toDecimalString(tax.taxTotal),
        roundOff: toDecimalString(tax.roundOff),
        total: toDecimalString(tax.total),
        tdsRate: tax.tdsRate,
        tdsAmount: toDecimalString(tax.tdsAmount),
        netReceivable: toDecimalString(tax.netReceivable),
        applyTds,
        clientLabel: client?.name ?? input.clientName ?? '',
        placeOfSupply: client?.stateName ?? null,
        nextNumber: await peekNextInvoiceNumber(prisma, {
          kind: 'TAX_INVOICE',
          prefix: company.invoicePrefix,
        }),
        dueDate: new Date(Date.now() + termDays * 86_400_000).toISOString(),
        currency,
      },
    };
  } catch (err) {
    return toError(err);
  }
}

/** Create the draft invoice from the 2-field modal. */
export async function createQuickInvoiceAction(
  raw: unknown
): Promise<ActionResult<{ invoiceId: string; number: string; total: string }>> {
  try {
    const parsed = quickInvoiceSchema.safeParse(raw);
    if (!parsed.success) {
      return { ok: false, error: 'Check the highlighted fields.', fieldErrors: parsed.error.flatten().fieldErrors };
    }

    const me = await actor();
    const { invoice } = await createQuickInvoice(
      {
        clientId: parsed.data.clientId,
        clientName: parsed.data.clientName,
        amount: parsed.data.amount,
        currency: parsed.data.currency,
        basis: parsed.data.basis,
        description: parsed.data.description,
        gstRate: parsed.data.gstRate,
        discount: parsed.data.discount,
        applyTds: parsed.data.applyTds,
        notes: parsed.data.notes,
        dueDate: parsed.data.dueDate ? new Date(parsed.data.dueDate) : undefined,
        sowId: parsed.data.sowId,
        projectId: parsed.data.projectId,
      },
      me
    );

    revalidatePath('/invoices');
    revalidatePath('/dashboard');

    return {
      ok: true,
      data: { invoiceId: invoice.id, number: invoice.number, total: invoice.total.toString() },
    };
  } catch (err) {
    return toError(err);
  }
}

/** Approve & Send: PDF + payment link + email + WhatsApp, then lock. */
export async function approveAndSendAction(
  invoiceId: string,
  options: { sendEmail?: boolean; sendWhatsApp?: boolean; emailTo?: string; whatsAppTo?: string } = {}
): Promise<ActionResult<{ paymentUrl: string; viewUrl: string; channels: string[] }>> {
  try {
    const user = await requirePermission('invoice', 'send');
    const ctx = await requestContext();

    const result = await approveAndSendInvoice(
      invoiceId,
      { id: user.id, email: user.email, role: user.role, ...ctx },
      options
    );

    revalidatePath('/invoices');
    revalidatePath(`/invoices/${invoiceId}`);
    revalidatePath('/payments');

    return {
      ok: true,
      data: { paymentUrl: result.paymentUrl, viewUrl: result.viewUrl, channels: result.channels },
    };
  } catch (err) {
    return toError(err);
  }
}

export async function recordPaymentAction(raw: unknown): Promise<ActionResult> {
  try {
    const parsed = recordPaymentSchema.safeParse(raw);
    if (!parsed.success) {
      return { ok: false, error: 'Check the highlighted fields.', fieldErrors: parsed.error.flatten().fieldErrors };
    }

    const user = await requirePermission('payment', 'create');
    const result = await applyPayment({
      invoiceId: parsed.data.invoiceId,
      amount: parsed.data.amount,
      method: parsed.data.method,
      reference: parsed.data.reference,
      tdsDeducted: parsed.data.tdsDeducted,
      paidAt: parsed.data.paidAt ? new Date(parsed.data.paidAt) : new Date(),
      notes: parsed.data.notes,
      recordedById: user.id,
    });

    revalidatePath('/invoices');
    revalidatePath(`/invoices/${parsed.data.invoiceId}`);
    revalidatePath('/payments');

    return { ok: true, data: { status: result.invoice.status, balance: result.invoice.balanceDue.toString() } };
  } catch (err) {
    return toError(err);
  }
}

export async function createCreditNoteAction(raw: unknown): Promise<ActionResult<{ number: string }>> {
  try {
    const parsed = creditNoteSchema.safeParse(raw);
    if (!parsed.success) {
      return { ok: false, error: 'Check the highlighted fields.', fieldErrors: parsed.error.flatten().fieldErrors };
    }

    const user = await requirePermission('invoice', 'approve');
    const ctx = await requestContext();
    const note = await createCreditNote({
      invoiceId: parsed.data.invoiceId,
      amount: parsed.data.amount,
      reason: parsed.data.reason,
      actor: { id: user.id, email: user.email, role: user.role, ...ctx },
    });

    revalidatePath('/invoices');
    return { ok: true, data: { number: note.number } };
  } catch (err) {
    return toError(err);
  }
}

export async function cancelInvoiceAction(invoiceId: string, reason: string): Promise<ActionResult> {
  try {
    const user = await requirePermission('invoice', 'update');
    const ctx = await requestContext();
    await cancelInvoice(invoiceId, reason, { id: user.id, email: user.email, role: user.role, ...ctx });
    revalidatePath('/invoices');
    return { ok: true };
  } catch (err) {
    return toError(err);
  }
}

export async function regeneratePdfAction(invoiceId: string): Promise<ActionResult<{ key: string }>> {
  try {
    await requirePermission('invoice', 'read');
    const key = await generateInvoicePdf(invoiceId, true);
    revalidatePath(`/invoices/${invoiceId}`);
    return { ok: true, data: { key } };
  } catch (err) {
    return toError(err);
  }
}

export async function createRecurringInvoiceAction(raw: unknown): Promise<ActionResult> {
  try {
    const parsed = recurringInvoiceSchema.safeParse(raw);
    if (!parsed.success) {
      return { ok: false, error: 'Check the highlighted fields.', fieldErrors: parsed.error.flatten().fieldErrors };
    }

    await requirePermission('invoice', 'create');
    const startDate = new Date(parsed.data.startDate);

    await prisma.recurringInvoice.create({
      data: {
        clientId: parsed.data.clientId,
        title: parsed.data.title,
        amount: parsed.data.amount.replace(/[,\s]/g, ''),
        currency: parsed.data.currency,
        interval: parsed.data.interval,
        dayOfMonth: parsed.data.dayOfMonth,
        startDate,
        endDate: parsed.data.endDate ? new Date(parsed.data.endDate) : null,
        nextRunAt: startDate,
        autoSend: parsed.data.autoSend,
      },
    });

    revalidatePath('/invoices/recurring');
    return { ok: true };
  } catch (err) {
    return toError(err);
  }
}

/** Client options for the modal's picker. */
export async function searchClientsAction(query: string): Promise<
  Array<{ id: string; name: string; email: string; stateName: string | null; currency: string }>
> {
  await requirePermission('client', 'read');
  const clients = await prisma.client.findMany({
    where: {
      deletedAt: null,
      ...(query.trim()
        ? {
            OR: [
              { name: { contains: query, mode: 'insensitive' } },
              { legalName: { contains: query, mode: 'insensitive' } },
              { email: { contains: query, mode: 'insensitive' } },
            ],
          }
        : {}),
    },
    orderBy: { name: 'asc' },
    take: 20,
    select: { id: true, name: true, email: true, stateName: true, currency: true },
  });
  return clients;
}
