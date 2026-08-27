import { readFileSync } from 'node:fs';
import type { Txn } from '@upsiedaisy/core';
import {
  SourceError,
  type Account,
  type GetTransactionsOptions,
  type TransactionSource,
} from './source.js';

interface FixtureFile {
  accounts?: Account[];
  transactions: Txn[];
}

/**
 * Serves transactions from a local JSON file (UPSIE_FIXTURE=<path>). Used for
 * testing against realistic data — e.g. an anonymised export derived from
 * another bank's statement. Fixture files live under the gitignored data
 * directory and are never committed; only this loader is.
 */
export class FixtureSource implements TransactionSource {
  private readonly data: FixtureFile;

  constructor(path: string) {
    try {
      this.data = JSON.parse(readFileSync(path, 'utf8')) as FixtureFile;
    } catch (err) {
      throw new SourceError(
        `Could not read fixture file at ${path}: ${err instanceof Error ? err.message : err}`,
        500,
      );
    }
    if (!Array.isArray(this.data.transactions)) {
      throw new SourceError(`Fixture file ${path} has no "transactions" array.`, 500);
    }
  }

  async ping(): Promise<void> {
    // a readable fixture is always "connected"
  }

  async getAccounts(): Promise<Account[]> {
    return this.data.accounts ?? [];
  }

  async getTransactions(opts: GetTransactionsOptions = {}): Promise<Txn[]> {
    const since = opts.since ? new Date(opts.since).getTime() : -Infinity;
    const until = opts.until ? new Date(opts.until).getTime() : Infinity;
    return this.data.transactions
      .filter((t) => {
        const ts = new Date(t.createdAt).getTime();
        return ts >= since && ts < until;
      })
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, opts.limit ?? 2000);
  }
}
