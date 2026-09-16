import React from 'react';
import { Document, Page, Text, View, StyleSheet, renderToBuffer } from '@react-pdf/renderer';
import { amountInWords, formatAmount, toMinor } from '@/lib/billing/money';
import { treatmentLabel, type TaxTreatment } from '@/lib/billing/gst';

/**
 * Print-ready GST invoice.
 *
 * @react-pdf/renderer is used instead of headless Chrome because it runs on
 * every deployment target — serverless included — without bundling a browser.
 */

const styles = StyleSheet.create({
  page: { padding: 36, fontSize: 9, fontFamily: 'Helvetica', color: '#18181b', lineHeight: 1.45 },
  row: { flexDirection: 'row' },
  between: { flexDirection: 'row', justifyContent: 'space-between' },

  header: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 18, borderBottomWidth: 2, borderBottomColor: '#4F46E5', paddingBottom: 12 },
  companyName: { fontSize: 15, fontFamily: 'Helvetica-Bold', color: '#4F46E5' },
  muted: { color: '#71717a', fontSize: 8 },

  docTitle: { fontSize: 18, fontFamily: 'Helvetica-Bold', textAlign: 'right', letterSpacing: 1 },
  docMeta: { textAlign: 'right', fontSize: 8, color: '#52525b', marginTop: 3 },

  panels: { flexDirection: 'row', gap: 12, marginBottom: 14 },
  panel: { flex: 1, backgroundColor: '#fafafa', borderWidth: 1, borderColor: '#e4e4e7', borderRadius: 4, padding: 10 },
  panelLabel: { fontSize: 7, letterSpacing: 0.8, color: '#71717a', fontFamily: 'Helvetica-Bold', marginBottom: 4 },
  panelName: { fontSize: 10, fontFamily: 'Helvetica-Bold', marginBottom: 2 },

  tableHead: { flexDirection: 'row', backgroundColor: '#4F46E5', color: '#ffffff', paddingVertical: 6, paddingHorizontal: 8, fontFamily: 'Helvetica-Bold', fontSize: 8 },
  tableRow: { flexDirection: 'row', paddingVertical: 7, paddingHorizontal: 8, borderBottomWidth: 1, borderBottomColor: '#e4e4e7' },
  cDesc: { flex: 4 },
  cSac: { flex: 1.2 },
  cQty: { flex: 0.8, textAlign: 'right' },
  cRate: { flex: 1.5, textAlign: 'right' },
  cAmt: { flex: 1.6, textAlign: 'right' },

  totals: { marginTop: 10, flexDirection: 'row', justifyContent: 'flex-end' },
  totalsBox: { width: 240 },
  totalLine: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 3 },
  grandTotal: { flexDirection: 'row', justifyContent: 'space-between', backgroundColor: '#4F46E5', color: '#ffffff', paddingVertical: 7, paddingHorizontal: 8, marginTop: 5, borderRadius: 3 },
  bold: { fontFamily: 'Helvetica-Bold' },

  words: { marginTop: 12, padding: 8, backgroundColor: '#fafafa', borderLeftWidth: 3, borderLeftColor: '#4F46E5' },
  section: { marginTop: 14 },
  sectionTitle: { fontSize: 8, fontFamily: 'Helvetica-Bold', marginBottom: 4, color: '#3f3f46' },

  payBox: { marginTop: 12, padding: 10, borderWidth: 1, borderColor: '#4F46E5', borderRadius: 4, backgroundColor: '#eef2ff' },
  link: { color: '#4F46E5', fontFamily: 'Helvetica-Bold' },

  footer: { position: 'absolute', bottom: 24, left: 36, right: 36, borderTopWidth: 1, borderTopColor: '#e4e4e7', paddingTop: 8, fontSize: 7, color: '#a1a1aa', textAlign: 'center' },
  signBox: { marginTop: 26, alignItems: 'flex-end' },
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

  company: {
    legalName: string; tradeName?: string | null; gstin?: string | null;
    pan?: string | null; cin?: string | null; address: string;
    stateCode?: string | null; stateName?: string | null;
    email: string; phone: string; website?: string | null;
    bank?: {
      name?: string | null; accountName?: string | null; accountNumber?: string | null;
      ifsc?: string | null; swift?: string | null; upi?: string | null;
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
  d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });

const isPositive = (v: string) => Number(v) > 0.0001;

