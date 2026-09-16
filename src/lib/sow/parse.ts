/**
 * Turn pasted proposal text into structured sections.
 *
 * The team writes a SOW elsewhere — a doc, a chat, an AI draft — and pastes it
 * in. This finds the numbered headings and splits on them, so the output lands
 * in the house template without anyone reformatting by hand.
 *
 * It is deliberately forgiving about the shapes people actually paste:
 *   "1. Introduction"      "1) Introduction"     "Section 1 - Introduction"
 *   "## Introduction"      "INTRODUCTION"        "**Introduction**"
 */

export interface ParsedSection {
  /** Heading number when the source had one, for stable ordering. */
  number: number | null;
  title: string;
  /** Body lines, with list markers normalised to a bullet. */
  body: string[];
  /** Rows when the section reads as a two-column table (e.g. Investment). */
  table?: { columns: string[]; rows: string[][] };
}

export interface ParsedSow {
  title: string | null;
  sections: ParsedSection[];
  /** Total detected in an Investment section, as a plain number string. */
  detectedValue: string | null;
  warnings: string[];
}

const HEADING_PATTERNS: RegExp[] = [
  // 1. Introduction   |   2) Scope of Work   |   10 - Timeline
  /^\s{0,3}(\d{1,2})\s*[.)\-–]\s+(.{3,90}?)\s*$/,
  // Section 3 — Objectives
  /^\s{0,3}Section\s+(\d{1,2})\s*[:.\-–]\s*(.{3,90}?)\s*$/i,
  // ## Deliverables   |   ### Deliverables
  /^\s{0,3}#{1,4}\s+(?:(\d{1,2})[.)]?\s+)?(.{3,90}?)\s*$/,
  // **Deliverables**
  /^\s{0,3}\*\*(?:(\d{1,2})[.)]?\s+)?(.{3,90}?)\*\*\s*$/,
];

/** Headings we expect, used to recognise ALL-CAPS or unnumbered lines. */
const KNOWN_HEADINGS = [
  'introduction', 'business requirement analysis', 'project objectives',
  'solution overview', 'detailed scope of work', 'scope of work', 'functional workflow',
  'deliverables', 'content, data & access requirements', 'out of scope',
  'out of scope / exclusions', 'exclusions', 'project timeline', 'timeline',
  'investment', 'commercials', 'pricing', 'assumptions & dependencies',
  'assumptions', 'acceptance & sign-off', 'acceptance', 'sign-off',
  'ai, automation & response-control principles',
];

function matchHeading(
  line: string,
  allowUnnumbered: boolean
): { number: number | null; title: string } | null {
  for (const re of HEADING_PATTERNS) {
    const m = line.match(re);
    if (m) {
      const num = m[1] ? Number(m[1]) : null;
      const raw = (m[2] ?? '').trim();

      // Two prose tells, checked on the raw text before any trimming: a
      // numbered clause ends in sentence punctuation ("1. The vendor shall
      // deliver by the agreed date."), and it runs longer than a heading does.
      if (/[.!?]$/.test(raw)) continue;
      if (raw.split(/\s+/).length > 10) continue;

      // In strict mode a heading must carry its number. Without this, a
      // markdown-style line like "# Component Primary Outcome" — which is a
      // table header where # means the number column — reads as a heading.
      if (num === null && !allowUnnumbered) continue;

      const title = raw.replace(/:$/, '');
      if (title) return { number: num, title };
    }
  }

  // Only consider unnumbered candidates when the document is not numbered.
  // Otherwise stray body lines like "sign-off" or a table header such as
  // "Component Primary Outcome" get promoted into sections of their own.
  if (!allowUnnumbered) return null;

  const bare = line.trim().replace(/^\*\*|\*\*$/g, '').replace(/[:.]$/, '');
  if (bare.length >= 3 && bare.length <= 70) {
    const lower = bare.toLowerCase();
    const known = KNOWN_HEADINGS.some((h) => lower === h || lower.startsWith(`${h} `));
    const shouty = bare === bare.toUpperCase() && /[A-Z]{3}/.test(bare) && !/[.,;]/.test(bare);
    if (known || shouty) return { number: null, title: titleCase(bare) };
  }
  return null;
}

function titleCase(v: string): string {
  if (v !== v.toUpperCase()) return v;
  return v
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .replace(/\bAi\b/g, 'AI')
    .replace(/\bCrm\b/g, 'CRM')
    .replace(/\bSow\b/g, 'SOW');
}

