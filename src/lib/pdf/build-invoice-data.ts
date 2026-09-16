import type { Invoice, InvoiceItem } from '@prisma/client';
import type { InvoicePdfData } from './invoice-pdf';
import type { TaxTreatment } from '@/lib/billing/gst';
import { stateNameFromCode } from '@/lib/billing/gst';

type CompanySnapshot = InvoicePdfData['company'];

/**
 * Map a persisted invoice onto the PDF's data shape.
 *
 * Company details come from the snapshot stored on the invoice, never from the
 * live CompanyProfile — reprinting a two-year-old invoice must show the address
 * and GSTIN that were in force when it was issued.
 */
export function buildInvoicePdfData(
  invoice: Invoice & { items: InvoiceItem[] }
): InvoicePdfData {
  const snapshot = (invoice.companySnapshot ?? {}) as Partial<CompanySnapshot> & {
    bank?: CompanySnapshot['bank'];
  };

  return {
    kind: invoice.kind,
    number: invoice.number,
    issueDate: invoice.issueDate,
    dueDate: invoice.dueDate,
    currency: invoice.currency,
    taxTreatment: invoice.taxTreatment as TaxTreatment,
    placeOfSupply: invoice.placeOfSupply,
    sacCode: invoice.sacCode,

    company: {
      legalName: snapshot.legalName ?? 'Company',
      tradeName: snapshot.tradeName ?? null,
      gstin: snapshot.gstin ?? null,
      pan: snapshot.pan ?? null,
      cin: snapshot.cin ?? null,
      address: snapshot.address ?? '',
      stateCode: snapshot.stateCode ?? null,
      stateName: snapshot.stateName ?? null,
      email: snapshot.email ?? '',
      phone: snapshot.phone ?? '',
      website: snapshot.website ?? null,
      bank: snapshot.bank ?? null,
    },

    client: {
      name: invoice.clientName,
      legalName: invoice.clientLegalName,
      gstin: invoice.clientGstin,
      email: invoice.clientEmail,
      phone: invoice.clientPhone,
      address: invoice.billingAddress,
      stateName: stateNameFromCode(invoice.placeOfSupply),
    },

    items: invoice.items
      .sort((a, b) => a.position - b.position)
      .map((item) => ({
        description: item.description,
        sacCode: item.sacCode,
        quantity: item.quantity.toString(),
        unitPrice: item.unitPrice.toString(),
        amount: item.amount.toString(),
      })),

    subTotal: invoice.subTotal.toString(),
    discount: invoice.discount.toString(),
    gstRate: invoice.gstRate.toString(),
    cgst: invoice.cgst.toString(),
    sgst: invoice.sgst.toString(),
    igst: invoice.igst.toString(),
    roundOff: invoice.roundOff.toString(),
    total: invoice.total.toString(),
    tdsRate: invoice.tdsRate.toString(),
    tdsAmount: invoice.tdsAmount.toString(),
    netReceivable: invoice.netReceivable.toString(),
    amountPaid: invoice.amountPaid.toString(),
    balanceDue: invoice.balanceDue.toString(),

    notes: invoice.notes,
    terms: invoice.terms,
    paymentLinkUrl: invoice.paymentLinkUrl,
  };
}
