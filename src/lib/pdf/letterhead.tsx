import React from 'react';
import path from 'node:path';
import { Image, StyleSheet, Text, View } from '@react-pdf/renderer';

/**
 * The ZootechX letterhead, shared by every document the system generates.
 *
 * The numbers below are measured, not estimated. The supplied letterhead was
 * rasterised and the ink bounding box of each element found, then the result
 * was cross-checked against the image placement matrices inside the original
 * PDF. The two methods agree to within a point, so a document rendered here
 * registers with the pre-printed stationery.
 *
 * Coordinates are raw page coordinates: react-pdf positions an absolutely
 * placed Page child from the page corner rather than from inside the page
 * padding, so these offsets need no correction for the content margins.
 */

const asset = (file: string) => path.join(process.cwd(), 'public', 'brand', file);

export const LOGO = asset('logo.png');
export const WAVE = asset('wave.png');
export const SIGNATURE = asset('signature.png');

/**
 * Margins that hold body content inside the letterhead — clear of the wave at
 * the top and of the footer rule at the bottom. The top margin is the same
 * 139pt at which the invoice sits on the sample document.
 */
export const CONTENT = { top: 139, bottom: 104, side: 31 } as const;

const s = StyleSheet.create({
  wave: { position: 'absolute', left: 433.6, top: 0, width: 161.7, height: 124.6 },
  logo: { position: 'absolute', left: 44.4, top: 19.7, width: 259.6, height: 79.5 },

  // The same logo artwork the header uses, scaled up and knocked back to a
  // tenth of its strength — which is how the original letterhead builds it.
  watermark: {
    position: 'absolute', left: 11.7, top: 295.5, width: 595.5, height: 182.9,
    opacity: 0.1,
  },

  // Starts 224pt in and runs to the page edge, exactly as on the letterhead.
  rule: {
    position: 'absolute', left: 224, top: 755.7, width: 371.3, height: 3,
    backgroundColor: '#000000',
  },
  address: {
    position: 'absolute', right: 30, top: 771.5, width: 336,
    textAlign: 'right', fontSize: 10, lineHeight: 1.5, color: '#1a1a1a',
  },
  contact: { marginTop: 3 },
});

export interface LetterheadCompany {
  address: string;
  phone: string;
  email: string;
}

/**
 * Rendered as the first child of a Page so body content paints over the
 * watermark, and `fixed` so the stationery repeats on every page.
 */
export function Letterhead({ company }: { company: LetterheadCompany }) {
  return (
    <>
      <Image fixed src={WAVE} style={s.wave} />
      <Image fixed src={LOGO} style={s.logo} />
      <Image fixed src={LOGO} style={s.watermark} />
      <View fixed style={s.rule} />
      <View fixed style={s.address}>
        <Text>{company.address.replace(/\n/g, ', ')}</Text>
        <Text style={s.contact}>{company.phone} | {company.email}</Text>
      </View>
    </>
  );
}
