# upsiedaisy

Recurring-payment discovery for Up Bank accounts. Detects bills, subscriptions
and salary from transaction history; predicts due dates; summarises monthly
cashflow. Not affiliated with Up or Bendigo & Adelaide Bank.

## SYNOPSIS

```
npm install
npm run demo          # server on :3001 with synthetic data, no token needed
npm run dev:server    # server on :3001 against the Up API
npm run dev:web       # dashboard on :5173, proxies /api to :3001
npm test              # core engine test suite
npm run build         # typecheck and build all packages
```

## DESCRIPTION

Banks, Up included, do not reliably identify recurring payments. upsiedaisy
derives them from raw transaction history instead: it groups transactions by
normalised merchant name, classifies the payment interval, scores confidence,
and predicts the next occurrence of each series. Incoming and outgoing series
are detected by the same mechanism; salary is an incoming series.

Requires Node >= 20 and an Up personal access token
(<https://api.up.com.au/getting_started>). Token lifetime is chosen at
creation; short lifetimes are suitable for evaluation.

## CONFIGURATION

Configuration is by environment variable, typically via a `.env` file copied
from `.env.example`. `.env` is gitignored; the repository never contains
credentials.

| Variable       | Default | Meaning                                          |
| -------------- | ------- | ------------------------------------------------ |
| `UP_API_TOKEN` | unset   | Up personal access token used by the server      |
| `PORT`         | `3001`  | API server port                                  |
| `UPSIE_DEMO`   | unset   | `1` serves deterministic synthetic data (no bank access) |

A token may instead be supplied per-request via the `X-Up-Token` header; the
web UI uses this, keeping the token in browser localStorage. Resolution order:
header, then `UP_API_TOKEN`, then demo mode, then 401.

## API

Amounts are integer cents. Dates are ISO 8601. All endpoints are GET.

| Endpoint            | Returns                                                  |
| ------------------- | -------------------------------------------------------- |
| `/api/health`       | Liveness, demo-mode flag, whether a server token is set   |
| `/api/ping`         | Verifies the effective token against the Up API           |
| `/api/accounts`     | Accounts with balances                                    |
| `/api/transactions` | Transaction history (`?days=365`)                         |
| `/api/bills`        | Outgoing recurring series, soonest due first (`?days=365&minConfidence=0.4`) |
| `/api/income`       | Incoming recurring series, largest first                  |
| `/api/summary`      | Monthly totals, surplus, upcoming (30 d) and overdue series |

## DETECTION

Implemented in `packages/core`, which is pure TypeScript with no I/O and no
dependencies.

1. Series group by the bank's unedited statement text (Up: `rawText`) when
   present, falling back to the display description. Descriptions are
   user-editable in Up; grouping by immutable text means renaming a
   transaction does not split its series. The series display name is the most
   recent description.
2. Merchant normalisation strips reference numbers, dates, card masks and
   company suffixes, so `NETFLIX.COM 4059` and `NETFLIX.COM 9911` group
   together.
3. Settled, non-transfer transactions are grouped by direction and normalised
   merchant. Same-day charges collapse into one occurrence.
4. The median gap between occurrences classifies cadence: weekly 6–8 d,
   fortnightly 12–16 d, monthly 26–35 d, quarterly 80–100 d, yearly 340–390 d,
   otherwise irregular. Median gaps under 5 d are treated as everyday spending
   and discarded.
5. Confidence (0–1) combines gap regularity (MAD-based, robust to a single
   outlier), amount consistency (weighted lightly; utility amounts vary), and
   occurrence count. Defaults: 3 occurrences minimum, 0.4 confidence minimum.
6. Next dates are calendar-aware for monthly and longer cadences (a bill on
   the 31st stays on month-end). Each series carries a monthly-equivalent
   amount for comparison across cadences. Series past their predicted date are
   flagged.

## ARCHITECTURE

npm-workspaces monorepo. The backend is client-agnostic so the same API and
core library can serve a future mobile app.

```
packages/core     @upsiedaisy/core     detection engine; platform-independent
packages/server   @upsiedaisy/server   Express REST API; Up adapter behind a
                                       bank-agnostic TransactionSource
                                       interface; mock source for demo mode
packages/web      @upsiedaisy/web      React/Vite dashboard; talks only to the
                                       upsiedaisy API, never to Up directly
```

## SECURITY

- The repository is public and contains no secrets by construction.
- Tokens are held in memory per-request, never logged, never written to disk.
  Cache keys derived from tokens are SHA-256 hashed.
- The browser never contacts the Up API; only the local backend does.
- The Up API has no money-movement endpoints. Its writes are limited to
  transaction metadata (categorise, tag) and webhooks. A leaked token
  therefore exposes read access and metadata writes. Revoke tokens in the Up
  app under Data Sharing.

## PROXY

Node's fetch ignores `HTTPS_PROXY`. Behind an egress proxy:

```
NODE_USE_ENV_PROXY=1 NODE_EXTRA_CA_CERTS=/path/to/proxy-ca.crt npm run dev:server
```

## ROADMAP

- Up webhooks for realtime updates instead of polling
- User adjustments: rename, merge, ignore a detected series
- Mobile app reusing `@upsiedaisy/core` and the existing API
- Bill calendar and pre-due reminders
- Budget envelopes fed by detected surplus

## LICENSE

MIT. See `LICENSE`.
