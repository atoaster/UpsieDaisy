/**
 * Supermarket chain classification, used to break the Groceries bucket down
 * by merchant. Matching is by name against the transaction's statement text,
 * so store numbers and suburbs don't matter. Deliberately coarse: the major
 * Australian chains plus a catch-all.
 */

export interface SupermarketChain {
  id: string;
  label: string;
}

const CHAINS: Array<{ chain: SupermarketChain; pattern: RegExp }> = [
  { chain: { id: 'aldi', label: 'Aldi' }, pattern: /\baldi\b/i },
  { chain: { id: 'coles', label: 'Coles' }, pattern: /\bcoles\b/i },
  { chain: { id: 'woolworths', label: 'Woolworths' }, pattern: /\bwoolworths\b|\bwoolies\b/i },
  { chain: { id: 'costco', label: 'Costco' }, pattern: /\bcostco\b/i },
];

export const SUPERMARKET_CHAINS: SupermarketChain[] = CHAINS.map((c) => c.chain);

/** The chain a transaction belongs to, or null if it matches none. */
export function classifySupermarket(t: { description: string; rawText?: string | null }): SupermarketChain | null {
  const text = t.rawText?.trim() || t.description;
  for (const { chain, pattern } of CHAINS) {
    if (pattern.test(text)) return chain;
  }
  return null;
}

export interface ChainBreakdownRow extends SupermarketChain {
  count: number;
  totalCents: number;
}

/**
 * Break a set of transactions (typically: everything assigned to the
 * Groceries bucket) down by supermarket chain. Every known chain is always
 * present in the result — a zero row still tells the user the subcategory
 * exists — plus an 'other' row for unmatched merchants. Amounts are summed
 * as positive spend; incoming amounts (refunds) subtract.
 */
export function supermarketBreakdown(
  txns: Array<{ description: string; rawText?: string | null; amountCents: number }>,
): ChainBreakdownRow[] {
  const rows = new Map<string, ChainBreakdownRow>();
  for (const chain of SUPERMARKET_CHAINS) {
    rows.set(chain.id, { ...chain, count: 0, totalCents: 0 });
  }
  const other: ChainBreakdownRow = { id: 'other', label: 'Other', count: 0, totalCents: 0 };
  for (const t of txns) {
    const row = classifySupermarket(t)?.id;
    const target = row ? rows.get(row)! : other;
    target.count += 1;
    target.totalCents += -t.amountCents; // spend positive, refunds negative
  }
  return [...[...rows.values()].sort((a, b) => b.totalCents - a.totalCents), other];
}
