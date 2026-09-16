import React from 'react';
import {
  Document, Page, Text, View, Image, StyleSheet, renderToBuffer,
} from '@react-pdf/renderer';
import { amountInWords, formatAmount, toMinor } from '@/lib/billing/money';
import { type TaxTreatment } from '@/lib/billing/gst';
import { CONTENT, Letterhead, SIGNATURE } from './letterhead';

/**
 * ZootechX invoice.
 *
 * Reproduces the bordered-table layout the business already uses, printed on
 * the company letterhead (see ./letterhead). The table is placed at the same
 * position on the page as the sample invoice: 31pt in, 139pt down.
 *
 * The GST rows are conditional. An Indian supply must legally show the CGST +
 * SGST or IGST split, so those rows appear; a zero-rated export shows no tax
 * rows at all, which is what the original AED sample does.
 */

const BORDER = '#000000';

const s = StyleSheet.create({
  page: {
    paddingTop: CONTENT.top, paddingBottom: CONTENT.bottom, paddingHorizontal: CONTENT.side,
    fontSize: 8.5, fontFamily: 'Helvetica', color: '#000000',
  },

  // --- outer table ---
  table: { borderWidth: 1, borderColor: BORDER },
  row: { flexDirection: 'row' },

  titleCell: {
    borderBottomWidth: 1, borderBottomColor: BORDER,
    paddingVertical: 6, alignItems: 'center',
  },
  title: { fontSize: 13, fontFamily: 'Helvetica-Bold', letterSpacing: 1.5 },

  billTo: { flex: 1.55, padding: 6, borderRightWidth: 1, borderRightColor: BORDER },
  meta: { flex: 1, padding: 6 },
  metaRow: { flexDirection: 'row', marginBottom: 2 },
  metaLabel: { width: 58 },
  metaValue: { flex: 1 },

  headRow: {
    flexDirection: 'row', borderTopWidth: 1, borderBottomWidth: 1, borderColor: BORDER,
    fontFamily: 'Helvetica-Bold', textAlign: 'center',
  },
  itemRow: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: BORDER, minHeight: 46 },

  cSr: { width: 34, padding: 5, textAlign: 'center', borderRightWidth: 1, borderRightColor: BORDER },
  cDesc: { flex: 1, padding: 5, borderRightWidth: 1, borderRightColor: BORDER },
  cTax: { width: 70, padding: 5, textAlign: 'center', borderRightWidth: 1, borderRightColor: BORDER },
  cAmt: { width: 96, padding: 5, textAlign: 'right' },

  wordsCell: { flex: 1, padding: 5, borderRightWidth: 1, borderRightColor: BORDER, justifyContent: 'center' },
  totalLabel: { width: 70, padding: 5, borderRightWidth: 1, borderRightColor: BORDER, fontFamily: 'Helvetica-Bold' },
  totalValue: { width: 96, padding: 5, textAlign: 'right', fontFamily: 'Helvetica-Bold' },

  taxRow: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: BORDER },

  sectionLabel: {
    padding: 5, fontFamily: 'Helvetica-Bold',
    borderBottomWidth: 1, borderBottomColor: BORDER,
  },
  payLeft: { flex: 1, padding: 5, borderRightWidth: 1, borderRightColor: BORDER },
  payRight: { width: 166, padding: 5, alignItems: 'center' },
  signature: { width: 60, height: 48, marginTop: 4 },
  payRow: { flexDirection: 'row', marginBottom: 1.5 },
  payLabel: { width: 74 },
  bold: { fontFamily: 'Helvetica-Bold' },
  note: { marginTop: 10, fontSize: 7.5, color: '#333333' },
});

export interface InvoicePdfData {
  kind: 'TAX_INVOICE' | 'PROFORMA' | 'CREDIT_NOTE';
  number: string;
  issueDate: Date;
  dueDate: Date;
  currency: 'INR' | 'USD';
  taxTreatment: TaxTreatment;
  placeOfSupply?: string | null;
  sacCode?: string | null;
  poNumber?: string | null;
  paymentTermsLabel?: string | null;

  company: {
    legalName: string; tradeName?: string | null; gstin?: string | null;
    pan?: string | null; cin?: string | null; address: string;
    stateCode?: string | null; stateName?: string | null;
    email: string; phone: string; website?: string | null;
    bank?: {
      name?: string | null; accountName?: string | null; accountNumber?: string | null;
      ifsc?: string | null; swift?: string | null; upi?: string | null;
      branch?: string | null;
    } | null;
  };

