import { Prisma, type AmountBasis, type Currency, type InvoiceKind, type InvoiceStatus } from '@prisma/client';
import { prisma } from '@/lib/db';
import { audit } from '@/lib/audit';
import { allocateInvoiceNumber } from './invoice-number';
import { calculateTax, resolveTaxTreatment, type TaxTreatment } from './gst';
import { toDecimalString, toMinor, toNumber } from './money';

/**
 * Invoice lifecycle service.
 *
 * DRAFT → (approve) → SENT → PARTIALLY_PAID → PAID
 *                        └─→ OVERDUE (by due date)
 *                        └─→ CANCELLED (pre-send only)
 *
 * Once an invoice leaves DRAFT it is locked: a GST tax invoice is a legal
 * document and must not mutate. Corrections are issued as credit notes.
 */

export interface QuickInvoiceInput {
  /** Existing client, or a name to create a lightweight client record from. */
  clientId?: string;
  clientName?: string;
  /** The single amount field from the modal. */
  amount: string | number;
  currency?: Currency;
  basis?: AmountBasis;
  kind?: InvoiceKind;
  description?: string;
  sacCode?: string;
  gstRate?: number;
  discount?: string | number;
  applyTds?: boolean;
  tdsRate?: number;
  issueDate?: Date;
  dueDate?: Date;
  notes?: string;
  terms?: string;
  poNumber?: string;
  paymentTermsLabel?: string;
  sowId?: string;
  sowMilestoneId?: string;
  projectId?: string;
  recurringId?: string;
  /** Skip the approval step and go straight to SENT (used by recurring auto-send). */
  autoIssue?: boolean;
}

export interface QuickInvoiceActor {
  id: string;
  email: string;
  role: 'SUPER_ADMIN' | 'SUB_ADMIN' | 'SALES' | 'DEVELOPER' | 'MARKETING' | 'CLIENT';
  ip?: string | null;
  userAgent?: string | null;
}

/** Company profile, created on first use so the app never 500s on a fresh DB. */
export async function getCompanyProfile() {
  const existing = await prisma.companyProfile.findUnique({ where: { id: 'default' } });
  if (existing) return existing;

  return prisma.companyProfile.create({
    data: {
      id: 'default',
      legalName: 'XCC Technologies Private Limited',
      tradeName: 'XCC',
      addressLine1: 'Set your address in Settings → Company',
      city: 'Mumbai',
      stateCode: '27',
      stateName: 'Maharashtra',
      postalCode: '400001',
      email: 'billing@xcc.example.com',
      phone: '+91 00000 00000',
    },
  });
}

/**
 * THE 2-FIELD ENGINE.
 *
 * Takes a client and an amount and produces a complete, tax-correct draft
 * invoice. Everything else — GST split, place of supply, due date, terms,
 * numbering, company details — comes from stored configuration.
 */
