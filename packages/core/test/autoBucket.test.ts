import { describe, expect, it } from 'vitest';
import { autoBucket, type Txn } from '../src/index.js';

function txn(partial: Partial<Txn>): Txn {
  return {
    id: 't1',
    description: 'x',
    amountCents: -1000,
    createdAt: '2026-08-29T08:38:00Z',
    settled: true,
    isTransfer: false,
    category: null,
    ...partial,
  };
}

describe('autoBucket', () => {
  it('maps the bank category when it has one obvious home', () => {
    expect(
      autoBucket(txn({ description: "McDonald's", rawText: 'MCDONALDS DOVETON 2', category: 'takeaway' })),
    ).toEqual({ bucket: 'eating-out', reason: 'bank-category:takeaway' });
    expect(autoBucket(txn({ category: 'fuel' }))?.bucket).toBe('transport');
    expect(autoBucket(txn({ category: 'mobile-phone' }))?.bucket).toBe('bills');
  });

  it('falls back to unmistakable merchant patterns', () => {
    expect(autoBucket(txn({ description: 'Eftpos Debit 123 McDonalds Endeav Hil' }))?.bucket).toBe('eating-out');
    expect(autoBucket(txn({ description: 'Woolworths 3177 Maffra Aus' }))).toEqual({
      bucket: 'groceries',
      reason: 'merchant:Woolworths',
    });
    expect(autoBucket(txn({ description: 'Paypal *spotify*p1da2d 4029357733' }))?.bucket).toBe('subscriptions');
  });

  it('prefers the bank category over merchant patterns', () => {
    // e.g. a Woolworths fuel purchase categorised as fuel by the bank
    expect(autoBucket(txn({ description: 'Woolworths Petrol 123', category: 'fuel' }))?.bucket).toBe('transport');
  });

  it('leaves ambiguous and non-candidate transactions alone', () => {
    expect(autoBucket(txn({ description: 'Some Local Shop' }))).toBeNull();
    expect(autoBucket(txn({ category: 'gifts-and-charity' }))).toBeNull();
    expect(autoBucket(txn({ description: 'Woolworths 3177', isTransfer: true }))).toBeNull();
    expect(autoBucket(txn({ description: 'Woolworths 3177', settled: false }))).toBeNull();
  });
});
