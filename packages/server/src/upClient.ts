import type { Txn } from '@upsiedaisy/core';
import {
  SourceError,
  type Account,
  type GetTransactionsOptions,
  type TransactionSource,
} from './source.js';

const UP_API_BASE = 'https://api.up.com.au/api/v1';
const PAGE_SIZE = 100;

/** Minimal typings for the Up API resources we consume. */
interface UpAccountResource {
  id: string;
  attributes: {
    displayName: string;
    accountType: string;
    ownershipType: string;
    balance: { currencyCode: string; valueInBaseUnits: number };
  };
}

interface UpTransactionResource {
  id: string;
  attributes: {
    status: 'HELD' | 'SETTLED';
    rawText: string | null;
    description: string;
    amount: { currencyCode: string; valueInBaseUnits: number };
    createdAt: string;
    transferAccount?: unknown;
  };
  relationships: {
    account?: { data: { id: string } | null };
    transferAccount?: { data: { id: string } | null };
    category?: { data: { id: string } | null };
  };
}

interface UpPage<T> {
  data: T[];
  links: { next: string | null };
}

/**
 * Thin client for the Up Bank API (https://developer.up.com.au/).
 * The token is held in memory only for the lifetime of a request cycle and
 * is never logged or persisted.
 */
export class UpClient implements TransactionSource {
  constructor(private readonly token: string) {}

  private async request<T>(url: string): Promise<T> {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${this.token}` },
    });
    if (!res.ok) {
      if (res.status === 401) {
        throw new SourceError('Up API rejected the token (401). Check your personal access token.', 401);
      }
      if (res.status === 429) {
        throw new SourceError('Up API rate limit reached (429). Try again shortly.', 429);
      }
      throw new SourceError(`Up API request failed with status ${res.status}.`, 502);
    }
    return (await res.json()) as T;
  }

  async ping(): Promise<void> {
    await this.request(`${UP_API_BASE}/util/ping`);
  }

  async getAccounts(): Promise<Account[]> {
    const accounts: Account[] = [];
    let url: string | null = `${UP_API_BASE}/accounts?page[size]=${PAGE_SIZE}`;
    while (url) {
      const page: UpPage<UpAccountResource> = await this.request(url);
      for (const a of page.data) {
        accounts.push({
          id: a.id,
          displayName: a.attributes.displayName,
          accountType: a.attributes.accountType,
          ownershipType: a.attributes.ownershipType,
          balanceCents: a.attributes.balance.valueInBaseUnits,
          currencyCode: a.attributes.balance.currencyCode,
        });
      }
      url = page.links.next;
    }
    return accounts;
  }

  async getTransactions(opts: GetTransactionsOptions = {}): Promise<Txn[]> {
    const limit = opts.limit ?? 2000;
    const params = new URLSearchParams({ 'page[size]': String(PAGE_SIZE) });
    if (opts.since) params.set('filter[since]', opts.since);
    if (opts.until) params.set('filter[until]', opts.until);

    const txns: Txn[] = [];
    let url: string | null = `${UP_API_BASE}/transactions?${params.toString()}`;
    while (url && txns.length < limit) {
      const page: UpPage<UpTransactionResource> = await this.request(url);
      for (const t of page.data) {
        txns.push({
          id: t.id,
          description: t.attributes.description,
          rawText: t.attributes.rawText,
          amountCents: t.attributes.amount.valueInBaseUnits,
          createdAt: t.attributes.createdAt,
          settled: t.attributes.status === 'SETTLED',
          isTransfer: Boolean(t.relationships.transferAccount?.data),
          category: t.relationships.category?.data?.id ?? null,
          accountId: t.relationships.account?.data?.id ?? null,
        });
      }
      url = page.links.next;
    }
    return txns.slice(0, limit);
  }
}
