/**
 * Merchant-name normalisation.
 *
 * Statement descriptions for the same biller vary between charges
 * ("NETFLIX.COM 4059-1", "NETFLIX.COM 4059-2", "AGL RETAIL REF 8842213").
 * To group them into one series we strip the volatile parts — reference
 * numbers, dates, card suffixes — and keep the stable merchant identity.
 */

const COMPANY_SUFFIXES = /\b(pty|ltd|limited|inc|co|corp|australia|aust|au)\b/g;
const REFERENCE_WORDS = /\b(ref|reference|receipt|rcpt|invoice|inv|txn|id|no|num)\b[\s:#-]*[a-z0-9-]*/g;
const DATE_LIKE = /\b\d{1,2}[/-]\d{1,2}([/-]\d{2,4})?\b/g;
const LONG_DIGITS = /\d{3,}/g;
const CARD_MASK = /[x*]{2,}\d*/g;

export function normalizeMerchant(description: string): string {
  let s = description.toLowerCase();
  s = s.replace(CARD_MASK, ' ');
  s = s.replace(DATE_LIKE, ' ');
  s = s.replace(REFERENCE_WORDS, ' ');
  s = s.replace(LONG_DIGITS, ' ');
  s = s.replace(/[^a-z0-9 ]/g, ' ');
  s = s.replace(COMPANY_SUFFIXES, ' ');
  s = s.replace(/\s+/g, ' ').trim();
  // If stripping removed everything, fall back to a cruder cleanup so the
  // transaction still groups with exact-duplicate descriptions.
  if (s.length === 0) {
    s = description.toLowerCase().replace(/[^a-z0-9]/g, '');
  }
  return s;
}
