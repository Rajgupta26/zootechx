/**
 * Split free text into plain runs and safe links.
 *
 * Notes are typed by people and rendered as anchors, so the href is never
 * taken from the text verbatim. Only http(s) URLs and bare `www.` hosts are
 * recognised, and the href is rebuilt from the match — a `javascript:` or
 * `data:` URL cannot survive the pattern, and is rejected again before it is
 * returned. React escapes the text itself, so the label needs no handling.
 */

export type TextPart =
  | { kind: 'text'; value: string }
  | { kind: 'link'; href: string; label: string };

const URL_PATTERN = /(?:https?:\/\/|www\.)[^\s<>()[\]{}"']+/gi;

/** Trailing punctuation usually belongs to the sentence, not the URL. */
const TRAILING = /[.,;:!?'"’”\-]+$/;

export function linkify(text: string): TextPart[] {
  const parts: TextPart[] = [];
  let cursor = 0;

  for (const match of text.matchAll(URL_PATTERN)) {
    const start = match.index;
    let raw = match[0];

    const trimmed = raw.replace(TRAILING, '');
    if (trimmed.length < raw.length) raw = trimmed;
    if (!raw) continue;

    const href = raw.toLowerCase().startsWith('www.') ? `https://${raw}` : raw;
    if (!isHttpUrl(href)) continue;

    if (start > cursor) parts.push({ kind: 'text', value: text.slice(cursor, start) });
    parts.push({ kind: 'link', href, label: raw });
    cursor = start + raw.length;
  }

  if (cursor < text.length) parts.push({ kind: 'text', value: text.slice(cursor) });
  return parts;
}

function isHttpUrl(value: string): boolean {
  try {
    const { protocol } = new URL(value);
    return protocol === 'http:' || protocol === 'https:';
  } catch {
    return false;
  }
}
