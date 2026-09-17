import { describe, it, expect } from 'vitest';
import { linkify, type TextPart } from '@/lib/linkify';

const links = (text: string) =>
  linkify(text).filter((p): p is Extract<TextPart, { kind: 'link' }> => p.kind === 'link');

describe('linkify', () => {
  it('leaves plain text alone', () => {
    expect(linkify('Sent the deck over.')).toEqual([{ kind: 'text', value: 'Sent the deck over.' }]);
  });

  it('finds a url and keeps the surrounding text', () => {
    const parts = linkify('Demo here https://youtu.be/abc123 — have a look');
    expect(parts).toEqual([
      { kind: 'text', value: 'Demo here ' },
      { kind: 'link', href: 'https://youtu.be/abc123', label: 'https://youtu.be/abc123' },
      { kind: 'text', value: ' — have a look' },
    ]);
  });

  it('gives a bare www host a scheme', () => {
    expect(links('see www.zootechx.com today')[0]).toEqual({
      kind: 'link', href: 'https://www.zootechx.com', label: 'www.zootechx.com',
    });
  });

  it('does not swallow sentence punctuation', () => {
    expect(links('Video: https://drive.google.com/file/d/1a2b/view.')[0].href)
      .toBe('https://drive.google.com/file/d/1a2b/view');
  });

  it('keeps query strings and fragments', () => {
    const href = links('https://youtube.com/watch?v=xY_9-z&t=120#top')[0].href;
    expect(href).toBe('https://youtube.com/watch?v=xY_9-z&t=120#top');
  });

  it('finds several links in one note', () => {
    expect(links('https://a.test and https://b.test').map((l) => l.href))
      .toEqual(['https://a.test', 'https://b.test']);
  });

  // A note is typed by a person and rendered as an anchor. These must never
  // become clickable hrefs.
  it('refuses script and data urls', () => {
    for (const hostile of [
      'javascript:alert(1)',
      'JavaScript:alert(1)',
      'data:text/html;base64,PHNjcmlwdD4=',
      'vbscript:msgbox(1)',
      'file:///etc/passwd',
    ]) {
      expect(links(`look at ${hostile} now`)).toEqual([]);
    }
  });

  it('does not treat a scheme-less word as a link', () => {
    expect(links('email me at priya@northwind.in')).toEqual([]);
  });

  it('stops a url at a closing bracket', () => {
    expect(links('(https://a.test/x) rest')[0].label).toBe('https://a.test/x');
  });
});
