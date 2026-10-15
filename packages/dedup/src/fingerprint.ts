// Fingerprint function (D-12, MEM-01/MEM-03): pure, stable across rebuilds.
//
// Normalized URL (lowercased host, default ports cleared, tracking params /
// fragments / trailing slash removed, remaining params sorted) joined with
// trimmed title + date + organizer, hashed via node:crypto SHA-256 hex.
// Same input -> same digest forever; any normalized field change flips it.
// Empty URL or title is a loud zod rejection, never a hash of nothing.

import { createHash } from 'node:crypto';
import * as z from 'zod';

/** Exact tracking-param names stripped during normalization (lowercased). */
const TRACKING_PARAMS = new Set([
  'fbclid',
  'gclid',
  'gbraid',
  'wbraid',
  'msclkid',
  'mc_cid',
  'mc_eid',
  '_ga',
  '_gl',
  'dclid',
  'igshid',
  'ttclid',
  'twclid',
  'vero_id',
  'mkt_tok',
]);

/** Tracking-param prefixes stripped during normalization (lowercased). */
const TRACKING_PREFIXES = ['utm_', 'pk_', 'piwik_', 'matomo_'];

function isTrackingParam(name: string): boolean {
  const lower = name.toLowerCase();
  if (TRACKING_PARAMS.has(lower)) return true;
  return TRACKING_PREFIXES.some((prefix) => lower.startsWith(prefix));
}

const FingerprintInput = z.object({
  url: z.string().trim().min(1, 'fingerprint url must not be empty'),
  title: z.string().trim().min(1, 'fingerprint title must not be empty'),
  date: z.string().trim().default(''),
  organizer: z.string().trim().default(''),
});
export type FingerprintInput = z.infer<typeof FingerprintInput>;

/**
 * Normalize a candidate URL to its canonical comparison form.
 * Throws on empty or unparseable input — normalization failures stay loud.
 */
export function normalizeUrl(rawUrl: string): string {
  const trimmed = rawUrl.trim();
  if (trimmed === '') {
    throw new Error('normalizeUrl: empty URL');
  }
  const parsed = new URL(trimmed);
  parsed.hostname = parsed.hostname.toLowerCase();
  if (
    (parsed.protocol === 'http:' && parsed.port === '80') ||
    (parsed.protocol === 'https:' && parsed.port === '443')
  ) {
    parsed.port = '';
  }
  for (const [name] of Array.from(parsed.searchParams)) {
    if (isTrackingParam(name)) parsed.searchParams.delete(name);
  }
  parsed.searchParams.sort();
  parsed.hash = '';
  if (parsed.pathname !== '/' && parsed.pathname.endsWith('/')) {
    parsed.pathname = parsed.pathname.replace(/\/+$/, '');
  }
  return parsed.toString();
}

/** SHA-256 hex of an already-normalized URL (the cold ledger key). */
export function hashUrl(normalizedUrl: string): string {
  return createHash('sha256').update(normalizedUrl).digest('hex');
}

/** Stable hex digest over normalized URL + title + date + organizer. */
export function fingerprint(input: FingerprintInput): string {
  const parsed = FingerprintInput.parse(input);
  const canonical = [normalizeUrl(parsed.url), parsed.title, parsed.date, parsed.organizer].join(
    '\n',
  );
  return createHash('sha256').update(canonical).digest('hex');
}
