# UpsieDaisy 🌼

Bill, subscription and salary tracking for [Up Bank](https://up.com.au), built around one idea:
**banks are bad at telling you what your recurring payments are, so UpsieDaisy figures it out
from your transaction history instead.**

Point it at your Up account (or run the built-in demo) and it will auto-discover your bills,
subscriptions and salary — no manual setup, no tagging, no "add a bill" forms — then predict
when each one is next due and what your monthly cashflow looks like.

> UpsieDaisy is an independent open-source project and is not affiliated with Up or Bendigo &
> Adelaide Bank.

## Security model — no credentials in this repo, ever

This repository is public and contains **zero** secrets. It is designed so that it never needs
any:

- Your Up personal access token is supplied at runtime, one of two ways:
  1. **Server-side env var** — `UP_API_TOKEN` in a local `.env` file (`.env` is gitignored;
     only the placeholder `.env.example` is committed), or
  2. **Per-request header** — paste the token into the web UI; it is stored only in *your
     browser's* localStorage and sent to *your own* backend as an `X-Up-Token` header.
- The backend holds tokens in memory only for the duration of a request, never logs them, and
  never writes them to disk. Cache keys derived from tokens are SHA-256 hashed.
- The browser never talks to the Up API directly — only to your own UpsieDaisy backend.
- The Up API **cannot move money at all** — its only write operations are metadata
  (categorising/tagging transactions) and webhook management. When generating a token you
  also choose how long it lasts, so a short-lived token is a good fit for trying UpsieDaisy.
  Still treat tokens like a password (they expose your full transaction history); you can
  revoke one at any time from the Up app under Data Sharing.
- Demo mode (`UPSIE_DEMO=1`) runs entirely on synthetic data with no bank access at all.

If you fork this repo: keep `.env` out of git, and never paste a token into an issue or commit.

## Quick start

Requires Node.js ≥ 20.

```bash
npm install

# Option A — try it instantly with synthetic demo data (no bank account needed)
npm run demo          # API on :3001 with fake data
npm run dev:web       # dashboard on http://localhost:5173

# Option B — your real Up account
cp .env.example .env  # then put your token in UP_API_TOKEN (or skip this and
                      # paste the token into the web UI instead)
npm run dev:server
npm run dev:web
```

Get a personal access token at <https://api.up.com.au/getting_started>.

```bash
npm test              # run the detection-engine test suite
npm run build         # typecheck + build all packages
```

### Running behind an egress proxy

Node's built-in `fetch` ignores `HTTPS_PROXY` by default, so if your network forces outbound
traffic through a proxy (corporate networks, sandboxed cloud environments), start the server
with:

```bash
NODE_USE_ENV_PROXY=1 NODE_EXTRA_CA_CERTS=/path/to/proxy-ca.crt npm run dev:server
```

## How bill auto-discovery works

Everything lives in [`packages/core`](packages/core) and is pure, deterministic TypeScript
(no I/O), so it is unit-tested in isolation and reusable on any platform:

1. **Normalise merchants.** Statement descriptions vary between charges of the same biller
   (`NETFLIX.COM 4059`, `NETFLIX.COM 9911`, `AGL RETAIL REF 8842213`). Reference numbers,
   dates, card masks and company suffixes are stripped so charges group by their stable
   merchant identity.
2. **Group and collapse.** Settled, non-transfer transactions are grouped by direction +
   normalised merchant; multiple charges on the same day collapse into one occurrence.
3. **Classify cadence.** The median gap between occurrences maps to weekly / fortnightly /
   monthly / quarterly / yearly (with tolerance bands — a monthly bill is 28–31 days apart
   depending on the month). Gaps under ~5 days are treated as everyday spending, not bills.
4. **Score confidence.** Three signals combine into a 0–1 score: gap regularity (robust MAD,
   so one odd charge doesn't ruin a series), amount consistency (weighted gently — utility
   bills legitimately vary), and the number of occurrences observed.
5. **Predict.** The next date is calendar-aware (a bill charged on the 31st stays on
   month-end) and every series gets a monthly-equivalent amount so weekly, quarterly and
   yearly costs are comparable at a glance. Series whose predicted date has passed are
   flagged as possibly cancelled/missed.

Salary detection is the same machinery pointed at incoming transactions.

## Architecture

Modular by design so the backend can later serve iOS/Android apps unchanged:

```
packages/
├── core/     @upsiedaisy/core    Pure TS domain logic: merchant normalisation,
│                                 recurrence detection, cashflow summaries.
│                                 Zero dependencies, zero I/O → reusable in a
│                                 future React Native app or any other client.
├── server/   @upsiedaisy/server  Express REST API. Adapts the Up API into the
│                                 core's bank-agnostic transaction model behind a
│                                 TransactionSource interface (a mock source
│                                 implements the same interface for demo mode;
│                                 another bank's adapter would slot in the same way).
└── web/      @upsiedaisy/web     React + Vite dashboard. Talks only to the
                                  UpsieDaisy API — one of possibly many clients.
```

### REST API

All endpoints accept an optional `X-Up-Token` header (falling back to the server's
`UP_API_TOKEN`, then demo mode). Amounts are integer cents; dates are ISO 8601.

| Endpoint            | Description                                                        |
| ------------------- | ------------------------------------------------------------------ |
| `GET /api/health`   | Liveness + config status (demo mode? server token configured?)     |
| `GET /api/ping`     | Verifies the effective token against the Up API                    |
| `GET /api/accounts` | Accounts with balances                                             |
| `GET /api/transactions` | Raw transactions (`?days=365`)                                 |
| `GET /api/bills`    | Auto-discovered bills & subscriptions, soonest due first (`?days=365&minConfidence=0.4`) |
| `GET /api/income`   | Auto-discovered salary / recurring income                          |
| `GET /api/summary`  | Monthly totals, surplus, upcoming (30 days) and overdue bills      |

## Roadmap

- [ ] Mobile app (React Native / Expo) reusing `@upsiedaisy/core` and the same REST API
- [ ] Up webhook support for realtime updates instead of polling
- [ ] User-adjustable series (rename, merge, ignore a detected series)
- [ ] Bill calendar view & push reminders before due dates
- [ ] Budget envelopes fed by detected surplus

## License

[MIT](LICENSE)
