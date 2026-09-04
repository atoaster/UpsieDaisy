import { describe, expect, it } from 'vitest';
import { saverInterestStatus, type Txn } from '../src/index.js';

const NOW = new Date('2026-09-04T10:00:00Z');
const SPENDING = { id: 'acc-spend', accountType: 'TRANSACTIONAL' };
const SAVER = { id: 'acc-save', accountType: 'SAVER' };

let n = 0;
function txn(partial: Partial<Txn>): Txn {
  return {
    id: `t${n++}`,
    description: 'x',
    amountCents: 1000,
    createdAt: '2026-09-02T00:00:00Z',
    settled: true,
    isTransfer: false,
    category: null,
    accountId: 'acc-spend',
    ...partial,
  };
}

describe('saverInterestStatus', () => {
  it('activates when saver deposits this month reach the threshold', () => {
    const s = saverInterestStatus(
      [SPENDING, SAVER],
      [
        txn({ accountId: 'acc-save', amountCents: 6000, isTransfer: true }),
        txn({ accountId: 'acc-save', amountCents: 5000 }),
        txn({ accountId: 'acc-spend', amountCents: 100000 }), // spending deposits don't count
      ],
      { now: NOW },
    );
    expect(s.activated).toBe(true);
    expect(s.reason).toBe('deposits-met');
    expect(s.monthDepositsCents).toBe(11000);
    expect(s.month).toBe('2026-09');
  });

  it('does not count last month, withdrawals, or interest credits themselves', () => {
    const s = saverInterestStatus(
      [SAVER],
      [
        txn({ accountId: 'acc-save', amountCents: 50000, createdAt: '2026-08-30T00:00:00Z' }),
        txn({ accountId: 'acc-save', amountCents: -2000 }),
        txn({ accountId: 'acc-save', amountCents: 4000 }),
        txn({ accountId: 'acc-save', amountCents: 123, description: 'Interest' }),
      ],
      { now: NOW },
    );
    expect(s.activated).toBe(false);
    expect(s.reason).toBe('deposits-not-met');
    expect(s.monthDepositsCents).toBe(4000);
  });

  it('reports the most recent interest payment as ground truth', () => {
    const s = saverInterestStatus(
      [SAVER],
      [
        txn({ accountId: 'acc-save', amountCents: 87, description: 'Interest', createdAt: '2026-08-01T00:00:00Z' }),
        txn({ accountId: 'acc-save', amountCents: 91, description: 'Interest', createdAt: '2026-09-01T00:00:00Z' }),
      ],
      { now: NOW },
    );
    expect(s.lastInterestPayment).toEqual({ date: '2026-09-01', amountCents: 91 });
  });

  it('is honest when it cannot know', () => {
    const noSaver = saverInterestStatus([SPENDING], [txn({})], { now: NOW });
    expect(noSaver.activated).toBeNull();
    expect(noSaver.reason).toBe('no-saver-accounts');

    const noAccountData = saverInterestStatus(
      [SAVER],
      [txn({ accountId: null }), txn({ accountId: undefined })],
      { now: NOW },
    );
    expect(noAccountData.activated).toBeNull();
    expect(noAccountData.reason).toBe('no-account-data');
  });

  it('respects a custom threshold', () => {
    const s = saverInterestStatus(
      [SAVER],
      [txn({ accountId: 'acc-save', amountCents: 5000 })],
      { now: NOW, requiredDepositsCents: 5000 },
    );
    expect(s.activated).toBe(true);
  });
});
