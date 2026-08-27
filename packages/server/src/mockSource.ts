import type { Txn } from '@upsiedaisy/core';
import type { Account, GetTransactionsOptions, TransactionSource } from './source.js';

const DAY_MS = 24 * 60 * 60 * 1000;

/** Deterministic pseudo-random generator so demo data is stable. */
function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Synthetic transaction source for demo mode: ~12 months of realistic
 * Australian household cashflow. Lets anyone evaluate UpsieDaisy — and the
 * bill-detection engine — without connecting a bank account.
 */
export class MockSource implements TransactionSource {
  async ping(): Promise<void> {
    // demo mode is always "connected"
  }

  async getAccounts(): Promise<Account[]> {
    return [
      {
        id: 'demo-spending',
        displayName: 'Spending (demo)',
        accountType: 'TRANSACTIONAL',
        ownershipType: 'INDIVIDUAL',
        balanceCents: 184_523,
        currencyCode: 'AUD',
      },
      {
        id: 'demo-saver',
        displayName: '🏠 House Deposit (demo)',
        accountType: 'SAVER',
        ownershipType: 'INDIVIDUAL',
        balanceCents: 3_250_000,
        currencyCode: 'AUD',
      },
    ];
  }

  async getTransactions(opts: GetTransactionsOptions = {}): Promise<Txn[]> {
    const rand = mulberry32(20260827);
    const now = Date.now();
    const start = now - 365 * DAY_MS;
    const txns: Txn[] = [];
    let id = 0;
    const push = (t: Omit<Txn, 'id'>) => txns.push({ id: `demo-${id++}`, ...t });

    // Fortnightly salary
    for (let ts = start + 4 * DAY_MS; ts < now; ts += 14 * DAY_MS) {
      push({
        description: 'FAIRTEK CONSULTING PAYROLL',
        amountCents: 312_450,
        createdAt: new Date(ts).toISOString(),
        settled: true,
        isTransfer: false,
        category: null,
      });
    }

    // Monthly rent on the 2nd
    for (let m = 0; m < 13; m++) {
      const d = new Date(now);
      d.setUTCDate(2);
      d.setUTCMonth(d.getUTCMonth() - m);
      if (d.getTime() > now || d.getTime() < start) continue;
      push({
        description: 'RAY WHITE REAL ESTATE RENT',
        amountCents: -215_000,
        createdAt: d.toISOString(),
        settled: true,
        isTransfer: false,
        category: 'home',
      });
    }

    // Monthly subscriptions with volatile reference suffixes
    const subs: Array<[string, number, number, string]> = [
      ['NETFLIX.COM', -1_899, 11, 'tv-and-music'],
      ['SPOTIFY P', -1_399, 17, 'tv-and-music'],
      ['VODAFONE PREPAID', -4_500, 21, 'mobile-phone'],
      ['NRMA INSURANCE', -14_250, 25, 'insurance'],
    ];
    for (const [name, amount, dayOfMonth, category] of subs) {
      for (let m = 0; m < 13; m++) {
        const d = new Date(now);
        d.setUTCDate(dayOfMonth);
        d.setUTCMonth(d.getUTCMonth() - m);
        if (d.getTime() > now || d.getTime() < start) continue;
        push({
          description: `${name} ${Math.floor(rand() * 90000 + 10000)}`,
          amountCents: amount,
          createdAt: d.toISOString(),
          settled: true,
          isTransfer: false,
          category,
        });
      }
    }

    // Quarterly electricity, varying amount
    for (let q = 0; q < 4; q++) {
      const ts = now - (18 + q * 91) * DAY_MS;
      if (ts < start) continue;
      push({
        description: `AGL RETAIL REF ${Math.floor(rand() * 9000000 + 1000000)}`,
        amountCents: -Math.round(28_000 + rand() * 9_000),
        createdAt: new Date(ts).toISOString(),
        settled: true,
        isTransfer: false,
        category: 'utilities',
      });
    }

    // Yearly car rego
    push({
      description: 'SERVICE NSW REGO',
      amountCents: -78_500,
      createdAt: new Date(now - 200 * DAY_MS).toISOString(),
      settled: true,
      isTransfer: false,
      category: 'car',
    });

    // Weekly savings transfer (must be excluded from bills)
    for (let ts = start + 6 * DAY_MS; ts < now; ts += 7 * DAY_MS) {
      push({
        description: 'Transfer to 🏠 House Deposit',
        amountCents: -40_000,
        createdAt: new Date(ts).toISOString(),
        settled: true,
        isTransfer: true,
        category: null,
      });
    }

    // Everyday noise: groceries and coffee at random intervals
    for (let ts = start; ts < now; ts += (1 + Math.floor(rand() * 4)) * DAY_MS) {
      push({
        description: rand() > 0.5 ? 'WOOLWORTHS 1234' : 'COLES 0482',
        amountCents: -Math.round(2_000 + rand() * 12_000),
        createdAt: new Date(ts).toISOString(),
        settled: true,
        isTransfer: false,
        category: 'groceries',
      });
      if (rand() > 0.6) {
        push({
          description: 'SOUL ORIGIN COFFEE',
          amountCents: -Math.round(450 + rand() * 300),
          createdAt: new Date(ts + 3 * 60 * 60 * 1000).toISOString(),
          settled: true,
          isTransfer: false,
          category: 'restaurants-and-cafes',
        });
      }
    }

    const since = opts.since ? new Date(opts.since).getTime() : -Infinity;
    const until = opts.until ? new Date(opts.until).getTime() : Infinity;
    return txns
      .filter((t) => {
        const ts = new Date(t.createdAt).getTime();
        return ts >= since && ts < until;
      })
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, opts.limit ?? 2000);
  }
}
