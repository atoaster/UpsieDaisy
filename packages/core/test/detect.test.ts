import { describe, expect, it } from 'vitest';
import {
  detectBills,
  detectIncome,
  detectRecurringSeries,
  normalizeMerchant,
  summarizeCashflow,
  type Txn,
} from '../src/index.js';

let nextId = 0;
function txn(partial: Partial<Txn> & Pick<Txn, 'description' | 'amountCents' | 'createdAt'>): Txn {
  return {
    id: `txn-${nextId++}`,
    settled: true,
    isTransfer: false,
    category: null,
    ...partial,
  };
}

/** Generate a series of transactions every `stepDays` days from `start`. */
function every(
  stepDays: number,
  count: number,
  start: string,
  make: (date: Date, i: number) => Txn,
): Txn[] {
  const out: Txn[] = [];
  const startMs = new Date(start).getTime();
  for (let i = 0; i < count; i++) {
    out.push(make(new Date(startMs + i * stepDays * 24 * 60 * 60 * 1000), i));
  }
  return out;
}

const NOW = new Date('2026-08-01T00:00:00Z');

describe('normalizeMerchant', () => {
  it('strips reference numbers, dates and card masks', () => {
    expect(normalizeMerchant('NETFLIX.COM 4059')).toBe('netflix com');
    expect(normalizeMerchant('NETFLIX.COM 9911')).toBe('netflix com');
    expect(normalizeMerchant('AGL RETAIL REF 8842213')).toBe('agl retail');
    expect(normalizeMerchant('WOOLWORTHS 1234 xxxx4821')).toBe('woolworths');
    expect(normalizeMerchant('Telstra Corp Ltd 03/05/2026')).toBe('telstra');
  });
});

