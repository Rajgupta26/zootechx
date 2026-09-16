import { describe, it, expect } from 'vitest';
import { parseSowText } from '@/lib/sow/parse';

/** Shapes people actually paste — numbered, markdown, shouty, or mixed. */
describe('proposal parsing', () => {
  it('splits on numbered headings', () => {
    const r = parseSowText(`DoIT AI Chatbot Platform
1. Introduction
DoIT AI's product catalogue contains machines and consumables.
2. Project Objectives
• Reduce manual enquiry handling
• Make the catalogue searchable
3. Deliverables
WhatsApp bot, CRM dashboard.`);

    expect(r.sections.map((s) => s.title)).toEqual([
      'Introduction', 'Project Objectives', 'Deliverables',
    ]);
    expect(r.title).toBe('DoIT AI Chatbot Platform');
    expect(r.sections[1].body).toContain('• Reduce manual enquiry handling');
  });

  it('accepts markdown and bold headings', () => {
    const r = parseSowText(`## Introduction\nSome text.\n**2. Deliverables**\nA thing.`);
    expect(r.sections.map((s) => s.title)).toEqual(['Introduction', 'Deliverables']);
  });

  it('recognises known headings without numbers', () => {
    const r = parseSowText(`Introduction\nBody here.\nOut of Scope\nNot included.`);
    expect(r.sections.map((s) => s.title)).toEqual(['Introduction', 'Out of Scope']);
  });

  it('handles ALL CAPS headings', () => {
    const r = parseSowText(`INTRODUCTION\nBody.\nDELIVERABLES\nStuff.`);
    expect(r.sections.map((s) => s.title)).toEqual(['Introduction', 'Deliverables']);
  });

  it('builds a price table and finds the total', () => {
    const r = parseSowText(`1. Investment
WhatsApp Product Catalogue Bot + Lead Management CRM ₹65,000 + GST
WordPress Website Chatbot integrated with the same catalogue ₹20,000 + GST
Total Development Cost ₹85,000 + GST`);

    const inv = r.sections[0];
    expect(inv.table?.rows.length).toBe(3);
    expect(inv.table?.rows[0][1]).toBe('₹65,000 + GST');
    // The total line wins over the individual rows.
    expect(r.detectedValue).toBe('85000');
  });

  it('drops the running letterhead people paste along', () => {
    const r = parseSowText(`ZootechX, G-9, 7th Floor, Commerce Center, Tardeo, Mumbai 400034. +91 9892776363 | info@zootechx.com
1. Introduction
Real content.`);
    expect(r.sections[0].body).toEqual(['Real content.']);
  });

  it('does not mistake a numbered sentence for a heading', () => {
    const r = parseSowText(`1. Introduction
1. The vendor shall deliver the system by the agreed date.
2. Deliverables
Stuff.`);
    // The sentence ends in a full stop, so it stays in the body.
    expect(r.sections.map((s) => s.title)).toEqual(['Introduction', 'Deliverables']);
    expect(r.sections[0].body.join(' ')).toContain('vendor shall deliver');
  });

  it('warns when nothing parses', () => {
    const r = parseSowText('just a wall of text with no structure at all');
    expect(r.sections).toHaveLength(0);
    expect(r.warnings[0]).toMatch(/No headings were found/);
  });

  it('warns about empty sections', () => {
    const r = parseSowText(`1. Introduction\nText.\n2. Deliverables\n3. Investment\n₹5,000`);
    expect(r.warnings.join(' ')).toMatch(/Deliverables/);
  });
});
