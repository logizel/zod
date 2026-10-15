/** Credit/voucher/certificate keywords that strip a prize claim (D-10). */
const CREDIT_KEYWORDS = ['credits', 'vouchers', 'certificates', 'worth', 'up to'];

/**
 * Hard prize gate (D-10, EVT-05).
 * Passes only when explicit INR liquid cash >= 1,00,000 is stated.
 *   - prize_cash_inr null (TBA/unverified) -> false
 *   - credits/vouchers/certificates -> false
 *   - explicit INR >= 100000 -> true
 */
export function passesPrizeGate(
  prizeText: string,
  prizeCashInr: number | null,
): boolean {
  // null prize_cash_inr (TBA/unverified) never qualifies
  if (prizeCashInr === null || prizeCashInr === undefined) {
    return false;
  }

  // Credits/vouchers/certificates stripped: any credit keyword rejects
  // regardless of stated amount (D-10 — checked before amount gate)
  const haystack = prizeText.toLowerCase();
  if (CREDIT_KEYWORDS.some((kw) => haystack.includes(kw))) {
    return false;
  }

  // Explicit INR liquid cash >= 1,00,000
  return prizeCashInr >= 100_000;
}
