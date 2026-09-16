import React from 'react';
import path from 'node:path';
import {
  Document, Page, Text, View, Image, StyleSheet, Svg, Path, renderToBuffer,
} from '@react-pdf/renderer';
import type { ParsedSection } from '@/lib/sow/parse';

/**
 * ZootechX proposal document.
 *
 * Renders parsed sections onto the company letterhead in the house format:
 * numbered headings, bulleted bodies, two-column tables for pricing, and a
 * client/provider sign-off block at the end.
 *
 * No page numbers: a `fixed` Text using the dynamic `render` prop makes the
 * layout engine emit impossible coordinates once the document spans pages
 * ("unsupported number: -1.9e+21"). The footer is fixed and static instead.
 */

const LOGO = path.join(process.cwd(), 'public', 'brand', 'logo.png');

const s = StyleSheet.create({
  page: {
    paddingTop: 30, paddingBottom: 66, paddingHorizontal: 42,
    fontSize: 9.5, fontFamily: 'Helvetica', color: '#111111', lineHeight: 1.5,
  },
  logo: { width: 132, marginBottom: 14 },
  wave: { position: 'absolute', top: 0, right: 0 },

  docTitle: { fontSize: 16, fontFamily: 'Helvetica-Bold', marginBottom: 2 },
  docSub: { fontSize: 10, color: '#444444', marginBottom: 4 },
  metaLine: { fontSize: 8.5, color: '#666666', marginBottom: 14 },
  rule: { borderBottomWidth: 1.5, borderBottomColor: '#111111', marginBottom: 16 },

  // minPresenceAhead keeps a heading from stranding at the foot of a page.
  h2: { fontSize: 11.5, fontFamily: 'Helvetica-Bold', marginTop: 14, marginBottom: 5 },
  para: { marginBottom: 3, textAlign: 'justify' },
  bullet: { flexDirection: 'row', marginBottom: 2.5, paddingLeft: 6 },
  bulletDot: { width: 10 },
  bulletText: { flex: 1, textAlign: 'justify' },

  table: { borderWidth: 1, borderColor: '#111111', marginTop: 6, marginBottom: 6 },
  tHead: {
    flexDirection: 'row', backgroundColor: '#f0f0f0',
    borderBottomWidth: 1, borderBottomColor: '#111111', fontFamily: 'Helvetica-Bold',
  },
  tRow: { flexDirection: 'row', borderBottomWidth: 0.5, borderBottomColor: '#999999' },
  tScope: { flex: 1, padding: 5, borderRightWidth: 1, borderRightColor: '#111111' },
  tCost: { width: 130, padding: 5, textAlign: 'right' },

  signWrap: { flexDirection: 'row', marginTop: 26 },
  signBox: { flex: 1, borderWidth: 1, borderColor: '#111111', padding: 10, marginRight: 14 },
  signTitle: { fontFamily: 'Helvetica-Bold', marginBottom: 8 },
  signField: { marginBottom: 12, fontSize: 9 },
  signLine: { borderBottomWidth: 0.75, borderBottomColor: '#555555', marginTop: 12 },

  footer: {
    position: 'absolute', bottom: 22, left: 42, right: 42,
    borderTopWidth: 1.5, borderTopColor: '#111111', paddingTop: 5,
    fontSize: 7.5, textAlign: 'center', color: '#333333',
  },
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

function Wave() {
  const lines = Array.from({ length: 20 }, (_, i) => {
    const o = i * 3.2;
    return `M ${150 + o * 0.35} 0 C ${120 + o} ${26 + o * 0.5}, ${90 + o} ${48 + o * 0.5}, ${8 + o * 0.9} ${60 + o * 0.7}`;
  });
  return (
    <Svg style={s.wave} width={176} height={96} viewBox="0 0 176 96">
      {lines.map((d, i) => (
        <Path key={i} d={d} stroke="#2b2b2b" strokeWidth={0.42} fill="none" />
      ))}
    </Svg>
  );
}

const fmtDate = (d: Date) =>
  d.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' });

export function SowDocument({ data }: { data: SowPdfData }) {
  const sym = data.currency === 'INR' ? 'Rs.' : '$';

  return (
    <Document title={`${data.number} — ${data.title}`} author={data.company.legalName}>
      <Page size="A4" style={s.page}>
        <Wave />
        <Image src={LOGO} style={s.logo} />

        <Text style={s.docTitle}>Statement of Work (SOW)</Text>
        <Text style={s.docSub}>{data.title}</Text>
        <Text style={s.metaLine}>
          {data.number}   ·   Prepared for {data.clientLegalName || data.clientName}   ·   {fmtDate(data.issueDate)}
        </Text>
        <View style={s.rule} />

        {data.sections.map((section, i) => (
          <View key={i}>
            <Text style={s.h2} minPresenceAhead={40}>
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
              <View style={s.table}>
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
          </View>
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
          <Text style={{ marginTop: 8, fontSize: 7.5, color: '#555555' }}>
            Signed electronically by {data.signature.signerName} on{' '}
            {fmtDate(data.signature.signedAt)} from IP {data.signature.ipAddress}.
          </Text>
        )}

        <View style={s.footer} fixed>
          <Text>{data.company.address.replace(/\n/g, ', ')}</Text>
          <Text>{data.company.phone} | {data.company.email}</Text>
        </View>
      </Page>
    </Document>
  );
}

export async function renderSowPdf(data: SowPdfData): Promise<Buffer> {
  return renderToBuffer(<SowDocument data={data} />);
}
