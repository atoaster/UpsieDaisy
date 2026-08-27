import cors from 'cors';
import express, { type NextFunction, type Request, type Response } from 'express';
import {
  detectBills,
  detectIncome,
  summarizeCashflow,
  type Txn,
} from '@upsiedaisy/core';
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
 * Token precedence: X-Up-Token header (sent by the web/mobile client, held in
 * the client's own storage) → UP_API_TOKEN env var → demo mode if enabled.
 */
function resolveSource(req: Request, config: Config): SourceContext {
  const headerToken = req.header('x-up-token')?.trim();
  const token = headerToken || config.upToken;
  if (token) return { source: new UpClient(token), cacheId: token };
  if (config.demoMode) return { source: new MockSource(), cacheId: 'demo' };
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

  app.get(
    '/api/transactions',
    wrap(async (req, res) => {
      const ctx = resolveSource(req, config);
      const txns = await getTxns(ctx, parseDays(req));
      res.json({ transactions: txns });
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
