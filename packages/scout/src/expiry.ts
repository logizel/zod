import {
  parse as parseDate,
  parseISO,
  isValid,
  isPast,
} from 'date-fns';
import { formatInTimeZone } from 'date-fns-tz';

const MONTHS =
  'January|February|March|April|May|June|July|August|September|October|November|December|' +
  'Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec';

const FORMAT_LIST = ['dd MMM yyyy', 'MMM dd, yyyy', 'dd/MM/yyyy', 'yyyy-MM-dd'] as const;

const DATE_PATTERNS: RegExp[] = [
  /\b\d{4}-\d{2}-\d{2}\b/g,
  /\b\d{1,2}\/\d{1,2}\/\d{4}\b/g,
  /\b\d{1,2}\s+(?:MONTHS)\s+\d{4}\b/gi,
  /\b(?:MONTHS)\s+\d{1,2},?\s+\d{4}\b/gi,
];

function buildPatterns(): RegExp[] {
  return DATE_PATTERNS.map((r) => {
    const src = r.source.replace(/MONTHS/g, MONTHS);
    return new RegExp(src, r.flags);
  });
}

const COMPILED = buildPatterns();

function candidates(text: string): string[] {
  const out = new Set<string>();
  for (const re of COMPILED) {
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      out.add(m[0].trim());
    }
  }
  return [...out];
}

function tryParse(raw: string): Date | null {
  // ISO path.
  const iso = parseISO(raw);
  if (isValid(iso)) return iso;
  for (const fmt of FORMAT_LIST) {
    const parsed = parseDate(raw, fmt, new Date());
    if (isValid(parsed)) return parsed;
  }
  return null;
}

/**
 * Extract the first PAST date found in `text` (D-16 strict: a date exactly
 * now is not past). Returns null when no past date is found (D-18 PASS —
 * cannot prove expired). Future dates never trigger expiry.
 */
export function extractPastDate(text: string): Date | null {
  const ist = (d: Date) => formatInTimeZone(d, 'Asia/Kolkata', 'yyyy-MM-dd HH:mm');
  void ist;
  for (const raw of candidates(text)) {
    const d = tryParse(raw);
    if (d && isPast(d)) {
      return d;
    }
  }
  return null;
}
