import React from 'react';
import {
  Document, Page, Text, View, StyleSheet, renderToBuffer,
} from '@react-pdf/renderer';
import type { ParsedSection } from '@/lib/sow/parse';
import { PROPOSAL, ProposalStationery } from './letterhead';

/**
 * ZootechX proposal document.
 *
 * Follows the supplied Statement of Work sample rather than the invoice
 * letterhead: smaller logo with the angular corner motif, a centred title
 * block over a hairline rule, 10.5pt body and 18pt numbered headings, and the
 * one-line address footer. Type sizes and positions are the sample's own,
 * measured from it (see ./letterhead).
 *
 * No page numbers: a `fixed` Text using the dynamic `render` prop makes the
 * layout engine emit impossible coordinates once the document spans pages
 * ("unsupported number: -1.9e+21"). The footer is fixed and static instead.
 */

const s = StyleSheet.create({
  page: {
    paddingTop: PROPOSAL.top, paddingBottom: PROPOSAL.bottom,
    paddingHorizontal: PROPOSAL.side,
    fontSize: 10.5, fontFamily: 'Helvetica', color: '#000000', lineHeight: 1.45,
  },

  docTitle: { fontSize: 22, fontFamily: 'Helvetica-Bold', textAlign: 'center' },
  docSub: {
    fontSize: 14.5, fontFamily: 'Helvetica-Bold', textAlign: 'center',
    marginTop: 18.5, lineHeight: 1.29,
  },
  metaLine: { fontSize: 8.5, textAlign: 'center', color: '#555555' },
  rule: {
    borderBottomWidth: 0.5, borderBottomColor: '#000000',
    marginTop: 9, marginBottom: 6,
  },

  h2: { fontSize: 18, fontFamily: 'Helvetica-Bold', marginTop: 18, marginBottom: 7 },
  para: { marginBottom: 6 },
  bullet: { flexDirection: 'row', marginBottom: 3, paddingLeft: 10 },
  bulletDot: { width: 12 },
  bulletText: { flex: 1 },

  table: { borderWidth: 0.75, borderColor: '#000000', marginTop: 8, marginBottom: 8 },
  tHead: {
    flexDirection: 'row', backgroundColor: '#f0f0f0',
    borderBottomWidth: 0.75, borderBottomColor: '#000000', fontFamily: 'Helvetica-Bold',
  },
  tRow: { flexDirection: 'row', borderBottomWidth: 0.5, borderBottomColor: '#999999' },
  tScope: { flex: 1, padding: 5, borderRightWidth: 0.75, borderRightColor: '#000000' },
  tCost: { width: 120, padding: 5, textAlign: 'right' },

  signWrap: { flexDirection: 'row', marginTop: 26 },
  signBox: { flex: 1, borderWidth: 0.75, borderColor: '#000000', padding: 10, marginRight: 14 },
  signTitle: { fontFamily: 'Helvetica-Bold', marginBottom: 8 },
  signField: { marginBottom: 12, fontSize: 9.5 },
  signLine: { borderBottomWidth: 0.75, borderBottomColor: '#555555', marginTop: 12 },
});

export interface SowPdfData {
  number: string;
  title: string;
  clientName: string;
  clientLegalName?: string | null;
  currency: 'INR' | 'USD';
  value: string;
  issueDate: Date;
  sections: ParsedSection[];
  company: {
    legalName: string; tradeName?: string | null;
    address: string; email: string; phone: string;
  };
  /** Name that appears under Service Provider on the sign-off block. */
  signatoryName: string;
  signature?: { signerName: string; signedAt: Date; ipAddress: string } | null;
}

const fmtDate = (d: Date) =>
  d.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' });

