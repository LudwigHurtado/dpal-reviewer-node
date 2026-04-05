import { useEffect, useState } from 'react';
import type { QueueRow, ReviewEffect } from '../types/reviewer';
import { postReportReview } from '../api/client';
import { resolvePublicReportUrl } from '../utils/reportLinks';

const EFFECT_OPTIONS: { value: ReviewEffect; label: string }[] = [
  { value: 'none', label: 'No recommendation yet' },
  { value: 'proceed_validation', label: 'Recommend proceed to validation' },
  { value: 'request_evidence', label: 'Request more evidence' },
  { value: 'escalate', label: 'Escalate' },
  { value: 'hold', label: 'Hold / pending' },
];

function effectLabel(v: string): string {
  return EFFECT_OPTIONS.find((o) => o.value === v)?.label ?? v;
}

export function QueueReportReviewPanel(props: {
  rows: QueueRow[];
  readOnly?: boolean;
  onSaved: () => void;
}) {
  const { rows, readOnly, onSaved } = props;
  const [savingId, setSavingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [local, setLocal] = useState<Record<string, { opinion: string; effect: ReviewEffect }>>(() => {
    const init: Record<string, { opinion: string; effect: ReviewEffect }> = {};
    for (const r of rows) {
      init[r.id] = {
        opinion: r.review?.opinion ?? '',
        effect: (r.review?.effect as ReviewEffect) ?? 'none',
      };
    }
    return init;
  });

  const syncKey = rows.map((r) => `${r.id}:${r.review?.updatedAt ?? ''}`).join('|');
  useEffect(() => {
    setLocal((prev) => {
      const next: Record<string, { opinion: string; effect: ReviewEffect }> = {};
      for (const r of rows) {
        next[r.id] = {
          opinion: r.review?.opinion ?? prev[r.id]?.opinion ?? '',
          effect: (r.review?.effect as ReviewEffect) ?? prev[r.id]?.effect ?? 'none',
        };
      }
      return next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- syncKey encodes row ids + server review timestamps
  }, [syncKey]);

  const updateField = (id: string, patch: Partial<{ opinion: string; effect: ReviewEffect }>) => {
    setLocal((prev) => ({
      ...prev,
      [id]: { ...prev[id], opinion: prev[id]?.opinion ?? '', effect: prev[id]?.effect ?? 'none', ...patch },
    }));
  };

  const save = async (row: QueueRow) => {
    if (readOnly) return;
    setError(null);
    setSavingId(row.id);
    try {
      const state = local[row.id] ?? { opinion: '', effect: 'none' as ReviewEffect };
      await postReportReview(row.id, { opinion: state.opinion, effect: state.effect });
      onSaved();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSavingId(null);
    }
  };

  return (
    <div>
      {error && (
        <div
          role="alert"
          style={{
            marginBottom: '1rem',
            padding: '0.75rem 1rem',
            borderRadius: 'var(--radius)',
            background: 'rgba(127, 29, 29, 0.35)',
            border: '1px solid rgba(248, 113, 113, 0.45)',
            color: '#fecaca',
            fontSize: '0.8rem',
          }}
        >
          {error}
        </div>
      )}
      {readOnly && (
        <p className="text-muted" style={{ marginBottom: '1rem', fontSize: '0.8rem' }}>
          Mock data mode — connect the reviewer API to save opinions.
        </p>
      )}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 340px), 1fr))',
          gap: '1rem',
        }}
      >
        {rows.map((row) => {
          const url = resolvePublicReportUrl(row);
          const st = local[row.id] ?? { opinion: '', effect: 'none' as ReviewEffect };
          const saved = row.review;
          return (
            <article
              key={row.id}
              style={{
                padding: '1rem',
                background: 'var(--bg-elevated)',
                borderRadius: 'var(--radius)',
                border: '1px solid var(--graphite-border)',
                display: 'flex',
                flexDirection: 'column',
                gap: '0.65rem',
              }}
            >
              <div className="flex-between" style={{ alignItems: 'flex-start', gap: '0.5rem' }}>
                <div style={{ minWidth: 0 }}>
                  <div className="mono" style={{ fontSize: '0.7rem', color: 'var(--silver-dim)' }}>
                    {row.id}
                  </div>
                  <div style={{ fontWeight: 600, color: 'var(--white)', fontSize: '0.85rem', marginTop: '0.2rem' }}>
                    {row.title ?? '—'}
                  </div>
                  {row.location && (
                    <div className="text-muted" style={{ fontSize: '0.72rem', marginTop: '0.25rem' }}>
                      {row.location}
                    </div>
                  )}
                </div>
                {saved && (
                  <span className="tag tag-sector" style={{ flexShrink: 0 }}>
                    Saved {new Date(saved.updatedAt).toLocaleString()}
                  </span>
                )}
              </div>
              {row.summary && (
                <p className="text-muted" style={{ margin: 0, fontSize: '0.75rem', lineHeight: 1.5 }}>
                  {row.summary.length > 220 ? `${row.summary.slice(0, 220)}…` : row.summary}
                </p>
              )}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', alignItems: 'center' }}>
                {url ? (
                  <a
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn btn-primary"
                    style={{ fontSize: '0.72rem', padding: '0.4rem 0.75rem' }}
                  >
                    Open report in DPAL ↗
                  </a>
                ) : (
                  <span className="text-muted" style={{ fontSize: '0.7rem' }}>
                    Set <span className="mono">VITE_DPAL_PUBLIC_WEB_URL</span> or API{' '}
                    <span className="mono">DPAL_PUBLIC_REPORT_BASE</span> for links.
                  </span>
                )}
                {saved && (
                  <span className="text-muted" style={{ fontSize: '0.68rem' }}>
                    Effect: {effectLabel(saved.effect)}
                  </span>
                )}
              </div>
              <label style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                <span className="section-title" style={{ margin: 0 }}>
                  Your opinion
                </span>
                <textarea
                  value={st.opinion}
                  onChange={(e) => updateField(row.id, { opinion: e.target.value })}
                  disabled={readOnly || savingId === row.id}
                  rows={3}
                  placeholder="Structured notes for the record (who/when attribution comes later)."
                  style={{
                    width: '100%',
                    resize: 'vertical',
                    minHeight: '72px',
                    padding: '0.5rem 0.65rem',
                    fontSize: '0.8rem',
                    background: 'var(--bg-deep)',
                    border: '1px solid var(--graphite-border)',
                    borderRadius: '6px',
                    color: 'var(--silver)',
                    fontFamily: 'inherit',
                  }}
                />
              </label>
              <label style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                <span className="section-title" style={{ margin: 0 }}>
                  Recommended effect
                </span>
                <select
                  value={st.effect}
                  onChange={(e) => updateField(row.id, { effect: e.target.value as ReviewEffect })}
                  disabled={readOnly || savingId === row.id}
                  style={{
                    padding: '0.45rem 0.5rem',
                    fontSize: '0.78rem',
                    background: 'var(--bg-deep)',
                    border: '1px solid var(--graphite-border)',
                    borderRadius: '6px',
                    color: 'var(--white)',
                  }}
                >
                  {EFFECT_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </label>
              <button
                type="button"
                className="btn btn-primary"
                disabled={readOnly || savingId === row.id}
                onClick={() => void save(row)}
                style={{ alignSelf: 'flex-start', marginTop: '0.25rem' }}
              >
                {savingId === row.id ? 'Saving…' : 'Save opinion & effect'}
              </button>
            </article>
          );
        })}
      </div>
    </div>
  );
}
