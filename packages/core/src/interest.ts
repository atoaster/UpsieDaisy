import type { Txn } from './types.js';

/**
 * Saver interest activation status, inferred from transaction data.
 *
 * The Up API exposes no "interest activated" flag (verified against
 * developer.up.com.au: AccountResource has only name/type/ownership/balance).
 * Up's product rule is that interest is earned in months where at least
 * $100 is deposited into Savers, so activation is computed from observable
 * data instead: settled credits into SAVER accounts this calendar month,
 * with actual "Interest" credit transactions reported as ground truth for
 * whether interest was recently paid. The rule is a product term, not an API
 * contract — the threshold is a parameter in case it changes.
 */

export interface AccountLike {
  id: string;
  accountType: string;
}

export interface InterestStatus {
  /** true/false when computable; null when txns carry no account info or there are no savers. */
  activated: boolean | null;
  /** Why activated is what it is. */
  reason: 'deposits-met' | 'deposits-not-met' | 'no-saver-accounts' | 'no-account-data';
  /** Settled non-interest credits into savers this calendar month, in cents. */
  monthDepositsCents: number;
  /** Deposit threshold used, in cents. */
  requiredDepositsCents: number;
  /** The calendar month evaluated, e.g. "2026-09". */
  month: string;
  /** Most recent interest credit observed, if any. */
  lastInterestPayment: { date: string; amountCents: number } | null;
  saverAccountIds: string[];
}

const DEFAULT_REQUIRED_CENTS = 100_00;

function isInterestPayment(t: Txn): boolean {
  return t.amountCents > 0 && /^interest\b/i.test((t.rawText?.trim() || t.description).trim());
}

export interface InterestOptions {
  requiredDepositsCents?: number;
  now?: Date;
}

export function saverInterestStatus(
  accounts: AccountLike[],
  txns: Txn[],
  opts: InterestOptions = {},
): InterestStatus {
  const required = opts.requiredDepositsCents ?? DEFAULT_REQUIRED_CENTS;
  const now = opts.now ?? new Date();
  const month = now.toISOString().slice(0, 7);
  const monthStart = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1);

  const saverIds = accounts.filter((a) => a.accountType === 'SAVER').map((a) => a.id);

  const interestPayments = txns
    .filter((t) => t.settled && isInterestPayment(t))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const last = interestPayments[0];
  const lastInterestPayment = last
    ? { date: last.createdAt.slice(0, 10), amountCents: last.amountCents }
    : null;

  const base = {
    requiredDepositsCents: required,
    month,
    lastInterestPayment,
    saverAccountIds: saverIds,
  };

  if (saverIds.length === 0) {
    return { ...base, activated: null, reason: 'no-saver-accounts', monthDepositsCents: 0 };
  }
  // Without per-transaction account info (some sources don't provide it),
  // saver deposits cannot be computed — say so rather than guessing.
  if (!txns.some((t) => t.accountId)) {
    return { ...base, activated: null, reason: 'no-account-data', monthDepositsCents: 0 };
  }

  const saverIdSet = new Set(saverIds);
  const monthDepositsCents = txns
    .filter(
      (t) =>
        t.settled &&
        t.amountCents > 0 &&
        t.accountId != null &&
        saverIdSet.has(t.accountId) &&
        new Date(t.createdAt).getTime() >= monthStart &&
        !isInterestPayment(t),
    )
    .reduce((sum, t) => sum + t.amountCents, 0);

  const activated = monthDepositsCents >= required;
  return {
    ...base,
    activated,
    reason: activated ? 'deposits-met' : 'deposits-not-met',
    monthDepositsCents,
  };
}
