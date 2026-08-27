import type {
  Cadence,
  DetectOptions,
  Direction,
  RecurringSeries,
  Txn,
} from './types.js';
import { normalizeMerchant } from './normalize.js';

const DAY_MS = 24 * 60 * 60 * 1000;

interface Occurrence {
  /** Midnight UTC of the occurrence day. */
  day: number;
  /** Summed absolute amount for that day, in cents. */
  amountCents: number;
  txnIds: string[];
  descriptions: string[];
  categories: (string | null | undefined)[];
}

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 === 0 ? (s[mid - 1] + s[mid]) / 2 : s[mid];
}

/** Median absolute deviation — robust spread measure. */
function mad(xs: number[]): number {
  const m = median(xs);
  return median(xs.map((x) => Math.abs(x - m)));
}

function mostCommon<T>(xs: T[]): T | undefined {
  const counts = new Map<T, number>();
  let best: T | undefined;
  let bestCount = 0;
  for (const x of xs) {
    const c = (counts.get(x) ?? 0) + 1;
    counts.set(x, c);
    if (c > bestCount) {
      best = x;
      bestCount = c;
    }
  }
  return best;
}

function classifyCadence(gapDays: number): { cadence: Cadence; nominalDays: number } {
  if (gapDays >= 6 && gapDays <= 8) return { cadence: 'weekly', nominalDays: 7 };
  if (gapDays >= 12 && gapDays <= 16) return { cadence: 'fortnightly', nominalDays: 14 };
  if (gapDays >= 26 && gapDays <= 35) return { cadence: 'monthly', nominalDays: 30.44 };
  if (gapDays >= 80 && gapDays <= 100) return { cadence: 'quarterly', nominalDays: 91.3 };
  if (gapDays >= 340 && gapDays <= 390) return { cadence: 'yearly', nominalDays: 365.25 };
  return { cadence: 'irregular', nominalDays: gapDays };
}

function monthlyEquivalentCents(cadence: Cadence, amountCents: number, intervalDays: number): number {
  switch (cadence) {
    case 'weekly':
      return Math.round((amountCents * 52) / 12);
    case 'fortnightly':
      return Math.round((amountCents * 26) / 12);
    case 'monthly':
      return amountCents;
    case 'quarterly':
      return Math.round(amountCents / 3);
    case 'yearly':
      return Math.round(amountCents / 12);
    case 'irregular':
      return intervalDays > 0 ? Math.round((amountCents * 30.44) / intervalDays) : amountCents;
  }
}

/** Add `n` calendar months in UTC, clamping to the end of the target month. */
function addMonthsClamped(day: number, n: number): number {
  const d = new Date(day);
  const targetMonth = d.getUTCMonth() + n;
  const result = new Date(Date.UTC(d.getUTCFullYear(), targetMonth, 1));
  const daysInTarget = new Date(
    Date.UTC(result.getUTCFullYear(), result.getUTCMonth() + 1, 0),
  ).getUTCDate();
  result.setUTCDate(Math.min(d.getUTCDate(), daysInTarget));
  return result.getTime();
}

