import { useEffect, useMemo, useState } from 'react';
import { supermarketBreakdown } from '@upsiedaisy/core';
import { api, type Bucket, type TxnWithBucket } from './api';
import { BucketIcon, ChainIcon, PendingIcon } from './icons';

const aud = new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD' });
const fmt = (cents: number) => aud.format(cents / 100);

interface LastAction {
  id: string;
  bucketLabel: string;
  description: string;
}

/**
 * One-motion categorisation: drag a transaction card onto a bucket and it is
 * assigned and persisted immediately. Fallback for keyboard/touch: click a
 * transaction to arm it, then click a bucket.
 */
export default function Categorize() {
  const [txns, setTxns] = useState<TxnWithBucket[] | null>(null);
  const [buckets, setBuckets] = useState<Bucket[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [armedId, setArmedId] = useState<string | null>(null);
  const [hoverBucket, setHoverBucket] = useState<string | null>(null);
  const [lastAction, setLastAction] = useState<LastAction | null>(null);
  const [showDone, setShowDone] = useState(false);
  const [selectedBucket, setSelectedBucket] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([api.buckets(), api.transactions()])
      .then(([b, t]) => {
        setBuckets(b.buckets);
        setTxns(t.transactions);
      })
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));
  }, []);

  const uncategorized = useMemo(
    () => (txns ?? []).filter((t) => t.bucket === null && !t.isTransfer),
    [txns],
  );
  const categorized = useMemo(() => (txns ?? []).filter((t) => t.bucket !== null), [txns]);
  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const t of categorized) c[t.bucket as string] = (c[t.bucket as string] ?? 0) + 1;
    return c;
  }, [categorized]);

  const assign = (id: string, bucketId: string | null) => {
    const txn = txns?.find((t) => t.id === id);
    if (!txn) return;
    const previous = txn.bucket;
    const previousSource = txn.bucketSource;
    setTxns(
      (ts) =>
        ts?.map((t) =>
          t.id === id
            ? { ...t, bucket: bucketId, bucketSource: bucketId ? ('manual' as const) : null }
            : t,
        ) ?? ts,
    );
    setArmedId(null);
    setDragId(null);
    setHoverBucket(null);
    if (bucketId) {
      const label = buckets.find((b) => b.id === bucketId)?.label ?? bucketId;
      setLastAction({ id, bucketLabel: label, description: txn.description });
    } else {
      setLastAction(null);
    }
    api.assignBucket(id, bucketId).catch((e) => {
      // revert the optimistic update if persistence failed
      setTxns(
        (ts) =>
          ts?.map((t) =>
            t.id === id ? { ...t, bucket: previous, bucketSource: previousSource } : t,
          ) ?? ts,
      );
      setError(e instanceof Error ? e.message : String(e));
    });
  };

  if (error) return <div className="error">{error}</div>;
  if (txns === null) return <p className="muted">Loading transactions…</p>;

  const selectedBucketLabel = buckets.find((b) => b.id === selectedBucket)?.label;
  const selectedTxns = selectedBucket ? categorized.filter((t) => t.bucket === selectedBucket) : [];
  const selectedTotalCents = selectedTxns.reduce((sum, t) => sum - t.amountCents, 0);
  const chainRows = selectedBucket === 'groceries' ? supermarketBreakdown(selectedTxns) : null;

  return (
    <div>
      <section className="card">
        <h2>Categorise transactions</h2>
        <p className="muted">
          Drag a transaction onto a bucket — one motion, saved instantly and permanently.
          (Or click a transaction, then a bucket.) Obvious merchants are categorised
          automatically (dashed chips); drag or × to correct them. Internal transfers are
          excluded.
        </p>
        {lastAction && (
          <div className="undo-bar">
            <span>
              Moved <strong>{lastAction.description}</strong> to{' '}
              <strong>{lastAction.bucketLabel}</strong>
            </span>
            <button className="secondary" onClick={() => assign(lastAction.id, null)}>
              Undo
            </button>
          </div>
        )}
      </section>

      {selectedBucket && (
        <section className="card breakdown">
          <div className="breakdown-head">
            <h3 className="breakdown-title">
              <BucketIcon id={selectedBucket} />
              {selectedBucketLabel}{' '}
              <span className="muted">
                — {selectedTxns.length} txn{selectedTxns.length === 1 ? '' : 's'},{' '}
                {fmt(selectedTotalCents)} total
              </span>
            </h3>
            <button className="secondary" onClick={() => setSelectedBucket(null)}>
              Close
            </button>
          </div>
          {chainRows && (
            <ul className="breakdown-rows">
              {chainRows.map((r) => (
                <li key={r.id}>
                  <ChainIcon id={r.id} />
                  <span className="breakdown-label">{r.label}</span>
                  <span className="muted">
                    {r.count} txn{r.count === 1 ? '' : 's'}
                  </span>
                  <span className="upcoming-amount">{fmt(r.totalCents)}</span>
                </li>
              ))}
            </ul>
          )}
          {selectedTxns.length === 0 && (
            <p className="empty">Nothing assigned to this bucket yet.</p>
          )}
        </section>
      )}

      <div className="categorize-grid">
        <section className="card txn-column">
          <h3>
            Uncategorised <span className="muted">({uncategorized.length})</span>
          </h3>
          {uncategorized.length === 0 ? (
            <p className="empty">
              {txns.length === 0
                ? 'No transactions found. Connect an account, or run the server in demo mode (npm run demo) for synthetic data.'
                : 'Everything is categorised.'}
            </p>
          ) : (
            <ul className="txn-list">
              {uncategorized.map((t) => (
                <li
                  key={t.id}
                  className={`txn-card${armedId === t.id ? ' armed' : ''}${dragId === t.id ? ' dragging' : ''}`}
                  draggable
                  onDragStart={(e) => {
                    e.dataTransfer.setData('text/plain', t.id);
                    e.dataTransfer.effectAllowed = 'move';
                    setDragId(t.id);
                  }}
                  onDragEnd={() => {
                    setDragId(null);
                    setHoverBucket(null);
                  }}
                  onClick={() => setArmedId((cur) => (cur === t.id ? null : t.id))}
                >
                  <span className="txn-date">{t.createdAt.slice(0, 10)}</span>
                  <span className="txn-desc">
                    {t.description}
                    {!t.settled && (
                      <span className="pending-mark" title="Pending — not settled yet">
                        <PendingIcon />
                      </span>
                    )}
                  </span>
                  <span className={`txn-amount ${t.amountCents < 0 ? 'out' : 'in'}`}>
                    {fmt(t.amountCents)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="bucket-column">
          {buckets.map((b) => (
            <div
              key={b.id}
              className={`bucket-zone${hoverBucket === b.id ? ' drag-over' : ''}${armedId ? ' armable' : ''}${selectedBucket === b.id ? ' selected' : ''}`}
              onDragOver={(e) => {
                e.preventDefault();
                e.dataTransfer.dropEffect = 'move';
                setHoverBucket(b.id);
              }}
              onDragLeave={() => setHoverBucket((cur) => (cur === b.id ? null : cur))}
              onDrop={(e) => {
                e.preventDefault();
                const id = e.dataTransfer.getData('text/plain') || dragId;
                if (id) assign(id, b.id);
              }}
              onClick={() => {
                // with a transaction armed a tap assigns; otherwise it opens
                // the bucket's breakdown (e.g. Groceries by supermarket)
                if (armedId) assign(armedId, b.id);
                else setSelectedBucket((cur) => (cur === b.id ? null : b.id));
              }}
            >
              <span className="bucket-name">
                <BucketIcon id={b.id} />
                <span className="bucket-label">{b.label}</span>
              </span>
              <span className="bucket-count">{counts[b.id] ?? 0}</span>
            </div>
          ))}
        </section>
      </div>

      {categorized.length > 0 && (
        <section className="card">
          <h3>
            <button className="linklike" onClick={() => setShowDone((s) => !s)}>
              {showDone ? '▾' : '▸'} Categorised ({categorized.length}
              {categorized.some((t) => t.bucketSource === 'auto')
                ? `, ${categorized.filter((t) => t.bucketSource === 'auto').length} auto`
                : ''}
              )
            </button>
          </h3>
          {showDone && (
            <ul className="txn-list">
              {categorized.map((t) => (
                <li key={t.id} className="txn-card done">
                  <span className="txn-date">{t.createdAt.slice(0, 10)}</span>
                  <span className="txn-desc">
                    {t.description}
                    {!t.settled && (
                      <span className="pending-mark" title="Pending — not settled yet">
                        <PendingIcon />
                      </span>
                    )}
                  </span>
                  <span
                    className={t.bucketSource === 'auto' ? 'chip chip-auto' : 'chip'}
                    title={
                      t.bucketSource === 'auto'
                        ? `Categorised automatically (${t.bucketReason ?? 'rule'}) — drag or × to change`
                        : undefined
                    }
                  >
                    <BucketIcon id={t.bucket as string} size={12} />
                    {buckets.find((b) => b.id === t.bucket)?.label ?? t.bucket}
                    {t.bucketSource === 'auto' ? ' · auto' : ''}
                  </span>
                  <span className={`txn-amount ${t.amountCents < 0 ? 'out' : 'in'}`}>
                    {fmt(t.amountCents)}
                  </span>
                  <button
                    className="unassign"
                    title="Remove from bucket"
                    onClick={() => assign(t.id, null)}
                  >
                    ×
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}
