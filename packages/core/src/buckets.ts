/**
 * Spending buckets a transaction can be assigned to. Kept in core so any
 * client (web, future mobile) shares the same set. Assignment persistence is
 * the server's concern.
 */
export interface Bucket {
  id: string;
  label: string;
}

export const DEFAULT_BUCKETS: Bucket[] = [
  { id: 'bills', label: 'Bills & utilities' },
  { id: 'subscriptions', label: 'Subscriptions' },
  { id: 'groceries', label: 'Groceries' },
  { id: 'eating-out', label: 'Eating out' },
  { id: 'transport', label: 'Transport' },
  { id: 'shopping', label: 'Shopping' },
  { id: 'health', label: 'Health' },
  { id: 'income', label: 'Income' },
  { id: 'savings', label: 'Savings & transfers' },
  { id: 'other', label: 'Other' },
];

export function isValidBucketId(id: string): boolean {
  return DEFAULT_BUCKETS.some((b) => b.id === id);
}
