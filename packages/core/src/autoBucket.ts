import { classifySupermarket } from './supermarkets.js';
import type { Txn } from './types.js';

/**
 * Automatic bucket assignment for unmistakable cases. Two signals, in order:
 *
 *  1. The bank's own category (Up categorises most card purchases, e.g.
 *     "takeaway"), mapped conservatively onto buckets. Only categories with
 *     one obvious home are mapped; ambiguous ones (gifts, travel, games) are
 *     deliberately left out.
 *  2. Merchant patterns for names that could not be anything else —
 *     supermarket chains, major fast-food, streaming services.
 *
 * The result is a fallback only: a manual assignment always wins, and the
 * server lets a user pin a transaction back to uncategorised.
 */

export interface AutoBucketResult {
  bucket: string;
  /** Which rule fired, e.g. "up-category:takeaway" or "merchant:fast food". */
  reason: string;
}

const BANK_CATEGORY_TO_BUCKET: Record<string, string> = {
  // eating out
  takeaway: 'eating-out',
  'restaurants-and-cafes': 'eating-out',
  'pubs-and-bars': 'eating-out',
  // groceries
  groceries: 'groceries',
  // transport
  fuel: 'transport',
  'public-transport': 'transport',
  'taxis-and-share-cars': 'transport',
  'toll-roads': 'transport',
  parking: 'transport',
  'car-insurance-and-maintenance': 'transport',
  'car-repayments': 'transport',
  cycling: 'transport',
  // bills
  utilities: 'bills',
  internet: 'bills',
  'mobile-phone': 'bills',
  rent: 'bills',
  'rates-and-insurance': 'bills',
  insurance: 'bills',
  // subscriptions
  'tv-and-music': 'subscriptions',
  // health
  'health-and-medical': 'health',
  'fitness-and-wellbeing': 'health',
  // shopping
  'clothing-and-accessories': 'shopping',
  'homeware-and-appliances': 'shopping',
  technology: 'shopping',
};

const MERCHANT_RULES: Array<{ pattern: RegExp; bucket: string; name: string }> = [
  {
    pattern:
      /\bmcdonald'?s?\b|\bkfc\b|\bhungry jacks?\b|\bsubway\b|\bdomino'?s?\b|\bnando'?s?\b|\bguzman\b|\bgrill'?d\b|\bred rooster\b/i,
    bucket: 'eating-out',
    name: 'fast food',
  },
  {
    pattern: /\bnetflix\b|\bspotify\b|\bdisney\s*(plus|\+)|\byoutube premium\b|apple\.com\/bill/i,
    bucket: 'subscriptions',
    name: 'streaming service',
  },
];

/** The automatic bucket for a transaction, or null when nothing is obvious. */
export function autoBucket(t: Txn): AutoBucketResult | null {
  if (!t.settled || t.isTransfer) return null;

  if (t.category) {
    const bucket = BANK_CATEGORY_TO_BUCKET[t.category];
    if (bucket) return { bucket, reason: `bank-category:${t.category}` };
  }

  const chain = classifySupermarket(t);
  if (chain) return { bucket: 'groceries', reason: `merchant:${chain.label}` };

  const text = t.rawText?.trim() || t.description;
  for (const rule of MERCHANT_RULES) {
    if (rule.pattern.test(text)) return { bucket: rule.bucket, reason: `merchant:${rule.name}` };
  }

  return null;
}