export function InvoiceDocument({ data }: { data: InvoicePdfData }) {
  const sym = data.currency === 'INR' ? 'Rs. ' : '$';
  const isIntra = data.taxTreatment === 'INTRA_STATE';
  const isExport = data.taxTreatment === 'EXPORT_LUT' || data.taxTreatment === 'EXPORT_WITH_TAX';

  return (
    <Document title={`${TITLES[data.kind]} ${data.number}`} author={data.company.legalName}>
      <Page size="A4" style={styles.page}>
        {/* Header */}
        <View style={styles.header}>
          <View style={{ flex: 1 }}>
            <Text style={styles.companyName}>{data.company.tradeName || data.company.legalName}</Text>
            <Text style={{ marginTop: 3 }}>{data.company.legalName}</Text>
            <Text style={styles.muted}>{data.company.address}</Text>
            <Text style={styles.muted}>
              {data.company.email} · {data.company.phone}
              {data.company.website ? ` · ${data.company.website}` : ''}
            </Text>
            {data.company.gstin ? (
              <Text style={{ marginTop: 3, fontSize: 8 }}>
                <Text style={styles.bold}>GSTIN: </Text>{data.company.gstin}
                {data.company.pan ? `   PAN: ${data.company.pan}` : ''}
              </Text>
            ) : null}
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.docTitle}>{TITLES[data.kind]}</Text>
            <Text style={styles.docMeta}>No. {data.number}</Text>
            <Text style={styles.docMeta}>Date: {fmtDate(data.issueDate)}</Text>
            {data.kind !== 'CREDIT_NOTE' && (
              <Text style={styles.docMeta}>Due: {fmtDate(data.dueDate)}</Text>
            )}
          </View>
        </View>

        {/* Bill to / Supply details */}
        <View style={styles.panels}>
          <View style={styles.panel}>
            <Text style={styles.panelLabel}>BILL TO</Text>
            <Text style={styles.panelName}>{data.client.legalName || data.client.name}</Text>
            {data.client.address ? <Text style={styles.muted}>{data.client.address}</Text> : null}
            {data.client.email ? <Text style={styles.muted}>{data.client.email}</Text> : null}
            {data.client.phone ? <Text style={styles.muted}>{data.client.phone}</Text> : null}
            {data.client.gstin ? (
              <Text style={{ marginTop: 3, fontSize: 8 }}>
                <Text style={styles.bold}>GSTIN: </Text>{data.client.gstin}
              </Text>
            ) : null}
          </View>
          <View style={styles.panel}>
            <Text style={styles.panelLabel}>SUPPLY DETAILS</Text>
            <View style={styles.between}>
              <Text style={styles.muted}>Place of supply</Text>
              <Text>{data.client.stateName || data.placeOfSupply || '—'}</Text>
            </View>
            <View style={styles.between}>
              <Text style={styles.muted}>SAC code</Text>
              <Text>{data.sacCode || '—'}</Text>
            </View>
            <View style={styles.between}>
              <Text style={styles.muted}>Currency</Text>
              <Text>{data.currency}</Text>
            </View>
            <Text style={{ marginTop: 5, fontSize: 7, color: '#52525b' }}>
              {treatmentLabel(data.taxTreatment)}
            </Text>
          </View>
        </View>

        {/* Line items */}
        <View style={styles.tableHead}>
          <Text style={styles.cDesc}>DESCRIPTION</Text>
          <Text style={styles.cSac}>SAC</Text>
          <Text style={styles.cQty}>QTY</Text>
          <Text style={styles.cRate}>RATE</Text>
          <Text style={styles.cAmt}>AMOUNT</Text>
        </View>
        {data.items.map((item, i) => (
          <View key={i} style={styles.tableRow}>
            <Text style={styles.cDesc}>{item.description}</Text>
            <Text style={styles.cSac}>{item.sacCode || '—'}</Text>
            <Text style={styles.cQty}>{Number(item.quantity).toFixed(2)}</Text>
            <Text style={styles.cRate}>{formatAmount(item.unitPrice, data.currency)}</Text>
            <Text style={styles.cAmt}>{formatAmount(item.amount, data.currency)}</Text>
          </View>
        ))}

        {/* Totals */}
        <View style={styles.totals}>
          <View style={styles.totalsBox}>
            <View style={styles.totalLine}>
              <Text>Taxable value</Text>
              <Text>{sym}{formatAmount(data.subTotal, data.currency)}</Text>
            </View>

            {isPositive(data.discount) && (
              <View style={styles.totalLine}>
                <Text>Discount</Text>
                <Text>- {sym}{formatAmount(data.discount, data.currency)}</Text>
              </View>
            )}

            {isIntra && (
              <>
                <View style={styles.totalLine}>
                  <Text>CGST @ {(Number(data.gstRate) / 2).toFixed(2)}%</Text>
                  <Text>{sym}{formatAmount(data.cgst, data.currency)}</Text>
                </View>
                <View style={styles.totalLine}>
                  <Text>SGST @ {(Number(data.gstRate) / 2).toFixed(2)}%</Text>
                  <Text>{sym}{formatAmount(data.sgst, data.currency)}</Text>
                </View>
              </>
            )}

            {isPositive(data.igst) && (
              <View style={styles.totalLine}>
                <Text>IGST @ {Number(data.gstRate).toFixed(2)}%</Text>
                <Text>{sym}{formatAmount(data.igst, data.currency)}</Text>
              </View>
            )}

            {isExport && (
              <View style={styles.totalLine}>
                <Text style={{ fontSize: 8, color: '#52525b' }}>GST (zero-rated export)</Text>
                <Text>{sym}0.00</Text>
              </View>
            )}

            {Math.abs(Number(data.roundOff)) > 0.001 && (
              <View style={styles.totalLine}>
                <Text>Round off</Text>
                <Text>{sym}{formatAmount(data.roundOff, data.currency)}</Text>
              </View>
            )}

            <View style={styles.grandTotal}>
              <Text style={styles.bold}>
                {data.kind === 'CREDIT_NOTE' ? 'TOTAL CREDIT' : 'TOTAL PAYABLE'}
              </Text>
              <Text style={styles.bold}>{sym}{formatAmount(data.total, data.currency)}</Text>
            </View>

            {isPositive(data.tdsAmount) && (
              <>
                <View style={styles.totalLine}>
                  <Text style={{ fontSize: 8 }}>Less: TDS @ {Number(data.tdsRate).toFixed(2)}% (u/s 194J)</Text>
                  <Text style={{ fontSize: 8 }}>- {sym}{formatAmount(data.tdsAmount, data.currency)}</Text>
                </View>
                <View style={[styles.totalLine, { borderTopWidth: 1, borderTopColor: '#e4e4e7', paddingTop: 4 }]}>
                  <Text style={styles.bold}>Net receivable</Text>
                  <Text style={styles.bold}>{sym}{formatAmount(data.netReceivable, data.currency)}</Text>
                </View>
              </>
            )}

            {data.amountPaid && isPositive(data.amountPaid) && (
              <>
                <View style={styles.totalLine}>
                  <Text>Amount received</Text>
                  <Text>- {sym}{formatAmount(data.amountPaid, data.currency)}</Text>
                </View>
                <View style={styles.totalLine}>
                  <Text style={styles.bold}>Balance due</Text>
                  <Text style={styles.bold}>{sym}{formatAmount(data.balanceDue ?? '0', data.currency)}</Text>
                </View>
              </>
            )}
          </View>
        </View>

        {/* Amount in words — legally required */}
        <View style={styles.words}>
          <Text style={{ fontSize: 7, color: '#71717a' }}>AMOUNT IN WORDS</Text>
          <Text style={{ fontFamily: 'Helvetica-Bold', marginTop: 2 }}>
            {amountInWords(toMinor(data.total), data.currency)}
          </Text>
        </View>

        {/* Payment link */}
        {data.paymentLinkUrl && data.kind !== 'CREDIT_NOTE' ? (
          <View style={styles.payBox}>
            <Text style={styles.bold}>Pay online</Text>
            <Text style={{ marginTop: 3, fontSize: 8 }}>{data.paymentLinkUrl}</Text>
            <Text style={{ marginTop: 3, fontSize: 7, color: '#52525b' }}>
              Card, UPI, netbanking and wallets accepted. Payment is reconciled automatically.
            </Text>
          </View>
        ) : null}

        {/* Bank details */}
        {data.company.bank?.accountNumber ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>BANK DETAILS</Text>
            <View style={styles.row}>
              <View style={{ flex: 1 }}>
                <Text style={styles.muted}>Account name</Text>
                <Text>{data.company.bank.accountName || data.company.legalName}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.muted}>Account number</Text>
                <Text>{data.company.bank.accountNumber}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.muted}>{data.currency === 'USD' ? 'SWIFT' : 'IFSC'}</Text>
                <Text>{data.currency === 'USD' ? data.company.bank.swift : data.company.bank.ifsc}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.muted}>Bank</Text>
                <Text>{data.company.bank.name}</Text>
              </View>
            </View>
          </View>
        ) : null}

        {/* Terms & notes */}
        {data.terms ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>TERMS &amp; CONDITIONS</Text>
            <Text style={{ fontSize: 8, color: '#52525b' }}>{data.terms}</Text>
          </View>
        ) : null}
        {data.notes ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>NOTES</Text>
            <Text style={{ fontSize: 8, color: '#52525b' }}>{data.notes}</Text>
          </View>
        ) : null}

        {data.taxTreatment === 'EXPORT_LUT' ? (
          <Text style={{ marginTop: 10, fontSize: 7, fontFamily: 'Helvetica-Bold', color: '#52525b' }}>
            Supply meant for export of services under Letter of Undertaking without payment of
            integrated tax (Rule 96A of the CGST Rules, 2017).
          </Text>
        ) : null}

        <View style={styles.signBox}>
          <Text style={{ fontSize: 8 }}>For {data.company.legalName}</Text>
          <Text style={{ marginTop: 26, fontSize: 8, color: '#71717a' }}>Authorised Signatory</Text>
        </View>

        <Text style={styles.footer} fixed>
          This is a computer-generated document. {data.company.cin ? `CIN: ${data.company.cin}  ` : ''}
          {data.company.legalName} · {data.company.email}
        </Text>
      </Page>
    </Document>
  );
}

export async function renderInvoicePdf(data: InvoicePdfData): Promise<Buffer> {
  return renderToBuffer(<InvoiceDocument data={data} />);
}
