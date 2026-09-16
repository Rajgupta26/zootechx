import React from 'react';
import path from 'node:path';
import { Font, Image, StyleSheet, Text, View } from '@react-pdf/renderer';

/**
 * Page furniture for generated documents.
 *
 * Two templates, because the business uses two. Invoices print on the company
 * letterhead — the supplied invoice sample literally is one. Proposals use a
 * separate document template with its own header: a smaller logo, an angular
 * corner motif in place of the wave, and a centred title block.
 *
 * Nothing here is estimated. Each template was rasterised, the ink bounding
 * box of every element measured, and the result cross-checked against the
 * placement matrices inside the original PDF; the two agree to within a point.
 *
 * Coordinates are raw page coordinates: react-pdf positions an absolutely
 * placed Page child from the page corner rather than from inside the page
 * padding, so these offsets need no correction for the content margins.
 */

/**
 * Turn hyphenation off for every generated document. react-pdf hyphenates by
 * default, which breaks words like "third-par-ty" across lines; neither the
 * invoice nor the proposal sample does that, and on a signed document a
 * mid-word break reads as a defect. Both PDF modules import this one, so
 * configuring it here covers both.
 */
Font.registerHyphenationCallback((word) => [word]);

const asset = (file: string) => path.join(process.cwd(), 'public', 'brand', file);

export const LOGO = asset('logo.png');
export const WAVE = asset('wave.png');
export const SOW_CORNER = asset('sow-corner.png');
export const SIGNATURE = asset('signature.png');

export interface StationeryCompany {
  legalName?: string;
  tradeName?: string | null;
  address: string;
  phone: string;
  email: string;
}

const s = StyleSheet.create({
  // The logo artwork at a tenth of its strength, which is how the letterhead
  // itself builds the watermark. Drawn before the body so content reads over it.
  watermark: {
    position: 'absolute', left: 11.7, top: 295.5, width: 595.5, height: 182.9,
    opacity: 0.1,
  },

  // --- letterhead ---
  lhWave: { position: 'absolute', left: 433.6, top: 0, width: 161.7, height: 124.6 },
  lhLogo: { position: 'absolute', left: 44.4, top: 19.7, width: 259.6, height: 79.5 },
  // Starts 224pt in and runs to the page edge, exactly as on the letterhead.
  lhRule: {
    position: 'absolute', left: 224, top: 755.7, width: 371.3, height: 3,
    backgroundColor: '#000000',
  },
  lhAddress: {
    position: 'absolute', right: 30, top: 771.5, width: 336,
    textAlign: 'right', fontSize: 10, lineHeight: 1.5, color: '#1a1a1a',
  },
  lhContact: { marginTop: 3 },

  // --- proposal template ---
  // Sized so the wordmark's ink lands where the sample's does; our artwork
  // carries more transparent padding, hence the larger box.
  pLogo: { position: 'absolute', left: 62.8, top: 0.4, width: 206.3, height: 63.4 },
  pCorner: { position: 'absolute', left: 433.75, top: 7.1, width: 97.7, height: 59.3 },
  pRule: {
    position: 'absolute', left: 70.8, top: 814.75, width: 462.4, height: 0.5,
    backgroundColor: '#000000',
  },
  // Wider than the rule above it. The sample's own address is shorter than the
  // one in Settings, and a footer that wraps to a second line collides with the
  // page edge; the extra width keeps a real address on one line.
  pFooter: {
    position: 'absolute', left: 35, top: 820.6, width: 525.3,
    textAlign: 'center', fontSize: 8, fontFamily: 'Times-Roman', color: '#000000',
  },
});

/** Shared by both templates. */
export function Watermark() {
  return <Image fixed src={LOGO} style={s.watermark} />;
}

/**
 * Margins that hold invoice content inside the letterhead — clear of the wave
 * at the top and of the footer rule at the bottom. The top margin is the same
 * 139pt at which the invoice sits on the sample document.
 */
export const CONTENT = { top: 139, bottom: 104, side: 31 } as const;

/**
 * Rendered as the first child of a Page so body content paints over the
 * watermark, and `fixed` so the stationery repeats on every page.
 */
export function Letterhead({ company }: { company: StationeryCompany }) {
  return (
    <>
      <Image fixed src={WAVE} style={s.lhWave} />
      <Image fixed src={LOGO} style={s.lhLogo} />
      <Watermark />
      <View fixed style={s.lhRule} />
      <View fixed style={s.lhAddress}>
        <Text>{company.address.replace(/\n/g, ', ')}</Text>
        <Text style={s.lhContact}>{company.phone} | {company.email}</Text>
      </View>
    </>
  );
}

/** Margins of the proposal template. Wider than the letterhead's, per the sample. */
export const PROPOSAL = { top: 84, bottom: 38, side: 70.8 } as const;

/** Logo and corner motif repeat on every page of the sample, so they do here. */
export function ProposalStationery({ company }: { company: StationeryCompany }) {
  const name = company.tradeName || company.legalName || '';
  return (
    <>
      <Image fixed src={SOW_CORNER} style={s.pCorner} />
      <Image fixed src={LOGO} style={s.pLogo} />
      <Watermark />
      <View fixed style={s.pRule} />
      <Text fixed style={s.pFooter}>
        {name}, {company.address.replace(/\n/g, ', ')}. {company.phone} | {company.email}
      </Text>
    </>
  );
}
