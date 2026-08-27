import { describe, expect, it } from 'vitest';
import { classifySupermarket, supermarketBreakdown } from '../src/index.js';

describe('classifySupermarket', () => {
  it('matches chains regardless of store numbers, suburbs and prefixes', () => {
    expect(classifySupermarket({ description: 'Debit Card Purchase Woolworths 3177 Maffra Aus' })?.id).toBe('woolworths');
    expect(classifySupermarket({ description: 'Eftpos Debit 0907740 Aldi Stores 5038 Endeavour H' })?.id).toBe('aldi');
    expect(classifySupermarket({ description: 'Eftpos Debit 0164790 Coles 0651 Endeavour H' })?.id).toBe('coles');
    expect(classifySupermarket({ description: 'Debit Card Purchase Costco Wholesale Austr Ringwood Aus' })?.id).toBe('costco');
    expect(classifySupermarket({ description: 'Ritchies Rowville Rowville Aus' })).toBeNull();
  });

  it('prefers rawText over a user-edited description', () => {
    expect(
      classifySupermarket({ description: 'weekly shop', rawText: 'WOOLWORTHS 3168 ENDEAVOUR H' })?.id,
    ).toBe('woolworths');
  });
});

describe('supermarketBreakdown', () => {
  it('sums spend per chain, keeps zero rows, and nets refunds', () => {
    const rows = supermarketBreakdown([
      { description: 'Woolworths 3177', amountCents: -5000 },
      { description: 'Woolworths 3168', amountCents: -2500 },
      { description: 'Aldi Stores 5038', amountCents: -4000 },
      { description: 'Aldi Stores 5038 refund', amountCents: 1000 },
      { description: 'Ritchies Rowville', amountCents: -1500 },
    ]);
    const byId = Object.fromEntries(rows.map((r) => [r.id, r]));
    expect(byId.woolworths).toMatchObject({ count: 2, totalCents: 7500 });
    expect(byId.aldi).toMatchObject({ count: 2, totalCents: 3000 });
    expect(byId.coles).toMatchObject({ count: 0, totalCents: 0 });
    expect(byId.costco).toMatchObject({ count: 0, totalCents: 0 });
    expect(byId.other).toMatchObject({ count: 1, totalCents: 1500 });
    // sorted by spend, other last
    expect(rows[0].id).toBe('woolworths');
    expect(rows[rows.length - 1].id).toBe('other');
  });
});
