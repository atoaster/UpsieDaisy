# CLAUDE.md — project context for AI-assisted development

## What this project is

UpsieDaisy tracks bills, subscriptions and salary for [Up Bank](https://up.com.au) customers
by **auto-discovering recurring payments from transaction history** — the problem it exists
to solve is that banks (including Up) have terrible bill auto-discovery. Public repo, MIT.

## Hard rules

- **Never commit credentials of any kind.** This repo is public. Tokens arrive only via a
  gitignored `.env` (`UP_API_TOKEN`) or a per-request `X-Up-Token` header from the client.
  Never log tokens, never write them to tracked files, never echo them in command output.
  Cache keys derived from tokens must be hashed (see `packages/server/src/cache.ts`).
- **Keep `README.md` updated** with any user-facing or architectural change. Owner's stated
  style: pragmatic, man-page voice — no sales pitch, no marketing tone, no emoji/badges.
  This is a tool, not a SaaS.
- **Keep this file updated** with decisions, learnings and state as work progresses.
- **The backend stays modular and client-agnostic** so the same API + core library can later
  power iOS/Android apps. The web app must only ever call the UpsieDaisy API, never the Up
  API directly. Platform-specific code never goes in `@upsiedaisy/core`.

## Architecture

npm-workspaces monorepo, TypeScript throughout, Node ≥ 20:

- `packages/core` (`@upsiedaisy/core`) — pure, dependency-free domain logic: merchant
  normalisation (`normalize.ts`), recurrence detection (`detect.ts`), cashflow summaries
  (`summary.ts`), shared types (`types.ts`). No I/O whatsoever → unit-testable and reusable
  in a future React Native app. Tests in `packages/core/test/` (vitest).
- `packages/server` (`@upsiedaisy/server`) — Express REST API. The Up API is wrapped behind
  the bank-agnostic `TransactionSource` interface (`source.ts`); `upClient.ts` is the real
  adapter, `mockSource.ts` is a deterministic synthetic source used when `UPSIE_DEMO=1`.
  Token resolution order: `X-Up-Token` header → `UP_API_TOKEN` env → demo mode → 401.
  60s TTL cache on transaction fetches, keyed by SHA-256 of token.
- `packages/web` (`@upsiedaisy/web`) — React + Vite dashboard, dev server proxies `/api` to
  `localhost:3001`. Token entered in the UI lives in browser localStorage only.

Commands: `npm install` · `npm run build` · `npm test` · `npm run dev:server` ·
`npm run dev:web` · `npm run demo` (server with synthetic data). CI (`.github/workflows/ci.yml`)
runs build + tests on push/PR.

Categorisation: buckets defined in `core/src/buckets.ts` (shared with future mobile);
assignments persisted server-side by `server/src/store.ts` (JSON per user under `data/`,
filename = SHA-256 of token, gitignored) via `POST /api/transactions/:id/bucket`.
`/api/transactions` merges the assigned `bucket` field in. Web `Categorize.tsx` does
drag-into-bucket (HTML5 DnD) with click-arm fallback, optimistic updates + revert on error.
Source resolution precedence (app.ts): `X-Up-Token` header → demo mode → env token — demo
deliberately beats env token so `npm run demo` works with a populated `.env`. The server
auto-loads `.env` from cwd or repo root (`loadDotEnv` in config.ts; real env wins).

Bucket breakdown: clicking a bucket with no transaction armed opens a summary panel
(count + total); Groceries additionally breaks down by supermarket chain
(`core/src/supermarkets.ts`: Aldi/Coles/Woolworths/Costco + Other, word-boundary regex on
rawText-else-description — `\baldi\b` correctly excludes "Aldi Mobile" top-ups, verified on
fixture data). Computed client-side from /api/transactions; no dedicated endpoint.

## How detection works (packages/core/src/detect.ts)

1. Settled, non-transfer txns grouped by direction + normalised grouping text — `rawText`
   (bank's immutable statement text) when present, else `description` (user-editable in Up).
   Same-day charges collapse into one occurrence. Series display name = latest description.
2. Median gap between occurrences → cadence (weekly 6–8d, fortnightly 12–16d, monthly
   26–35d, quarterly 80–100d, yearly 340–390d, else irregular). Median gap < 5d is
   everyday spending → discarded.
3. Confidence 0–1 = 0.5·gap-regularity (MAD-based) + 0.2·amount-consistency (deliberately
   gentle — utilities vary) + 0.3·occurrence-count, halved for irregular cadence.
   Defaults: minOccurrences 3, minConfidence 0.4.
4. Next-date prediction is calendar-aware for monthly/quarterly/yearly (a bill on the 31st
   stays on month-end); monthly-equivalent amounts computed for comparability.

## Learnings from live testing (2026-08-28, real Up account)

- **Transaction descriptions are user-editable in Up.** The account owner renamed a deposit
  after the fact ("Up Savings" → "Gerald (Westpac)"). Consequences: (a) descriptions are
  not immutable, so never cache detected series long-term — re-derive from fresh history;
  (b) a mid-series rename would split a series grouped by description. **Fixed 2026-08-28**:
  grouping prefers Up's `rawText` (unedited statement text), falling back to `description`
  when null/blank (internal transfers have null rawText). Verified live: renamed deposits
  show description "Gerald (Westpac)" but stable rawText "GERALD MORNA".
- **Up API surface** (verified against developer.up.com.au): accounts, attachments,
  categories, tags, transactions, ping, webhooks. **No money-movement endpoints** — only
  writes are transaction metadata (categorise/tag) and webhooks. Personal access tokens are
  generated with a **user-chosen lifetime** (e.g. 48h). Invalid token → 401 JSON.
- **Node's built-in fetch ignores `HTTPS_PROXY`** (curl honours it). Behind an egress proxy
  run the server with `NODE_USE_ENV_PROXY=1` and `NODE_EXTRA_CA_CERTS=<proxy CA>`. In this
  dev environment the WebFetch tool has its own domain filter separate from the container's
  egress policy — use `curl` from the shell to read external docs if WebFetch is blocked.
- End-to-end against a fresh real account: pagination, adapter mapping, transfer exclusion
  and cold-start empty states all behave correctly (no false positives from 4 txns).

## Learnings from real statement data (2026-08-28, 6-month Westpac statement, 452 txns)

Owner supplied a real eStatement PDF (uploads dir only — **never commit it or its raw
text**). An anonymised fixture was derived at `data/fixture.json` (gitignored, local only):
names/employer replaced, digit runs ≥6 scrambled, dates uniformly shifted to end "today";
amounts and merchant descriptions kept (owner approved). Served via `UPSIE_FIXTURE=<path>`
(fixtureSource.ts; precedence: header → fixture → demo → env token). Regenerate with the
statement parser approach: parse rows by leading DD/MM/YY, merge continuation lines,
validate every row against the running balance (452/452 clean), sign = balance delta.

Detection results on this data (the engine's first realistic test):
- Correct: monthly salary (conf 0.9) — two description variants unified by normalisation;
  broadband, electricity, health insurance, 3 small subscriptions (conf 0.9–0.95);
  fortnightly childcare; monthly $7.5k offset-account transfer; fortnightly self-deposits.
- Honest low confidence (0.41–0.54): groceries (Aldi/Costco weekly-ish) — the classic
  near-cadence noise; correctly ranked at the bottom rather than suppressed.
- Known limitation observed: the same merchant via different processors splits into two
  series ("Eftpos … Splashs" vs "Payrix*splashs…") — processor-prefix stripping is a
  future normalisation improvement.

## State / roadmap

Branch `claude/up-bank-bill-tracker-8dwxzo`; no PR opened yet (owner hasn't asked to merge).
Done: monorepo scaffold, detection engine + 11 tests, REST API, demo mode, web dashboard,
CI, live verification, rawText-based grouping, drag-into-bucket categorisation with durable
per-user store (UI verified headless via Playwright: drag, click-fallback, persistence
across reload), iOS add-to-home-screen support (manifest + icons in `web/public/`,
safe-area/viewport-fit, phone layout with sticky tap-to-assign bucket bar ≤720px; PNG icons
generated from `favicon.svg` via headless Chromium screenshots; verified with Playwright
iPhone emulation — no horizontal overflow, tap-assign works, bar stays pinned).
Next candidates (README roadmap): Up webhooks for realtime updates, user-adjustable series
(rename/merge/ignore), mobile app reusing core + API, bill calendar/reminders, budget
envelopes, per-bucket spending summaries.