const BULLET = /^\s*[•\-*·‣▪]\s+/;
const NUM_LIST = /^\s*\d{1,2}[.)]\s+(?=.{0,200}$)/;

/**
 * A section whose lines mostly end in an amount reads as a price table.
 * "WhatsApp Bot + CRM ₹65,000 + GST" becomes a two-column row.
 */
function asTable(body: string[]): ParsedSection['table'] | undefined {
  const AMOUNT = /(?:₹|Rs\.?|INR|\$|USD)\s?[\d,]+(?:\.\d{1,2})?(?:\s*\+\s*GST)?\s*$/i;
  const rows = body
    .filter((l) => AMOUNT.test(l))
    .map((l) => {
      const m = l.match(AMOUNT)!;
      return [l.slice(0, m.index).trim().replace(/[–-]\s*$/, ''), m[0].trim()];
    })
    .filter((r) => r[0].length > 1);

  return rows.length >= 2 ? { columns: ['Scope', 'Cost'], rows } : undefined;
}

/** Largest amount in an Investment-style section, as a bare number. */
function detectValue(sections: ParsedSection[]): string | null {
  const money = /(?:₹|Rs\.?|INR)\s?([\d,]+(?:\.\d{1,2})?)/gi;
  const target = sections.find((s) =>
    /investment|commercial|pricing|cost/i.test(s.title)
  );
  if (!target) return null;

  const text = [...target.body, ...(target.table?.rows.flat() ?? [])].join('\n');
  const totalLine = target.body.find((l) => /total/i.test(l));
  const scan = totalLine ?? text;

  let best = 0;
  for (const m of scan.matchAll(money)) {
    const n = Number(m[1].replace(/,/g, ''));
    if (Number.isFinite(n) && n > best) best = n;
  }
  return best > 0 ? String(best) : null;
}

export function parseSowText(raw: string): ParsedSow {
  // A numbered document is unambiguous, so parse numbered-only first. Fall
  // back to loose heading detection only when that finds too little.
  const strict = collect(raw, false);
  return strict.sections.length >= 4 ? finish(strict) : finish(collect(raw, true));
}

function finish(r: ParsedSow): ParsedSow {
  return r;
}

function collect(raw: string, allowUnnumbered: boolean): ParsedSow {
  const warnings: string[] = [];
  const lines = raw.replace(/\r\n?/g, '\n').split('\n');

  let title: string | null = null;
  const sections: ParsedSection[] = [];
  let current: ParsedSection | null = null;

  for (const line of lines) {
    const trimmed = line.trim();

    // Skip the running header/footer people paste along with the body.
    if (/zootechx.*mumbai|info@zootechx\.com|^\s*Page \d+/i.test(trimmed)) continue;

    if (!trimmed) {
      if (current && current.body.length && current.body.at(-1) !== '') current.body.push('');
      continue;
    }

    const heading = matchHeading(trimmed, allowUnnumbered);
    if (heading) {
      if (current) sections.push(current);
      current = { number: heading.number, title: heading.title, body: [] };
      continue;
    }

    if (!current) {
      // Anything before the first heading is the document title.
      if (!title && trimmed.length < 120) title = trimmed;
      else if (title && trimmed.length < 120 && sections.length === 0) title += ` — ${trimmed}`;
      continue;
    }

    current.body.push(
      trimmed.replace(BULLET, '• ').replace(NUM_LIST, (m) => `${m.trim()} `)
    );
  }
  if (current) sections.push(current);

  for (const s of sections) {
    while (s.body.length && s.body.at(-1) === '') s.body.pop();
    const table = asTable(s.body);
    if (table) s.table = table;
  }

  if (sections.length === 0) {
    warnings.push(
      'No headings were found. Number your sections like "1. Introduction" and paste again.'
    );
  } else if (sections.length < 4) {
    warnings.push(
      `Only ${sections.length} section${sections.length === 1 ? '' : 's'} detected — check nothing was missed.`
    );
  }

  const empty = sections.filter((s) => s.body.length === 0).map((s) => s.title);
  if (empty.length) {
    warnings.push(`These sections came through with no content: ${empty.join(', ')}.`);
  }

  return { title, sections, detectedValue: detectValue(sections), warnings };
}