function isoDay(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

/**
 * Detect recurring transaction series (bills, subscriptions, salary) from a
 * flat list of transactions.
 *
 * The approach:
 *  1. Group settled, non-transfer transactions by direction + normalised
 *     merchant name, collapsing same-day charges into single occurrences.
 *  2. For each group, look at the gaps between occurrence days and classify
 *     the cadence (weekly / fortnightly / monthly / quarterly / yearly)
 *     from the median gap.
 *  3. Score confidence from three signals: how regular the gaps are, how
 *     consistent the amounts are, and how many occurrences we have seen.
 *  4. Predict the next occurrence (calendar-aware for monthly bills, so a
 *     bill charged on the 31st stays on month-end).
 */
export function detectRecurringSeries(txns: Txn[], opts: DetectOptions = {}): RecurringSeries[] {
  const minOccurrences = opts.minOccurrences ?? 3;
  const minConfidence = opts.minConfidence ?? 0.4;
  const now = (opts.now ?? new Date()).getTime();

  // Group by direction + normalised merchant, collapsing same-day charges.
  const groups = new Map<string, Map<number, Occurrence>>();
  for (const t of txns) {
    if (!t.settled || t.isTransfer || t.amountCents === 0) continue;
    const direction: Direction = t.amountCents < 0 ? 'outgoing' : 'incoming';
    const key = `${direction}:${normalizeMerchant(t.description)}`;
    const day = new Date(t.createdAt).setUTCHours(0, 0, 0, 0);
    let byDay = groups.get(key);
    if (!byDay) {
      byDay = new Map();
      groups.set(key, byDay);
    }
    const occ = byDay.get(day);
    if (occ) {
      occ.amountCents += Math.abs(t.amountCents);
      occ.txnIds.push(t.id);
      occ.descriptions.push(t.description);
      occ.categories.push(t.category);
    } else {
      byDay.set(day, {
        day,
        amountCents: Math.abs(t.amountCents),
        txnIds: [t.id],
        descriptions: [t.description],
        categories: [t.category],
      });
    }
  }

  const series: RecurringSeries[] = [];

  for (const [key, byDay] of groups) {
    const occurrences = [...byDay.values()].sort((a, b) => a.day - b.day);
    if (occurrences.length < minOccurrences) continue;

    const gaps: number[] = [];
    for (let i = 1; i < occurrences.length; i++) {
      gaps.push((occurrences[i].day - occurrences[i - 1].day) / DAY_MS);
    }
    const medianGap = median(gaps);
    if (medianGap < 5) continue; // more often than weekly → everyday spending, not a bill
    const { cadence, nominalDays } = classifyCadence(medianGap);

    const amounts = occurrences.map((o) => o.amountCents);
    const medianAmount = median(amounts);

    // Gap regularity: 1 when every gap equals the median, falling to 0 as the
    // spread reaches 35% of the interval.
    const gapSpread = mad(gaps) / Math.max(medianGap, 1);
    const regularity = Math.max(0, Math.min(1, 1 - gapSpread / 0.35));

    // Amount consistency: bills like utilities legitimately vary, so this is
    // scored gently — 1 for identical amounts, 0 once spread reaches 60%.
    const amountSpread = mad(amounts) / Math.max(medianAmount, 1);
    const amountScore = Math.max(0, Math.min(1, 1 - amountSpread / 0.6));

    // Evidence: 3 occurrences is minimal proof, 6+ is solid.
    const countScore = Math.max(0, Math.min(1, (occurrences.length - 2) / 4));

    const cadencePenalty = cadence === 'irregular' ? 0.5 : 1;
    const confidence =
      (0.5 * regularity + 0.2 * amountScore + 0.3 * countScore) * cadencePenalty;
    if (confidence < minConfidence) continue;

    const last = occurrences[occurrences.length - 1];
    const nextMs =
      cadence === 'monthly'
        ? addMonthsClamped(last.day, 1)
        : cadence === 'quarterly'
          ? addMonthsClamped(last.day, 3)
          : cadence === 'yearly'
            ? addMonthsClamped(last.day, 12)
            : last.day + Math.round(nominalDays) * DAY_MS;

    const allDescriptions = occurrences.flatMap((o) => o.descriptions);
    const allCategories = occurrences
      .flatMap((o) => o.categories)
      .filter((c): c is string => typeof c === 'string');

    series.push({
      key,
      name: mostCommon(allDescriptions) ?? allDescriptions[0],
      direction: key.startsWith('incoming') ? 'incoming' : 'outgoing',
      cadence,
      intervalDays: Math.round(medianGap * 10) / 10,
      occurrences: occurrences.length,
      medianAmountCents: Math.round(medianAmount),
      lastAmountCents: last.amountCents,
      monthlyAmountCents: monthlyEquivalentCents(cadence, Math.round(medianAmount), medianGap),
      firstDate: isoDay(occurrences[0].day),
      lastDate: isoDay(last.day),
      nextDate: isoDay(nextMs),
      daysUntilNext: Math.round((nextMs - now) / DAY_MS),
      confidence: Math.round(confidence * 100) / 100,
      transactionIds: occurrences.flatMap((o) => o.txnIds),
      category: mostCommon(allCategories) ?? null,
    });
  }

  return series.sort((a, b) => b.confidence - a.confidence);
}

/** Detected outgoing series — bills and subscriptions — soonest due first. */
export function detectBills(txns: Txn[], opts: DetectOptions = {}): RecurringSeries[] {
  return detectRecurringSeries(txns, opts)
    .filter((s) => s.direction === 'outgoing')
    .sort((a, b) => a.daysUntilNext - b.daysUntilNext);
}

/** Detected incoming series — salary and other recurring income. */
export function detectIncome(txns: Txn[], opts: DetectOptions = {}): RecurringSeries[] {
  return detectRecurringSeries(txns, opts)
    .filter((s) => s.direction === 'incoming')
    .sort((a, b) => b.monthlyAmountCents - a.monthlyAmountCents);
}
