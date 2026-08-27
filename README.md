# UpsieDaisy 🌼

**Your bills, found automatically.**

[![CI](https://github.com/atoaster/UpsieDaisy/actions/workflows/ci.yml/badge.svg)](https://github.com/atoaster/UpsieDaisy/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-yellow.svg)](LICENSE)
[![Node >= 20](https://img.shields.io/badge/node-%E2%89%A5%2020-brightgreen.svg)](https://nodejs.org)

Banks — [Up](https://up.com.au) included — are surprisingly bad at telling you what your
recurring payments are. UpsieDaisy fixes that. Point it at your Up account and it reads your
transaction history, works out which payments are *actually* recurring, and shows you:

- 🧾 **Your bills & subscriptions** — discovered automatically, no "add a bill" forms
- 📅 **When each one is next due** — calendar-aware, so a bill on the 31st stays on month-end
- 💰 **Your salary** and other recurring income
- 📊 **Monthly cashflow** — income vs. bills, and what's left over
- ⚠️ **Missed or lapsed bills** — series that skipped their predicted date

No manual setup. No tagging. Just your data, read directly from your own bank via the
official [Up API](https://developer.up.com.au/).

> UpsieDaisy is an independent open-source project, not affiliated with Up or Bendigo &
> Adelaide Bank.

---

## Try it in 60 seconds (no bank account needed)

```bash
git clone https://github.com/atoaster/UpsieDaisy.git
cd UpsieDaisy
npm install
npm run demo        # API server with a year of realistic synthetic data
npm run dev:web     # dashboard → http://localhost:5173
```

You'll see a fully populated dashboard — rent, subscriptions, quarterly electricity, a
fortnightly salary — all auto-discovered from the fake history by the same engine that runs
on real data.

## Connect your real Up account

1. Grab a personal access token from <https://api.up.com.au/getting_started>
   (💡 you choose how long the token lasts when you create it — short is great for a trial).
2. Either put it in a local env file…

   ```bash
   cp .env.example .env    # then set UP_API_TOKEN=up:yeah:...
   npm run dev:server
   npm run dev:web
   ```

   …or just start the servers and paste the token into the web UI, where it's stored only
   in your own browser.

## 🔒 Security model

This repo is public and is designed to **never contain a secret**:

| | |
| --- | --- |
| **Where your token lives** | A gitignored `.env` on your machine, *or* your browser's localStorage (sent per-request as an `X-Up-Token` header). Never in the repo. |
| **What the server does with it** | Holds it in memory per-request only. Never logs it, never writes it to disk. Cache keys derived from it are SHA-256 hashed. |
| **Who talks to your bank** | Only your own backend. The browser never contacts the Up API directly. |
| **What a leaked token could do** | Read data + edit transaction metadata. The Up API has **no money-movement endpoints** — its only writes are categorise/tag and webhooks. Still: treat tokens like passwords, pick short lifetimes, and revoke via the Up app (Data Sharing) when done. |
| **Demo mode** | `UPSIE_DEMO=1` — synthetic data, zero bank access. |

If you fork this repo: keep `.env` out of git and never paste a token into an issue or commit.

## How the auto-discovery works

The engine lives in [`packages/core`](packages/core) — pure, dependency-free, deterministic
TypeScript with a full test suite. In short:

1. **Normalise merchant names.** `NETFLIX.COM 4059` and `NETFLIX.COM 9911` are the same
   biller — reference numbers, dates, card masks and company suffixes get stripped.
2. **Group & collapse.** Settled, non-transfer transactions group by direction + merchant;
   multiple same-day charges count as one occurrence.
3. **Classify the rhythm.** The median gap between occurrences maps to weekly / fortnightly /
   monthly / quarterly / yearly, with tolerance bands. Gaps under ~5 days are everyday
   spending, not bills.
4. **Score confidence (0–100%).** Gap regularity (robust to one odd charge), amount
   consistency (weighted gently — utility bills legitimately vary), and how many occurrences
   we've seen. Every series shows its score honestly in the UI.
5. **Predict.** Calendar-aware next-due dates, monthly-equivalent amounts so weekly and
   yearly costs compare at a glance, and flags for series that missed their predicted date.

Salary detection is the same machinery pointed at incoming transactions.

## Architecture

Three packages, deliberately separated so the backend can later serve iOS/Android apps
unchanged:

```
packages/
├── core/     Pure TS domain logic — normalisation, detection, summaries.
│             Zero deps, zero I/O → drops straight into a future mobile app.
├── server/   Express REST API. Up is wrapped behind a bank-agnostic
│             TransactionSource interface; a mock source implements the same
│             interface for demo mode. Another bank = another adapter.
└── web/      React + Vite dashboard. Just one client of the API —
              a mobile app would be the next.
```

### REST API

All endpoints accept an optional `X-Up-Token` header (falling back to the server's
`UP_API_TOKEN`, then demo mode). Amounts are integer cents; dates ISO 8601.

| Endpoint | What you get |
| --- | --- |
| `GET /api/health` | Liveness + config status |
| `GET /api/ping` | Verifies the token against the Up API |
| `GET /api/accounts` | Accounts with balances |
| `GET /api/transactions?days=365` | Raw transaction history |
| `GET /api/bills?minConfidence=0.4` | Auto-discovered bills, soonest due first |
| `GET /api/income` | Auto-discovered recurring income |
| `GET /api/summary` | Monthly totals, surplus, upcoming & overdue bills |

## Development

```bash
npm test          # detection-engine test suite (vitest)
npm run build     # typecheck + build all packages
```

<details>
<summary>Running behind an egress proxy</summary>

Node's built-in `fetch` ignores `HTTPS_PROXY` by default. If your network forces outbound
traffic through a proxy:

```bash
NODE_USE_ENV_PROXY=1 NODE_EXTRA_CA_CERTS=/path/to/proxy-ca.crt npm run dev:server
```

</details>

## Roadmap

- [ ] Group by Up's `rawText` (unedited statement text) so user-renamed transactions don't split a series
- [ ] 📱 Mobile app (React Native / Expo) reusing `@upsiedaisy/core` and the same REST API
- [ ] 🔔 Up webhook support — realtime updates instead of polling
- [ ] ✏️ User-adjustable series: rename, merge, or ignore a detected bill
- [ ] 🗓️ Bill calendar view & reminders before due dates
- [ ] 💸 Budget envelopes fed by detected surplus

## License

[MIT](LICENSE)