export async function createQuickInvoice(
  input: QuickInvoiceInput,
  actor: QuickInvoiceActor
) {
  const company = await getCompanyProfile();

  // ---- 1. Resolve the client ----
  let client = input.clientId
    ? await prisma.client.findUnique({ where: { id: input.clientId } })
    : null;

  if (!client && input.clientName?.trim()) {
    const name = input.clientName.trim();
    // Reuse an existing client with the same name before creating a duplicate.
    client = await prisma.client.findFirst({
      where: { name: { equals: name, mode: 'insensitive' }, deletedAt: null },
    });

    client ??= await prisma.client.create({
      data: {
        name,
        email: '',
        country: 'India',
        currency: input.currency ?? 'INR',
        paymentTermDays: company.defaultPaymentTermDays,
      },
    });
  }

  if (!client) {
    throw new Error('A client is required. Select one from the directory or type a name.');
  }

  // ---- 2. Resolve tax treatment from geography ----
  const treatment: TaxTreatment = resolveTaxTreatment({
    companyStateCode: company.stateCode,
    companyCountry: company.country,
    clientStateCode: client.stateCode,
    clientCountry: client.country,
    exportUnderLut: company.exportUnderLut,
    override: (client.taxTreatmentOverride as TaxTreatment | null) ?? null,
  });

  // ---- 3. Calculate ----
  const currency = input.currency ?? client.currency ?? 'INR';
  const basis = input.basis ?? company.defaultAmountBasis;
  const gstRate = input.gstRate ?? Number(company.defaultGstRate);
  const applyTds = input.applyTds ?? client.applyTds ?? company.applyTdsByDefault;
  const tdsRate = input.tdsRate ?? Number(client.tdsRate ?? company.defaultTdsRate);

  const tax = calculateTax({
    amount: input.amount,
    basis,
    gstRate,
    discount: input.discount,
    treatment,
    applyTds,
    tdsRate,
  });

  if (tax.subTotal <= 0n) {
    throw new Error('Invoice amount must be greater than zero.');
  }

  // ---- 4. Dates ----
  const issueDate = input.issueDate ?? new Date();
  const dueDate =
    input.dueDate ??
    new Date(issueDate.getTime() + (client.paymentTermDays ?? company.defaultPaymentTermDays) * 86_400_000);

  // ---- 5. FX ----
  const fxRate =
    currency === 'INR' ? 1 : Number(process.env.FX_USD_INR_FALLBACK ?? 86.5);

  const kind = input.kind ?? 'TAX_INVOICE';
  const description =
    input.description?.trim() ||
    (input.sowId ? 'Professional services as per SOW' : 'Professional services');
  const sacCode = input.sacCode ?? company.defaultSacCode;

  // ---- 6. Persist. Number allocation and insert share one transaction so a
  //         failed insert never burns an invoice number. ----
  const invoice = await prisma.$transaction(async (tx) => {
    const allocated = await allocateInvoiceNumber(tx, {
      kind,
      prefix: company.invoicePrefix,
      issueDate,
    });

    const created = await tx.invoice.create({
      data: {
        kind,
        number: allocated.number,
        fyLabel: allocated.fyLabel,
        seq: allocated.seq,

        clientId: client!.id,
        clientName: client!.name,
        clientLegalName: client!.legalName,
        clientGstin: client!.gstin,
        clientEmail: client!.email || null,
        clientPhone: client!.phone,
        billingAddress: formatAddress(client!),
        placeOfSupply: client!.stateCode ?? company.stateCode,
        companySnapshot: snapshotCompany(company),

        currency,
        fxRate: new Prisma.Decimal(fxRate),
        amountBasis: basis,
        taxTreatment: treatment,
        sacCode,

        enteredAmount: new Prisma.Decimal(toDecimalString(tax.enteredAmount)),
        subTotal: new Prisma.Decimal(toDecimalString(tax.subTotal)),
        discount: new Prisma.Decimal(toDecimalString(tax.discount)),
        gstRate: new Prisma.Decimal(tax.gstRate),
        cgst: new Prisma.Decimal(toDecimalString(tax.cgst)),
        sgst: new Prisma.Decimal(toDecimalString(tax.sgst)),
        igst: new Prisma.Decimal(toDecimalString(tax.igst)),
        taxTotal: new Prisma.Decimal(toDecimalString(tax.taxTotal)),
        roundOff: new Prisma.Decimal(toDecimalString(tax.roundOff)),
        total: new Prisma.Decimal(toDecimalString(tax.total)),
        tdsRate: new Prisma.Decimal(tax.tdsRate),
        tdsAmount: new Prisma.Decimal(toDecimalString(tax.tdsAmount)),
        netReceivable: new Prisma.Decimal(toDecimalString(tax.netReceivable)),
        amountPaid: new Prisma.Decimal(0),
        balanceDue: new Prisma.Decimal(toDecimalString(tax.total)),

        status: 'DRAFT',
        issueDate,
        dueDate,
        notes: input.notes ?? company.defaultNotes,
        terms: input.terms ?? company.defaultTerms,
        poNumber: input.poNumber,
        paymentTermsLabel: input.paymentTermsLabel ?? 'Due on Receipt',

        sowId: input.sowId,
        sowMilestoneId: input.sowMilestoneId,
        projectId: input.projectId,
        recurringId: input.recurringId,
        createdById: actor.id,

        items: {
          create: [
            {
              description,
              sacCode,
              quantity: new Prisma.Decimal(1),
              unitPrice: new Prisma.Decimal(toDecimalString(tax.subTotal)),
              amount: new Prisma.Decimal(toDecimalString(tax.subTotal)),
              gstRate: new Prisma.Decimal(tax.gstRate),
              position: 0,
            },
          ],
        },
      },
      include: { items: true, client: true },
    });

    await audit(
      {
        actorId: actor.id,
        actorEmail: actor.email,
        actorRole: actor.role,
        action: 'invoice.create',
        entity: 'invoice',
        entityId: created.id,
        summary: `Created ${created.number} for ${client!.name} — ${currency} ${toDecimalString(tax.total)}`,
        metadata: {
          treatment,
          basis,
          gstRate: tax.gstRate,
          entered: toNumber(tax.enteredAmount),
          total: toNumber(tax.total),
        },
        ip: actor.ip,
        userAgent: actor.userAgent,
      },
      tx
    );

    return created;
  });

  return { invoice, tax, client, company };
}

