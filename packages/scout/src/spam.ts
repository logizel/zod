// Precision-biased keyword blocklist per D-17. Matched case-insensitively
// against `title + ' ' + snippet`. No appeal path in Phase 2 (D-17).

const BLOCKLIST: readonly string[] = [
  // crypto-giveaway
  'airdrop',
  '2x returns',
  'double your',
  'crypto giveaway',
  // casino/betting
  'betting',
  'casino',
  'odds',
  'gambling',
  // adult
  'xxx',
  'adult',
  'nsfw',
  // generic noise
  'viagra',
  'loan offer',
  'work from home earn ₹',
  'telegram-only',
  'whatsapp-only',
];

export function isSpam(title: string, snippet: string): boolean {
  const haystack = `${title} ${snippet}`.toLowerCase();
  return BLOCKLIST.some((kw) => haystack.includes(kw.toLowerCase()));
}
