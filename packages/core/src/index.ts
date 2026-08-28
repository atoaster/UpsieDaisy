export * from './types.js';
export { normalizeMerchant } from './normalize.js';
export { detectRecurringSeries, detectBills, detectIncome } from './detect.js';
export { summarizeCashflow, type CashflowSummary } from './summary.js';
export { DEFAULT_BUCKETS, isValidBucketId, type Bucket } from './buckets.js';
export { autoBucket, type AutoBucketResult } from './autoBucket.js';
export {
  SUPERMARKET_CHAINS,
  classifySupermarket,
  supermarketBreakdown,
  type ChainBreakdownRow,
  type SupermarketChain,
} from './supermarkets.js';