/**
 * Lock and issue the invoice. After this the record is immutable.
 * The caller (dispatch service) attaches the PDF and payment link.
 */
export async function issueInvoice(invoiceId: string, actor: QuickInvoiceActor) {
  const invoice = await prisma.invoice.findUnique({ where: { id: invoiceId } });
  if (!invoice) throw new Error('Invoice not found.');
  if (invoice.isLocked) return invoice;
  if (invoice.status === 'CANCELLED') throw new Error('Cannot issue a cancelled invoice.');

  const updated = await prisma.invoice.update({
    where: { id: invoiceId },
    data: { status: 'SENT', isLocked: true, sentAt: new Date() },
  });

  await audit({
    actorId: actor.id,
    actorEmail: actor.email,
    actorRole: actor.role,
    action: 'invoice.issue',
    entity: 'invoice',
    entityId: invoiceId,
    summary: `Issued ${invoice.number} — locked for editing`,
    ip: actor.ip,
  });

  return updated;
}

/**
 * Apply a payment and recompute the invoice balance.
 *
 * Runs in a transaction and re-reads the invoice inside it, so two concurrent
 * webhooks cannot both read balance=X and both mark the invoice PAID.
 */
export async function applyPayment(params: {
  invoiceId: string;
  amount: string | number;
  method?: 'RAZORPAY' | 'STRIPE' | 'BANK_TRANSFER' | 'UPI' | 'CHEQUE' | 'CASH' | 'OTHER';
  gatewayPaymentId?: string;
  gatewayOrderId?: string;
  reference?: string;
  tdsDeducted?: string | number;
  paidAt?: Date;
  notes?: string;
  recordedById?: string;
}) {
  const {
    invoiceId, amount, method = 'BANK_TRANSFER', gatewayPaymentId,
    gatewayOrderId, reference, tdsDeducted = 0, paidAt = new Date(),
    notes, recordedById,
  } = params;

  return prisma.$transaction(async (tx) => {
    // A unique gatewayPaymentId makes webhook replays a no-op.
    if (gatewayPaymentId) {
      const existing = await tx.payment.findUnique({ where: { gatewayPaymentId } });
      if (existing) {
        return { payment: existing, invoice: await tx.invoice.findUniqueOrThrow({ where: { id: invoiceId } }), duplicate: true };
      }
    }

    const invoice = await tx.invoice.findUniqueOrThrow({ where: { id: invoiceId } });

    const payment = await tx.payment.create({
      data: {
        invoiceId,
        clientId: invoice.clientId,
        amount: new Prisma.Decimal(toDecimalString(toMinor(amount))),
        currency: invoice.currency,
        fxRate: invoice.fxRate,
        method,
        status: 'SUCCESS',
        gatewayPaymentId,
        gatewayOrderId,
        reference,
        tdsDeducted: new Prisma.Decimal(toDecimalString(toMinor(tdsDeducted))),
        paidAt,
        notes,
        recordedById,
      },
    });

    // Sum every successful receipt, including the TDS the client withheld —
    // TDS is paid to the government on our behalf, so it settles the invoice.
    const receipts = await tx.payment.findMany({
      where: { invoiceId, status: 'SUCCESS' },
      select: { amount: true, tdsDeducted: true },
    });

    const settledMinor = receipts.reduce(
      (sum, r) => sum + toMinor(r.amount.toString()) + toMinor(r.tdsDeducted.toString()),
      0n
    );
    const totalMinor = toMinor(invoice.total.toString());
    const balanceMinor = totalMinor - settledMinor;

    let status: InvoiceStatus;
    if (balanceMinor <= 0n) status = 'PAID';
    else if (settledMinor > 0n) status = 'PARTIALLY_PAID';
    else status = invoice.dueDate < new Date() ? 'OVERDUE' : 'SENT';

    const updated = await tx.invoice.update({
      where: { id: invoiceId },
      data: {
        amountPaid: new Prisma.Decimal(toDecimalString(settledMinor)),
        balanceDue: new Prisma.Decimal(toDecimalString(balanceMinor > 0n ? balanceMinor : 0n)),
        status,
        paidAt: status === 'PAID' ? paidAt : null,
      },
    });

    await audit(
      {
        actorId: recordedById ?? null,
        action: 'payment.record',
        entity: 'invoice',
        entityId: invoiceId,
        summary: `Payment of ${invoice.currency} ${amount} recorded against ${invoice.number} (${status})`,
        metadata: { method, gatewayPaymentId, balance: toNumber(balanceMinor) },
      },
      tx
    );

    return { payment, invoice: updated, duplicate: false };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

/**
 * Issue a credit note reversing all or part of an invoice.
 * This is the only legal way to correct an issued tax invoice.
 */
export async function createCreditNote(params: {
  invoiceId: string;
  amount?: string | number;
  reason: string;
  actor: QuickInvoiceActor;
}) {
  const original = await prisma.invoice.findUniqueOrThrow({
    where: { id: params.invoiceId },
    include: { client: true },
  });
  const company = await getCompanyProfile();

  // Default to a full reversal of the taxable value.
  const creditBase = params.amount ?? original.subTotal.toString();

  const tax = calculateTax({
    amount: creditBase,
    basis: 'EXCLUSIVE',
    gstRate: Number(original.gstRate),
    treatment: original.taxTreatment as TaxTreatment,
    applyTds: false,
  });

  return prisma.$transaction(async (tx) => {
    const allocated = await allocateInvoiceNumber(tx, {
      kind: 'CREDIT_NOTE',
      prefix: company.invoicePrefix,
    });

    const note = await tx.invoice.create({
      data: {
        kind: 'CREDIT_NOTE',
        number: allocated.number,
        fyLabel: allocated.fyLabel,
        seq: allocated.seq,
        clientId: original.clientId,
        clientName: original.clientName,
        clientLegalName: original.clientLegalName,
        clientGstin: original.clientGstin,
        clientEmail: original.clientEmail,
        clientPhone: original.clientPhone,
        billingAddress: original.billingAddress,
        placeOfSupply: original.placeOfSupply,
        companySnapshot: original.companySnapshot as Prisma.InputJsonValue,
        currency: original.currency,
        fxRate: original.fxRate,
        amountBasis: 'EXCLUSIVE',
        taxTreatment: original.taxTreatment,
        sacCode: original.sacCode,
        enteredAmount: new Prisma.Decimal(toDecimalString(tax.enteredAmount)),
        subTotal: new Prisma.Decimal(toDecimalString(tax.subTotal)),
        gstRate: new Prisma.Decimal(tax.gstRate),
        cgst: new Prisma.Decimal(toDecimalString(tax.cgst)),
        sgst: new Prisma.Decimal(toDecimalString(tax.sgst)),
        igst: new Prisma.Decimal(toDecimalString(tax.igst)),
        taxTotal: new Prisma.Decimal(toDecimalString(tax.taxTotal)),
        roundOff: new Prisma.Decimal(toDecimalString(tax.roundOff)),
        total: new Prisma.Decimal(toDecimalString(tax.total)),
        netReceivable: new Prisma.Decimal(toDecimalString(tax.total)),
        balanceDue: new Prisma.Decimal(0),
        status: 'SENT',
        isLocked: true,
        issueDate: new Date(),
        dueDate: new Date(),
        notes: `Credit note against ${original.number}. Reason: ${params.reason}`,
        creditsInvoiceId: original.id,
        createdById: params.actor.id,
        items: {
          create: [
            {
              description: `Credit against invoice ${original.number} — ${params.reason}`,
              sacCode: original.sacCode,
              quantity: new Prisma.Decimal(1),
              unitPrice: new Prisma.Decimal(toDecimalString(tax.subTotal)),
              amount: new Prisma.Decimal(toDecimalString(tax.subTotal)),
              gstRate: new Prisma.Decimal(tax.gstRate),
            },
          ],
        },
      },
    });

    await audit(
      {
        actorId: params.actor.id,
        actorEmail: params.actor.email,
        actorRole: params.actor.role,
        action: 'invoice.credit_note',
        entity: 'invoice',
        entityId: note.id,
        summary: `Credit note ${note.number} issued against ${original.number}`,
        metadata: { reason: params.reason, originalInvoice: original.number },
      },
      tx
    );

    return note;
  });
}

export async function cancelInvoice(invoiceId: string, reason: string, actor: QuickInvoiceActor) {
  const invoice = await prisma.invoice.findUniqueOrThrow({ where: { id: invoiceId } });

  if (invoice.isLocked) {
    throw new Error(
      `${invoice.number} has already been issued and cannot be cancelled. Issue a credit note instead.`
    );
  }

  const updated = await prisma.invoice.update({
    where: { id: invoiceId },
    data: { status: 'CANCELLED', cancelledAt: new Date(), cancelReason: reason },
  });

  await audit({
    actorId: actor.id,
    actorEmail: actor.email,
    actorRole: actor.role,
    action: 'invoice.cancel',
    entity: 'invoice',
    entityId: invoiceId,
    summary: `Cancelled draft ${invoice.number}: ${reason}`,
  });

  return updated;
}

/** Flip past-due SENT/PARTIALLY_PAID invoices to OVERDUE. Called by the cron job. */
export async function markOverdueInvoices(): Promise<number> {
  const result = await prisma.invoice.updateMany({
    where: {
      status: { in: ['SENT', 'PARTIALLY_PAID'] },
      dueDate: { lt: new Date() },
      kind: 'TAX_INVOICE',
    },
    data: { status: 'OVERDUE' },
  });
  return result.count;
}

// ---------- helpers ----------

function formatAddress(client: {
  addressLine1?: string | null; addressLine2?: string | null;
  city?: string | null; stateName?: string | null;
  postalCode?: string | null; country?: string | null;
}): string {
  return [
    client.addressLine1,
    client.addressLine2,
    [client.city, client.stateName].filter(Boolean).join(', '),
    client.postalCode,
    client.country,
  ]
    .filter(Boolean)
    .join('\n');
}

function snapshotCompany(company: Awaited<ReturnType<typeof getCompanyProfile>>): Prisma.InputJsonValue {
  return {
    legalName: company.legalName,
    tradeName: company.tradeName,
    gstin: company.gstin,
    pan: company.pan,
    cin: company.cin,
    address: [company.addressLine1, company.addressLine2, `${company.city}, ${company.stateName} ${company.postalCode}`, company.country]
      .filter(Boolean)
      .join('\n'),
    stateCode: company.stateCode,
    stateName: company.stateName,
    email: company.email,
    phone: company.phone,
    website: company.website,
    logoUrl: company.logoUrl,
    bank: {
      name: company.bankName,
      accountName: company.bankAccountName,
      accountNumber: company.bankAccountNumber,
      ifsc: company.bankIfsc,
      swift: company.bankSwift,
      upi: company.upiId,
      branch: company.bankBranch,
    },
  };
}
