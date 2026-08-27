import { useCallback, useEffect, useState } from 'react';
import type { RecurringSeries } from '@upsiedaisy/core';
import {
  api,
  getStoredToken,
  setStoredToken,
  type Account,
  type Health,
  type SummaryResponse,
} from './api';

const aud = new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD' });
const fmt = (cents: number) => aud.format(cents / 100);

const CADENCE_LABEL: Record<string, string> = {
  weekly: 'Weekly',
  fortnightly: 'Fortnightly',
  monthly: 'Monthly',
  quarterly: 'Quarterly',
  yearly: 'Yearly',
  irregular: 'Irregular',
};

function dueLabel(days: number): string {
  if (days < -1) return `${-days} days overdue`;
  if (days === -1) return 'due yesterday';
  if (days === 0) return 'due today';
  if (days === 1) return 'due tomorrow';
  return `in ${days} days`;
}

function ConfidenceBadge({ value }: { value: number }) {
  const cls = value >= 0.75 ? 'high' : value >= 0.5 ? 'mid' : 'low';
  return <span className={`badge confidence-${cls}`}>{Math.round(value * 100)}%</span>;
}

function SeriesTable({ series, emptyText }: { series: RecurringSeries[]; emptyText: string }) {
  if (series.length === 0) return <p className="empty">{emptyText}</p>;
  return (
    <div className="table-scroll">
      <table>
        <thead>
          <tr>
            <th>Name</th>
            <th>Cadence</th>
            <th className="num">Typical</th>
            <th className="num">Monthly equiv.</th>
            <th>Last seen</th>
            <th>Next expected</th>
            <th className="num">Confidence</th>
          </tr>
        </thead>
        <tbody>
          {series.map((s) => (
            <tr key={s.key} className={s.daysUntilNext < 0 ? 'overdue' : undefined}>
              <td>
                <strong>{s.name}</strong>
                {s.category ? <span className="category">{s.category}</span> : null}
              </td>
              <td>{CADENCE_LABEL[s.cadence] ?? s.cadence}</td>
              <td className="num">{fmt(s.medianAmountCents)}</td>
              <td className="num">{fmt(s.monthlyAmountCents)}</td>
              <td>{s.lastDate}</td>
              <td>
                {s.nextDate} <span className="muted">({dueLabel(s.daysUntilNext)})</span>
              </td>
              <td className="num">
                <ConfidenceBadge value={s.confidence} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function TokenSettings({ onSaved }: { onSaved: () => void }) {
  const [token, setToken] = useState(getStoredToken());
  return (
    <section className="card token-card">
      <h2>Connect to Up</h2>
      <p>
        Paste a personal access token from{' '}
        <a href="https://api.up.com.au/getting_started" target="_blank" rel="noreferrer">
          api.up.com.au/getting_started
        </a>
        . It is stored only in <em>this browser</em> and sent straight to your own UpsieDaisy
        server — never committed, logged or shared.
      </p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          setStoredToken(token.trim());
          onSaved();
        }}
      >
        <input
          type="password"
          placeholder="up:yeah:…"
          value={token}
          onChange={(e) => setToken(e.target.value)}
          autoComplete="off"
        />
        <button type="submit">Save token</button>
        {getStoredToken() && (
          <button
            type="button"
            className="secondary"
            onClick={() => {
              setStoredToken('');
              setToken('');
              onSaved();
            }}
          >
            Forget token
          </button>
        )}
      </form>
    </section>
  );
}

export default function App() {
  const [health, setHealth] = useState<Health | null>(null);
  const [data, setData] = useState<SummaryResponse | null>(null);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [showSettings, setShowSettings] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const h = await api.health();
      setHealth(h);
      const [summaryRes, accountsRes] = await Promise.all([api.summary(), api.accounts()]);
      setData(summaryRes);
      setAccounts(accountsRes.accounts);
      setShowSettings(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setData(null);
      setAccounts([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const needsToken =
    error !== null && !getStoredToken() && health !== null && !health.serverTokenConfigured && !health.demoMode;

  return (
    <div className="app">
      <header>
        <h1>UpsieDaisy 🌼</h1>
        <div className="header-actions">
          {health?.demoMode && <span className="badge demo">demo data</span>}
          <button onClick={() => setShowSettings((s) => !s)} className="secondary">
            {showSettings ? 'Close settings' : 'Settings'}
          </button>
          <button onClick={() => void refresh()} disabled={loading}>
            {loading ? 'Loading…' : 'Refresh'}
          </button>
        </div>
      </header>

      {(showSettings || needsToken) && <TokenSettings onSaved={() => void refresh()} />}

      {error && !needsToken && <div className="error">{error}</div>}

      {data && (
        <>
          <section className="stats">
            <div className="card stat">
              <span className="stat-label">Recurring income / month</span>
              <span className="stat-value income">{fmt(data.summary.monthlyIncomeCents)}</span>
            </div>
            <div className="card stat">
              <span className="stat-label">Bills &amp; subscriptions / month</span>
              <span className="stat-value bills">{fmt(data.summary.monthlyBillsCents)}</span>
            </div>
            <div className="card stat">
              <span className="stat-label">Left over each month</span>
              <span
                className={`stat-value ${data.summary.monthlySurplusCents >= 0 ? 'income' : 'bills'}`}
              >
                {fmt(data.summary.monthlySurplusCents)}
              </span>
            </div>
          </section>

          {data.summary.upcoming.length > 0 && (
            <section className="card">
              <h2>Due in the next 30 days</h2>
              <ul className="upcoming">
                {data.summary.upcoming.map((b) => (
                  <li key={b.key}>
                    <span className="upcoming-name">{b.name}</span>
                    <span className="upcoming-due">{dueLabel(b.daysUntilNext)}</span>
                    <span className="upcoming-amount">{fmt(b.medianAmountCents)}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section className="card">
            <h2>Bills &amp; subscriptions</h2>
            <p className="muted">
              Auto-discovered from your transaction history — no manual setup. Rows in red have
              missed their predicted date (cancelled, or paid from another account?).
            </p>
            <SeriesTable series={data.bills} emptyText="No recurring bills detected yet." />
          </section>

          <section className="card">
            <h2>Salary &amp; recurring income</h2>
            <SeriesTable series={data.income} emptyText="No recurring income detected yet." />
          </section>

          {accounts.length > 0 && (
            <section className="card">
              <h2>Accounts</h2>
              <ul className="accounts">
                {accounts.map((a) => (
                  <li key={a.id}>
                    <span>{a.displayName}</span>
                    <span className="muted">{a.accountType.toLowerCase()}</span>
                    <span className="upcoming-amount">{fmt(a.balanceCents)}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}

      <footer>
        <p className="muted">
          UpsieDaisy is not affiliated with Up. Your token stays on your machine; see the README
          for the security model.
        </p>
      </footer>
    </div>
  );
}