  client: {
    name: string; legalName?: string | null; gstin?: string | null;
    email?: string | null; phone?: string | null; address?: string | null;
    stateName?: string | null;
  };

  items: Array<{
    description: string; sacCode?: string | null;
    quantity: string; unitPrice: string; amount: string;
  }>;

  subTotal: string; discount: string; gstRate: string;
  cgst: string; sgst: string; igst: string;
  roundOff: string; total: string;
  tdsRate: string; tdsAmount: string; netReceivable: string;
  amountPaid?: string; balanceDue?: string;

  notes?: string | null;
  terms?: string | null;
  paymentLinkUrl?: string | null;
}

const TITLES = {
  TAX_INVOICE: 'TAX INVOICE',
  PROFORMA: 'PROFORMA INVOICE',
  CREDIT_NOTE: 'CREDIT NOTE',
};

const fmtDate = (d: Date) =>
  d.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' });

const positive = (v: string) => Number(v) > 0.0001;

export function InvoiceDocument({ data }: { data: InvoicePdfData }) {
  const sym = data.currency === 'INR' ? 'Rs.' : '$';
  const isIntra = data.taxTreatment === 'INTRA_STATE';
  const hasTax = positive(data.cgst) || positive(data.igst);
  const bank = data.company.bank;

  const money = (v: string) => `${sym} ${formatAmount(v, data.currency)}`;

  return (
    <Document title={`${TITLES[data.kind]} ${data.number}`} author={data.company.legalName}>
      <Page size="A4" style={s.page}>
        <Letterhead company={data.company} />

        <View style={s.table}>
          {/* Title */}
          <View style={s.titleCell}>
            <Text style={s.title}>{TITLES[data.kind]}</Text>
          </View>

          {/* Bill To + invoice meta */}
          <View style={[s.row, { borderBottomWidth: 1, borderBottomColor: BORDER }]}>
            <View style={s.billTo}>
              <Text style={s.bold}>Bill To</Text>
              <Text style={{ marginTop: 2 }}>{data.client.legalName || data.client.name}</Text>
              {data.client.address ? (
                <Text style={{ marginTop: 1 }}>{data.client.address}</Text>
              ) : null}
              {data.client.gstin ? (
                <Text style={{ marginTop: 2 }}>GSTIN : {data.client.gstin}</Text>
              ) : null}
              {data.client.email ? <Text>{data.client.email}</Text> : null}
            </View>

            <View style={s.meta}>
              <Meta label="Invoice" value={data.number} />
              <Meta label="Invoice Dt" value={fmtDate(data.issueDate)} />
              <Meta
                label="Terms"
                value={data.paymentTermsLabel || `Due ${fmtDate(data.dueDate)}`}
              />
              {data.poNumber ? <Meta label="Po. No" value={data.poNumber} /> : null}
              {data.company.gstin ? <Meta label="GSTIN" value={data.company.gstin} /> : null}
              {data.sacCode ? <Meta label="SAC" value={data.sacCode} /> : null}
            </View>
          </View>

          {/* Items */}
          <View style={s.headRow}>
            <Text style={s.cSr}>Sr No</Text>
            <Text style={s.cDesc}>Particulars</Text>
            <Text style={s.cTax}>Tax rate</Text>
            <Text style={s.cAmt}>Amount</Text>
          </View>

          {data.items.map((item, i) => (
            <View key={i} style={s.itemRow}>
              <Text style={s.cSr}>{i + 1}</Text>
              <Text style={s.cDesc}>{item.description}</Text>
              <Text style={s.cTax}>{hasTax ? `${Number(data.gstRate).toFixed(0)}%` : ''}</Text>
              <Text style={s.cAmt}>{money(item.amount)}</Text>
            </View>
          ))}

          {/* Tax breakdown — required on an Indian supply, absent on an export */}
          {positive(data.discount) && (
            <TotalRow label="Discount" value={`- ${money(data.discount)}`} />
          )}
          {isIntra && positive(data.cgst) && (
            <>
              <TotalRow label={`CGST ${(Number(data.gstRate) / 2).toFixed(2)}%`} value={money(data.cgst)} />
              <TotalRow label={`SGST ${(Number(data.gstRate) / 2).toFixed(2)}%`} value={money(data.sgst)} />
            </>
          )}
          {positive(data.igst) && (
            <TotalRow label={`IGST ${Number(data.gstRate).toFixed(2)}%`} value={money(data.igst)} />
          )}
          {Math.abs(Number(data.roundOff)) > 0.001 && (
            <TotalRow label="Round off" value={money(data.roundOff)} />
          )}

          {/* Amount in words + grand total */}
          <View style={[s.row, { borderBottomWidth: 1, borderBottomColor: BORDER }]}>
            <View style={s.wordsCell}>
              <Text style={s.bold}>{amountInWords(toMinor(data.total), data.currency)}</Text>
            </View>
            <Text style={s.totalLabel}>Total</Text>
            <Text style={s.totalValue}>{money(data.total)}</Text>
          </View>

          {positive(data.tdsAmount) && (
            <>
              <TotalRow
                label={`Less TDS ${Number(data.tdsRate).toFixed(0)}%`}
                value={`- ${money(data.tdsAmount)}`}
              />
              <TotalRow label="Net payable" value={money(data.netReceivable)} bold />
            </>
          )}
          {data.amountPaid && positive(data.amountPaid) && (
            <>
              <TotalRow label="Received" value={`- ${money(data.amountPaid)}`} />
              <TotalRow label="Balance due" value={money(data.balanceDue ?? '0')} bold />
            </>
          )}

          {/* Payment details */}
          <Text style={s.sectionLabel}>PAYMENT DETAILS</Text>
          <View style={s.row}>
            <View style={s.payLeft}>
              {bank?.accountName ? <Pay label="A/c Name" value={bank.accountName} /> : null}
              {bank?.name ? <Pay label="Bank Name" value={bank.name} /> : null}
              {bank?.accountNumber ? <Pay label="A/c No" value={bank.accountNumber} /> : null}
              {bank?.ifsc ? <Pay label="IFSC Code" value={bank.ifsc} /> : null}
              {bank?.swift ? <Pay label="Swift Code" value={bank.swift} /> : null}
              {bank?.branch ? <Pay label="Branch" value={bank.branch} /> : null}
              {bank?.upi ? <Pay label="UPI" value={bank.upi} /> : null}
              <Pay label="Country" value="India" />
            </View>
            <View style={s.payRight}>
              <Text style={[s.bold, { fontSize: 10 }]}>
                {data.company.tradeName || data.company.legalName}
              </Text>
              <Image src={SIGNATURE} style={s.signature} />
              <Text style={s.bold}>Authorised Signatory</Text>
            </View>
          </View>
        </View>

        {data.taxTreatment === 'EXPORT_LUT' ? (
          <Text style={s.note}>
            Supply meant for export of services under Letter of Undertaking without payment of
            integrated tax (Rule 96A of the CGST Rules, 2017).
          </Text>
        ) : null}
        {data.terms ? <Text style={s.note}>{data.terms}</Text> : null}
        {data.notes ? <Text style={s.note}>{data.notes}</Text> : null}
        {data.paymentLinkUrl && data.kind !== 'CREDIT_NOTE' ? (
          <Text style={s.note}>Pay online: {data.paymentLinkUrl}</Text>
        ) : null}
      </Page>
    </Document>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <View style={s.metaRow}>
      <Text style={s.metaLabel}>{label}</Text>
      <Text style={s.metaValue}>: {value}</Text>
    </View>
  );
}

function Pay({ label, value }: { label: string; value: string }) {
  return (
    <View style={s.payRow}>
      <Text style={s.payLabel}>{label}</Text>
      <Text style={{ flex: 1 }}>: {value}</Text>
    </View>
  );
}

function TotalRow({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <View style={s.taxRow}>
      <View style={s.wordsCell} />
      <Text style={[s.totalLabel, bold ? {} : { fontFamily: 'Helvetica' }]}>{label}</Text>
      <Text style={[s.totalValue, bold ? {} : { fontFamily: 'Helvetica' }]}>{value}</Text>
    </View>
  );
}

export async function renderInvoicePdf(data: InvoicePdfData): Promise<Buffer> {
  return renderToBuffer(<InvoiceDocument data={data} />);
}
