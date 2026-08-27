import type { CashflowSummary, RecurringSeries } from '@upsiedaisy/core';

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

async function request<T>(path: string): Promise<T> {
  const headers: Record<string, string> = {};
  const token = getStoredToken();
  if (token) headers['X-Up-Token'] = token;
  const res = await fetch(path, { headers });
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
};