export function SowDocument({ data }: { data: SowPdfData }) {
  return (
    <Document title={`${data.number} — ${data.title}`} author={data.company.legalName}>
      <Page size="A4" style={s.page}>
        <ProposalStationery company={data.company} />

        <Text style={s.docTitle}>Statement of Work (SOW)</Text>
        <Text style={s.docSub}>{data.title}</Text>
        {/* Not in the sample, which carries its reference elsewhere. Kept small
            and grey: a signed proposal that cannot be cited by number is worse
            than one with a quiet subtitle. */}
        <Text style={s.metaLine}>
          {data.number}   ·   Prepared for {data.clientLegalName || data.clientName}   ·   {fmtDate(data.issueDate)}
        </Text>
        <View style={s.rule} />

        {/*
          * Sections are fragments, not Views, so every heading and paragraph is
          * a direct sibling in the page flow. react-pdf refuses to break before
          * the first child of a container — breaking there cannot improve its
          * presence — so a heading wrapped in a section View strands at the foot
          * of the page with its body overleaf. Flattened, minPresenceAhead does
          * what it says: reserve room for the heading plus its first few lines,
          * or move the heading to the next page.
          */}
        {data.sections.map((section, i) => (
          <React.Fragment key={i}>
            <Text style={s.h2} minPresenceAhead={56}>
              {section.number ? `${section.number}. ` : ''}{section.title}
            </Text>

            {section.body.map((line, j) => {
              if (!line) return null;
              if (line.startsWith('• ')) {
                return (
                  <View key={j} style={s.bullet}>
                    <Text style={s.bulletDot}>•</Text>
                    <Text style={s.bulletText}>{line.slice(2)}</Text>
                  </View>
                );
              }
              return <Text key={j} style={s.para}>{line}</Text>;
            })}

            {section.table && (
              // Held together: a price table that splits leaves the Total alone
              // at the top of the next page. Tables too tall for one page are
              // allowed to break rather than overflow.
              <View style={s.table} wrap={section.table.rows.length > 24}>
                <View style={s.tHead}>
                  <Text style={s.tScope}>{section.table.columns[0]}</Text>
                  <Text style={s.tCost}>{section.table.columns[1]}</Text>
                </View>
                {section.table.rows.map((row, r) => (
                  <View key={r} style={s.tRow}>
                    <Text style={s.tScope}>{row[0]}</Text>
                    <Text style={s.tCost}>{row[1]}</Text>
                  </View>
                ))}
              </View>
            )}
          </React.Fragment>
        ))}

        {/* Sign-off */}
        <View style={s.signWrap} wrap={false}>
          <View style={s.signBox}>
            <Text style={s.signTitle}>Client</Text>
            <Text style={s.signField}>Name: {data.signature?.signerName ?? ''}</Text>
            <Text style={s.signField}>Company: {data.clientLegalName || data.clientName}</Text>
            <Text style={s.signField}>Signature:</Text>
            <View style={s.signLine} />
            <Text style={[s.signField, { marginTop: 10 }]}>
              Date: {data.signature ? fmtDate(data.signature.signedAt) : ''}
            </Text>
          </View>

          <View style={s.signBox}>
            <Text style={s.signTitle}>Service Provider</Text>
            <Text style={s.signField}>Name: {data.signatoryName}</Text>
            <Text style={s.signField}>Company: {data.company.tradeName || data.company.legalName}</Text>
            <Text style={s.signField}>Signature:</Text>
            <View style={s.signLine} />
            <Text style={[s.signField, { marginTop: 10 }]}>Date: {fmtDate(data.issueDate)}</Text>
          </View>
        </View>

        {data.signature && (
          <Text style={{ marginTop: 8, fontSize: 8, color: '#555555' }}>
            Signed electronically by {data.signature.signerName} on{' '}
            {fmtDate(data.signature.signedAt)} from IP {data.signature.ipAddress}.
          </Text>
        )}
      </Page>
    </Document>
  );
}

export async function renderSowPdf(data: SowPdfData): Promise<Buffer> {
  return renderToBuffer(<SowDocument data={data} />);
}