describe('detectRecurringSeries', () => {
  it('detects a monthly subscription with varying reference suffixes', () => {
    const txns = every(0, 0, '2026-01-01', () => {
      throw new Error('unused');
    });
    for (let m = 0; m < 6; m++) {
      txns.push(
        txn({
          description: `NETFLIX.COM ${4000 + m}`,
          amountCents: -1699,
          createdAt: new Date(Date.UTC(2026, m, 15)).toISOString(),
        }),
      );
    }
    const series = detectRecurringSeries(txns, { now: NOW });
    expect(series).toHaveLength(1);
    const s = series[0];
    expect(s.cadence).toBe('monthly');
    expect(s.direction).toBe('outgoing');
    expect(s.medianAmountCents).toBe(1699);
    expect(s.monthlyAmountCents).toBe(1699);
    expect(s.nextDate).toBe('2026-07-15');
    expect(s.confidence).toBeGreaterThan(0.6);
    expect(s.occurrences).toBe(6);
  });

  it('keeps a monthly bill anchored to month-end', () => {
    const txns = [
      txn({ description: 'RENT', amountCents: -180000, createdAt: '2026-01-31T00:00:00Z' }),
      txn({ description: 'RENT', amountCents: -180000, createdAt: '2026-02-28T00:00:00Z' }),
      txn({ description: 'RENT', amountCents: -180000, createdAt: '2026-03-31T00:00:00Z' }),
      txn({ description: 'RENT', amountCents: -180000, createdAt: '2026-04-30T00:00:00Z' }),
    ];
    const [s] = detectRecurringSeries(txns, { now: NOW });
    expect(s.cadence).toBe('monthly');
    expect(s.nextDate).toBe('2026-05-30');
  });

  it('detects fortnightly salary as income', () => {
    const txns = every(14, 10, '2026-01-08', (d) =>
      txn({ description: 'FAIRTEK PAYROLL', amountCents: 285000, createdAt: d.toISOString() }),
    );
    const income = detectIncome(txns, { now: NOW });
    expect(income).toHaveLength(1);
    expect(income[0].cadence).toBe('fortnightly');
    expect(income[0].monthlyAmountCents).toBe(Math.round((285000 * 26) / 12));
  });

  it('tolerates amount variation in utility bills', () => {
    const amounts = [-14520, -16103, -13987, -15544];
    const txns = amounts.map((a, i) =>
      txn({
        description: `AGL RETAIL REF ${100 + i}`,
        amountCents: a,
        createdAt: new Date(Date.UTC(2025, 8 + i * 3, 12)).toISOString(),
      }),
    );
    const [s] = detectBills(txns, { now: NOW });
    expect(s).toBeDefined();
    expect(s.cadence).toBe('quarterly');
  });

  it('ignores transfers and sub-weekly spending', () => {
    const transfers = every(14, 8, '2026-01-01', (d) =>
      txn({ description: 'Transfer to Savings', amountCents: -50000, createdAt: d.toISOString(), isTransfer: true }),
    );
    const coffee = every(2, 40, '2026-01-01', (d, i) =>
      txn({ description: 'SOUL ORIGIN', amountCents: -520 - (i % 3) * 60, createdAt: d.toISOString() }),
    );
    expect(detectRecurringSeries([...transfers, ...coffee], { now: NOW })).toHaveLength(0);
  });

  it('counts pending (HELD) transactions as final', () => {
    const gym = every(30, 5, '2026-01-01', (d) =>
      txn({ description: 'GYM MEMBERSHIP', amountCents: -2500, createdAt: d.toISOString(), settled: false }),
    );
    const [s] = detectRecurringSeries(gym, { now: NOW });
    expect(s).toBeDefined();
    expect(s.cadence).toBe('monthly');
    expect(s.occurrences).toBe(5);
  });

  it('gives erratic spending low confidence', () => {
    const days = [0, 9, 11, 34, 39, 71, 74];
    const txns = days.map((d, i) =>
      txn({
        description: 'RANDOM SHOP',
        amountCents: -(1000 + i * 700),
        createdAt: new Date(Date.UTC(2026, 0, 1 + d)).toISOString(),
      }),
    );
    const series = detectRecurringSeries(txns, { now: NOW, minConfidence: 0 });
    expect(series[0]?.confidence ?? 0).toBeLessThan(0.4);
  });

  it('groups by rawText so a user-renamed description does not split a series', () => {
    const txns: Txn[] = [];
    for (let m = 0; m < 6; m++) {
      txns.push(
        txn({
          // renamed by the user halfway through the series
          description: m < 3 ? 'Up Savings' : 'Gerald (Westpac)',
          rawText: `OSKO DEPOSIT WESTPAC ${7000 + m}`,
          amountCents: 50000,
          createdAt: new Date(Date.UTC(2026, m, 20)).toISOString(),
        }),
      );
    }
    const series = detectRecurringSeries(txns, { now: NOW });
    expect(series).toHaveLength(1);
    expect(series[0].cadence).toBe('monthly');
    expect(series[0].occurrences).toBe(6);
    // display name follows the latest description
    expect(series[0].name).toBe('Gerald (Westpac)');
  });

  it('falls back to description grouping when rawText is missing or blank', () => {
    const txns = every(14, 6, '2026-01-05', (d, i) =>
      txn({
        description: 'GYM DIRECT DEBIT',
        rawText: i % 2 === 0 ? null : '  ',
        amountCents: -3500,
        createdAt: d.toISOString(),
      }),
    );
    const [s] = detectRecurringSeries(txns, { now: NOW });
    expect(s.occurrences).toBe(6);
    expect(s.cadence).toBe('fortnightly');
  });

  it('collapses multiple same-day charges into one occurrence', () => {
    const txns = every(14, 6, '2026-01-01', (d) =>
      txn({ description: 'CHILDCARE CO', amountCents: -8000, createdAt: d.toISOString() }),
    );
    // duplicate charge on the first day (e.g. two siblings billed separately)
    txns.push(txn({ description: 'CHILDCARE CO', amountCents: -8000, createdAt: '2026-01-01T09:00:00Z' }));
    const [s] = detectRecurringSeries(txns, { now: NOW });
    expect(s.occurrences).toBe(6);
    expect(s.cadence).toBe('fortnightly');
  });
});

describe('summarizeCashflow', () => {
  it('computes monthly totals, upcoming and overdue', () => {
    const rent = every(30, 6, '2026-02-05', (d) =>
      txn({ description: 'RAY WHITE RENT', amountCents: -190000, createdAt: d.toISOString() }),
    );
    const salary = every(14, 12, '2026-02-04', (d) =>
      txn({ description: 'ACME PAYROLL', amountCents: 300000, createdAt: d.toISOString() }),
    );
    const lapsed = every(30, 4, '2026-01-10', (d) =>
      txn({ description: 'OLD GYM', amountCents: -6000, createdAt: d.toISOString() }),
    );
    const all = [...rent, ...salary, ...lapsed];
    const summary = summarizeCashflow(
      detectBills(all, { now: NOW }),
      detectIncome(all, { now: NOW }),
    );
    expect(summary.monthlyIncomeCents).toBe(Math.round((300000 * 26) / 12));
    expect(summary.monthlyBillsCents).toBeGreaterThan(0);
    expect(summary.overdue.some((s) => s.name === 'OLD GYM')).toBe(true);
    expect(summary.upcoming.every((s) => s.daysUntilNext >= 0 && s.daysUntilNext <= 30)).toBe(true);
  });
});
