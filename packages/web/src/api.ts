import type { Bucket, CashflowSummary, RecurringSeries, Txn } from '@upsiedaisy/core';

export type { Bucket };

export interface TxnWithBucket extends Txn {
  bucket: string | null;
  /** 'manual' = user-assigned, 'auto' = rule-assigned, null = uncategorised. */
  bucketSource: 'manual' | 'auto' | null;
  /** For auto assignments: which rule fired. */
  bucketReason?: string;
}

export interface Account {
  id: string;
  displayName: string;
  accountType: string;
  ownershipType: string;
  balanceCents: number;
  currencyCode: string;
}

export interface Health {
  status: string;
  demoMode: boolean;
  serverTokenConfigured: boolean;
}

export interface SummaryResponse {
  summary: CashflowSummary;
  bills: RecurringSeries[];
  income: RecurringSeries[];
}

const TOKEN_STORAGE_KEY = 'upsiedaisy.upToken';

/**
 * The Up token entered in the UI lives only in this browser's localStorage
 * and is sent per-request to the UpsieDaisy backend. It is never persisted
 * server-side and never appears anywhere in this repository.
 */
export function getStoredToken(): string {
  try {
    return localStorage.getItem(TOKEN_STORAGE_KEY) ?? '';
  } catch {
    return '';
  }
}

export function setStoredToken(token: string): void {
  try {
    if (token) localStorage.setItem(TOKEN_STORAGE_KEY, token);
    else localStorage.removeItem(TOKEN_STORAGE_KEY);
  } catch {
    // storage unavailable (private mode) — token just won't persist
  }
}

async function request<T>(path: string, init?: { method?: string; json?: unknown }): Promise<T> {
  const headers: Record<string, string> = {};
  const token = getStoredToken();
  if (token) headers['X-Up-Token'] = token;
  if (init?.json !== undefined) headers['Content-Type'] = 'application/json';
  const res = await fetch(path, {
    method: init?.method ?? 'GET',
    headers,
    body: init?.json !== undefined ? JSON.stringify(init.json) : undefined,
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error((body as { error?: string }).error ?? `Request failed (${res.status})`);
  }
  return body as T;
}

export const api = {
  health: () => request<Health>('/api/health'),
  ping: () => request<{ ok: boolean; demo: boolean }>('/api/ping'),
  accounts: () => request<{ accounts: Account[] }>('/api/accounts'),
  summary: (days = 365) => request<SummaryResponse>(`/api/summary?days=${days}`),
  transactions: (days = 365) =>
    request<{ transactions: TxnWithBucket[] }>(`/api/transactions?days=${days}`),
  buckets: () => request<{ buckets: Bucket[] }>('/api/buckets'),
  assignBucket: (transactionId: string, bucket: string | null) =>
    request<{ ok: boolean }>(`/api/transactions/${encodeURIComponent(transactionId)}/bucket`, {
      method: 'POST',
      json: { bucket },
    }),
};
