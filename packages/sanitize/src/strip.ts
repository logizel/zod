import * as cheerio from 'cheerio';
import TurndownService from 'turndown';

export const MARKDOWN_CAP = 8000;

const STRIP_SELECTORS = [
  'script',
  'style',
  'noscript',
  'svg',
  'nav',
  'header',
  'footer',
  'aside',
  'form',
  'iframe',
  '.sidebar',
  '.comments',
  '.related-posts',
  '#ads',
  '[aria-hidden="true"]',
];

export interface SanitizedResult {
  markdown: string;
  capped: boolean;
  rawBytes: number;
}

export function sanitizeHtml(html: string): SanitizedResult {
  const $ = cheerio.load(html);
  for (const sel of STRIP_SELECTORS) {
    $(sel).remove();
  }
  const td = new TurndownService({
    headingStyle: 'atx',
    codeBlockStyle: 'fenced',
  });
  let md = td.turndown($.html());
  const rawBytes = Buffer.byteLength(md, 'utf8');
  let capped = false;
  if (md.length > MARKDOWN_CAP) {
    md = md.slice(0, MARKDOWN_CAP);
    capped = true;
  }
  return { markdown: md, capped, rawBytes };
}

export function sanitizeMarkdown(md: string): { markdown: string; capped: boolean } {
  // Light pass: drop image syntax, enforce cap.
  let out = md.replace(/!\[[^\]]*\]\([^)]*\)/g, '');
  let capped = false;
  if (out.length > MARKDOWN_CAP) {
    out = out.slice(0, MARKDOWN_CAP);
    capped = true;
  }
  return { markdown: out, capped };
}
