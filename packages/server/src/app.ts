import cors from 'cors';
import express, { type NextFunction, type Request, type Response } from 'express';
import {
  DEFAULT_BUCKETS,
  detectBills,
  detectIncome,
  isValidBucketId,
  summarizeCashflow,
  type Txn,
} from '@upsiedaisy/core';
import { BucketStore } from './store.js';
import { TtlCache } from './cache.js';
import type { Config } from './config.js';
import { MockSource } from './mockSource.js';
import { SourceError, type TransactionSource } from './source.js';
import { UpClient } from './upClient.js';

const TXN_CACHE_TTL_MS = 60_000;
const DEFAULT_LOOKBACK_DAYS = 365;

interface SourceContext {
  source: TransactionSource;
  /** Cache key discriminator; a hash of the token, or 'demo'. */
  cacheId: string;
}

/**
 * Resolve the transaction source for a request.
 * Precedence: X-Up-Token header (an explicit client choice) → demo mode
 * (explicitly enabled at startup, wins over a configured env token so
 * `npm run demo` behaves as demo regardless of .env) → UP_API_TOKEN env.
 */
function resolveSource(req: Request, config: Config): SourceContext {
  const headerToken = req.header('x-up-token')?.trim();
  if (headerToken) return { source: new UpClient(headerToken), cacheId: headerToken };
  if (config.demoMode) return { source: new MockSource(), cacheId: 'demo' };
  if (config.upToken) return { source: new UpClient(config.upToken), cacheId: config.upToken };
  throw new SourceError(
    'No Up API token configured. Set UP_API_TOKEN in the server environment, ' +
      'send an X-Up-Token header, or start the server with UPSIE_DEMO=1.',
    401,
  );
}

export function createApp(config: Config): express.Express {
  const app = express();
  app.use(cors());
  app.use(express.json());

  const txnCache = new TtlCache<Txn[]>(TXN_CACHE_TTL_MS);
  const bucketStore = new BucketStore(config.dataDir);

  const getTxns = async (ctx: SourceContext, days: number): Promise<Txn[]> => {
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
    return txnCache.getOrLoad([ctx.cacheId, since.slice(0, 13)], () =>
      ctx.source.getTransactions({ since }),
    );
  };

  const wrap =
    (handler: (req: Request, res: Response) => Promise<void>) =>
    (req: Request, res: Response, next: NextFunction) => {
      handler(req, res).catch(next);
    };

  const parseDays = (req: Request): number => {
    const days = Number(req.query.days);
    return Number.isFinite(days) && days > 0 && days <= 730 ? days : DEFAULT_LOOKBACK_DAYS;
  };

  const parseMinConfidence = (req: Request): number => {
    const c = Number(req.query.minConfidence);
    return Number.isFinite(c) && c >= 0 && c <= 1 ? c : 0.4;
  };

  /** Liveness + configuration status (never exposes token material). */
  app.get('/api/health', (req, res) => {
    res.json({
      status: 'ok',
      demoMode: config.demoMode,
      serverTokenConfigured: Boolean(config.upToken),
    });
  });

  /** Verifies the effective token against the Up API. */
  app.get(
    '/api/ping',
    wrap(async (req, res) => {
      const ctx = resolveSource(req, config);
      await ctx.source.ping();
      res.json({ ok: true, demo: ctx.cacheId === 'demo' });
    }),
  );

  app.get(
    '/api/accounts',
    wrap(async (req, res) => {
      const ctx = resolveSource(req, config);
      res.json({ accounts: await ctx.source.getAccounts() });
    }),
  );

  /** Transactions, each carrying its assigned bucket (or null). */
  app.get(
    '/api/transactions',
    wrap(async (req, res) => {
      const ctx = resolveSource(req, config);
      const txns = await getTxns(ctx, parseDays(req));
      const assignments = bucketStore.getAll(ctx.cacheId);
      res.json({
        transactions: txns.map((t) => ({ ...t, bucket: assignments[t.id] ?? null })),
      });
    }),
  );

  /** The available spending buckets. */
  app.get('/api/buckets', (req, res) => {
    res.json({ buckets: DEFAULT_BUCKETS });
  });

  /**
   * Assign a transaction to a bucket ({"bucket": "groceries"}), or clear the
   * assignment ({"bucket": null}). Durable across restarts; scoped per user.
   */
  app.post(
    '/api/transactions/:id/bucket',
    wrap(async (req, res) => {
      const ctx = resolveSource(req, config);
      const bucket = (req.body as { bucket?: string | null } | undefined)?.bucket ?? null;
      if (bucket !== null && !isValidBucketId(bucket)) {
        res.status(400).json({ error: `Unknown bucket: ${bucket}` });
        return;
      }
      bucketStore.set(ctx.cacheId, req.params.id, bucket);
      res.json({ ok: true, transactionId: req.params.id, bucket });
    }),
  );

  /** Auto-discovered bills & subscriptions, soonest due first. */
  app.get(
    '/api/bills',
    wrap(async (req, res) => {
      const ctx = resolveSource(req, config);
      const txns = await getTxns(ctx, parseDays(req));
      res.json({ bills: detectBills(txns, { minConfidence: parseMinConfidence(req) }) });
    }),
  );

  /** Auto-discovered recurring income (salary etc.), largest first. */
  app.get(
    '/api/income',
    wrap(async (req, res) => {
      const ctx = resolveSource(req, config);
      const txns = await getTxns(ctx, parseDays(req));
      res.json({ income: detectIncome(txns, { minConfidence: parseMinConfidence(req) }) });
    }),
  );

  /** Cashflow overview: monthly totals, upcoming and overdue bills. */
  app.get(
    '/api/summary',
    wrap(async (req, res) => {
      const ctx = resolveSource(req, config);
      const txns = await getTxns(ctx, parseDays(req));
      const minConfidence = parseMinConfidence(req);
      const bills = detectBills(txns, { minConfidence });
      const income = detectIncome(txns, { minConfidence });
      res.json({ summary: summarizeCashflow(bills, income), bills, income });
    }),
  );

  // Error handler: map SourceErrors to their status; never leak internals.
  app.use((err: unknown, req: Request, res: Response, next: NextFunction) => {
    if (res.headersSent) return next(err);
    if (err instanceof SourceError) {
      res.status(err.status).json({ error: err.message });
      return;
    }
    console.error('Unhandled error:', err instanceof Error ? err.message : err);
    res.status(500).json({ error: 'Internal server error' });
  });

  return app;
}
