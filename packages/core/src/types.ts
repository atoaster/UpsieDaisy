/**
 * Bank-agnostic transaction shape. The server adapts Up API resources into
 * this; a future mobile app (or another bank adapter) can do the same.
 */
export interface Txn {
  id: string;
  /** Raw statement description, e.g. "NETFLIX.COM 4059xxxx" */
  description: string;
  /** Signed amount in cents. Negative = money out, positive = money in. */
  amountCents: number;
  /** ISO 8601 timestamp of when the transaction was created. */
  createdAt: string;
  /** Whether the transaction has settled (vs. still held/pending). */
  settled: boolean;
  /** True for transfers between the user's own accounts (never a bill). */
  isTransfer: boolean;
  /** Optional bank-provided category id, e.g. "utilities". */
  category?: string | null;
}

export type Cadence =
  | 'weekly'
  | 'fortnightly'
  | 'monthly'
  | 'quarterly'
  | 'yearly'
  | 'irregular';

export type Direction = 'incoming' | 'outgoing';

/** A detected recurring payment series: a bill, subscription or salary. */
export interface RecurringSeries {
  /** Stable key derived from the normalised merchant name + direction. */
  key: string;
  /** Human-friendly display name (the most common raw description). */
  name: string;
  direction: Direction;
  cadence: Cadence;
  /** Median gap between occurrences, in days. */
  intervalDays: number;
  /** Number of distinct occurrence days observed. */
  occurrences: number;
  /** Median per-occurrence amount, in cents (always positive). */
  medianAmountCents: number;
  /** Amount of the most recent occurrence, in cents (always positive). */
  lastAmountCents: number;
  /** Approximate cost/income per month, in cents (always positive). */
  monthlyAmountCents: number;
  /** ISO date of the first observed occurrence. */
  firstDate: string;
  /** ISO date of the most recent occurrence. */
  lastDate: string;
  /** Predicted ISO date of the next occurrence. */
  nextDate: string;
  /** Days from `now` until `nextDate`; negative means overdue/possibly ended. */
  daysUntilNext: number;
  /** 0..1 — how confident we are this is a genuine recurring series. */
  confidence: number;
  /** Ids of the transactions that make up this series, oldest first. */
  transactionIds: string[];
  /** Bank category of the majority of transactions, if any. */
  category?: string | null;
}

export interface DetectOptions {
  /** Minimum distinct occurrence days before a group is considered. Default 3. */
  minOccurrences?: number;
  /** Series below this confidence are dropped. Default 0.4. */
  minConfidence?: number;
  /** "Now" for next-date / overdue calculations. Default: current time. */
  now?: Date;
}
