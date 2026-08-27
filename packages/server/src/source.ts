import type { Txn } from '@upsiedaisy/core';

/** A bank account as exposed by the UpsieDaisy API. */
export interface Account {
  id: string;
  displayName: string;
  accountType: string;
  ownershipType: string;
  balanceCents: number;
  currencyCode: string;
}

export interface GetTransactionsOptions {
  /** Only return transactions at or after this ISO timestamp. */
  since?: string;
  /** Only return transactions before this ISO timestamp. */
  until?: string;
  /** Safety cap on how many transactions to fetch. Default 2000. */
  limit?: number;
}

/**
 * Abstraction over "where transactions come from". `UpClient` implements it
 * against the real Up Bank API; `MockSource` implements it with synthetic
 * data for demo mode. A future adapter for another bank slots in here too.
 */
export interface TransactionSource {
  /** Verifies connectivity/credentials. Throws SourceError on failure. */
  ping(): Promise<void>;
  getAccounts(): Promise<Account[]>;
  getTransactions(opts?: GetTransactionsOptions): Promise<Txn[]>;
}

export class SourceError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = 'SourceError';
  }
}
