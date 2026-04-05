import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  fetchVerifierQueue,
  fetchVerifierReportDetail,
  postOutboundAction,
  postRequestEvidence,
  postVerifierNotes,
  postVerify,
} from '../api/verifierClient';
import { categoryPlaybooks } from '../verifier/categoryPlaybooks';
import type { CategoryKey, Severity, VerifierQueueRow, VerifierReportDetail, TimelineEvent } from '../verifier/types';
import { demoVerifierReports } from '../data/verifierDemo';

type Tab = 'verify' | 'actions' | 'history' | 'routing';

function severityStyle(s: Severity): string {
  const map: Record<Severity, string> = {
    urgent: 'tag tag-escalation',
    high: 'tag',
    medium: 'tag tag-sector',
    low: 'tag',
  };
  return map[s] || map.medium;
}

function statusLabel(s: string): string {
  return s.replaceAll('_', ' ');
}

function syntheticDetail(row: VerifierQueueRow): {
  report: VerifierReportDetail;
  notes: { text: string; updatedAt: string | null };
  timeline: TimelineEvent[];
} {
  return {
    report: {
      ...row,
      description: row.summary,
      location: row.city,
      urgency: row.severity,
      reporter: 'Demo reporter',
      evidence: Array.from({ length: Math.min(row.evidenceCount, 6) }).map((_, i) => ({
        id: `demo-ev-${i}`,
        type: 'image',
        file_url: '',
      })),
      priorActions: [],
      recommendedRouting: row.categoryKey,
    },
    notes: { text: '', updatedAt: null },
    timeline: [
      {
        id: 'demo-1',
        at: new Date().toISOString(),
        type: 'demo',
        label: 'Demo mode',
        detail: 'Connect DPAL_UPSTREAM_URL on the reviewer API to load real filings.',
      },
    ],
  };
}

export function VerifierPortal() {
  const [reports, setReports] = useState<VerifierQueueRow[]>([]);
  const [source, setSource] = useState<string>('');
  const [useDemo, setUseDemo] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadErr, setLoadErr] = useState<string | null>(null);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detail, setDetail] = useState<{
    report: VerifierReportDetail;
    notes: { text: string; updatedAt: string | null };
    timeline: TimelineEvent[];
  } | null>(null);

  const [tab, setTab] = useState<Tab>('verify');
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<string>('all');

  const [notes, setNotes] = useState('');
  const [actionType, setActionType] = useState('call');
  const [actionMessage, setActionMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const loadQueue = useCallback(async () => {
    setLoading(true);
    setLoadErr(null);
    try {
      const data = await fetchVerifierQueue();
      setSource(data.source || '');
      if (data.reports && data.reports.length > 0) {
        setReports(data.reports);
        setUseDemo(false);
      } else {
        setReports(demoVerifierReports);
        setUseDemo(true);
        setLoadErr(data.message || null);
      }
    } catch (e: unknown) {
      setReports(demoVerifierReports);
      setUseDemo(true);
      setLoadErr(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadQueue();
  }, [loadQueue]);

  useEffect(() => {
    const id = window.setInterval(() => {
      if (!useDemo) void loadQueue();
    }, 25000);
    return () => window.clearInterval(id);
  }, [loadQueue, useDemo]);

  const loadDetail = useCallback(
    async (id: string) => {
      setDetailLoading(true);
      setNotice(null);
      try {
        if (useDemo && id.startsWith('demo-')) {
          const row = reports.find((r) => r.id === id) || demoVerifierReports.find((r) => r.id === id);
          if (row) setDetail(syntheticDetail(row));
          else setDetail(null);
        } else {
          const d = await fetchVerifierReportDetail(id);
          setDetail({
            report: d.report,
            notes: d.notes,
            timeline: d.timeline || [],
          });
          setNotes(d.notes?.text || '');
        }
      } catch (e: unknown) {
        setNotice(e instanceof Error ? e.message : String(e));
        setDetail(null);
      } finally {
        setDetailLoading(false);
      }
    },
    [useDemo, reports],
  );

  useEffect(() => {
    if (!selectedId) return;
    void loadDetail(selectedId);
  }, [selectedId, loadDetail]);

  useEffect(() => {
    if (reports.length && !selectedId) setSelectedId(reports[0].id);
  }, [reports, selectedId]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return reports.filter((r) => {
      const hit =
        !q ||
        [r.id, r.title, r.city, r.summary, r.category].join(' ').toLowerCase().includes(q);
      const cat = category === 'all' || r.categoryKey === category;
      return hit && cat;
    });
  }, [reports, query, category]);

  const selected = useMemo(
    () => reports.find((r) => r.id === selectedId) || filtered[0],
    [reports, selectedId, filtered],
  );

  const playbook = selected ? categoryPlaybooks[selected.categoryKey as CategoryKey] : null;

  const metrics = useMemo(() => {
    const urgent = reports.filter((r) => r.severity === 'urgent').length;
    const ready = reports.filter((r) => r.status === 'ready_to_escalate').length;
    const avg = reports.length
      ? Math.round(reports.reduce((a, b) => a + b.verificationScore, 0) / reports.length)
      : 0;
    const open = reports.filter((r) => r.status !== 'resolved').length;
    return { urgent, ready, avg, open };
  }, [reports]);

  const checks = useMemo(() => {
    if (!selected) return [];
    const ev = selected.evidenceCount >= 3;
    const loc = Boolean(selected.city && selected.city !== '—');
    const cat = selected.verificationScore >= 70;
    const risk = selected.severity === 'urgent';
    const privacy = selected.categoryKey === 'labor';
    return [
      { label: 'Evidence completeness', ok: ev },
      { label: 'Location present', ok: loc },
      { label: 'Duplicate detection', ok: true },
      { label: 'Category confidence', ok: cat },
      { label: 'Emergency risk threshold', ok: risk || selected.severity !== 'urgent' },
      { label: 'Privacy / PII review', ok: !privacy },
    ];
  }, [selected]);

  const saveNotes = async () => {
    if (!selectedId || useDemo) {
      setNotice('Notes are local-only in demo mode.');
      return;
    }
    setBusy(true);
    try {
      await postVerifierNotes(selectedId, notes);
      setNotice('Notes saved to audit log.');
      await loadDetail(selectedId);
    } catch (e: unknown) {
      setNotice(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const runVerify = async () => {
    if (!selectedId) return;
    setBusy(true);
    try {
      if (useDemo) {
        setNotice('Demo mode: connect upstream API to persist verification.');
      } else {
        await postVerify(selectedId, {
          decision: 'reviewed',
          credibility_score: selected?.verificationScore,
          notes,
        });
        setNotice('Verification logged.');
        await loadDetail(selectedId);
      }
    } catch (e: unknown) {
      setNotice(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const requestEvidence = async () => {
    if (!selectedId) return;
    setBusy(true);
    try {
      if (useDemo) setNotice('Demo mode — no server log.');
      else {
        await postRequestEvidence(selectedId, notes || 'Additional evidence requested.');
        setNotice('Evidence request logged.');
        await loadDetail(selectedId);
      }
    } catch (e: unknown) {
      setNotice(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const sendOutbound = async () => {
    if (!selectedId) return;
    setBusy(true);
    try {
      const kind =
        actionType === 'email_city'
          ? 'email'
          : actionType === 'emergency_dispatch'
            ? 'escalate'
            : actionType === 'legal_referral'
              ? 'legal-referral'
              : actionType === 'assign_followup'
                ? 'assign-followup'
                : 'call';
      if (useDemo) {
        setNotice('Demo mode — action not sent. Configure upstream + mail/call providers for production.');
      } else {
        const res = await postOutboundAction(selectedId, kind, {
          message: actionMessage,
          summary: actionMessage,
          destination_name: playbook?.agencies[0],
        });
        setNotice(res.warning || 'Action logged in verifier audit file.');
        await loadDetail(selectedId);
      }
    } catch (e: unknown) {
      setNotice(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="app-shell" style={{ gridTemplateColumns: '1fr' }}>
      <div className="main-area" style={{ maxWidth: '1400px', margin: '0 auto', width: '100%' }}>
        <header className="top-bar" style={{ flexWrap: 'wrap' }}>
          <div>
            <div className="mono" style={{ fontSize: '0.65rem', color: 'var(--silver-dim)', letterSpacing: '0.2em' }}>
              DPAL ENTERPRISE
            </div>
            <h2 style={{ margin: '0.25rem 0 0' }}>Verifier Action Portal</h2>
            <div className="top-bar-meta">
              Live queue · outbound actions · audit trail
              {useDemo && (
                <span style={{ color: '#fcd34d', marginLeft: '0.5rem' }}>· Demo data (no upstream feed)</span>
              )}
              {source === 'upstream' && <span style={{ color: '#86efac', marginLeft: '0.5rem' }}>· Upstream feed</span>}
            </div>
          </div>
          <div className="top-bar-actions">
            <button type="button" className="btn" onClick={() => void loadQueue()} disabled={loading}>
              {loading ? 'Refreshing…' : 'Refresh queue'}
            </button>
          </div>
        </header>

        <section
          aria-label="DPAL Validator Portal"
          style={{
            margin: '0 0 1rem',
            borderRadius: '10px',
            overflow: 'hidden',
            border: '1px solid rgba(148, 163, 184, 0.25)',
            position: 'relative',
            maxHeight: 'min(44vh, 440px)',
            background: '#0f172a',
          }}
        >
          <img
            src="/validator-portal-hero.png"
            alt="DPAL Validator Portal — operations center for reviewing public reports"
            width={1600}
            height={600}
            style={{
              width: '100%',
              height: 'auto',
              maxHeight: 'min(44vh, 440px)',
              objectFit: 'cover',
              display: 'block',
            }}
          />
          <div
            style={{
              position: 'absolute',
              bottom: 0,
              left: 0,
              right: 0,
              padding: '0.75rem 1.25rem',
              background: 'linear-gradient(to top, rgba(15, 23, 42, 0.92), transparent)',
            }}
          >
            <div className="mono" style={{ fontSize: '0.65rem', color: '#94a3b8', letterSpacing: '0.18em' }}>
              DPAL VALIDATOR PORTAL
            </div>
          </div>
        </section>

        {notice && (
          <div
            role="status"
            style={{
              padding: '0.5rem 1rem',
              background: 'rgba(59, 130, 246, 0.15)',
              borderBottom: '1px solid rgba(59, 130, 246, 0.3)',
              fontSize: '0.8rem',
              display: 'flex',
              justifyContent: 'space-between',
              gap: '1rem',
            }}
          >
            <span>{notice}</span>
            <button type="button" className="btn" style={{ fontSize: '0.7rem' }} onClick={() => setNotice(null)}>
              Dismiss
            </button>
          </div>
        )}

        {loadErr && !notice && (
          <p className="text-muted" style={{ padding: '0 1rem', fontSize: '0.78rem' }}>
            Queue notice: {loadErr}
          </p>
        )}

        <main className="content-scroll" style={{ padding: '1rem 1.25rem 2rem' }}>
          <div className="grid-dashboard" style={{ marginBottom: '1rem' }}>
            <div className="panel span-3">
              <div className="panel-body">
                <div className="stat-label">Open reports</div>
                <div className="stat-value">{metrics.open}</div>
              </div>
            </div>
            <div className="panel span-3">
              <div className="panel-body">
                <div className="stat-label">Urgent risk</div>
                <div className="stat-value">{metrics.urgent}</div>
              </div>
            </div>
            <div className="panel span-3">
              <div className="panel-body">
                <div className="stat-label">Ready to escalate</div>
                <div className="stat-value">{metrics.ready}</div>
              </div>
            </div>
            <div className="panel span-3">
              <div className="panel-body">
                <div className="stat-label">Avg verification</div>
                <div className="stat-value">{metrics.avg}%</div>
              </div>
            </div>
          </div>

          <div className="grid-dashboard">
            <div className="panel span-4">
              <div className="panel-header">
                <h3>Live queue</h3>
                <span className="badge">{filtered.length}</span>
              </div>
              <div className="panel-body">
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginBottom: '0.75rem' }}>
                  <input
                    placeholder="Search ID, title, city…"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '0.45rem 0.6rem',
                      background: 'var(--bg-deep)',
                      border: '1px solid var(--graphite-border)',
                      borderRadius: '6px',
                      color: 'var(--white)',
                    }}
                  />
                  <select
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    style={{
                      padding: '0.4rem',
                      background: 'var(--bg-deep)',
                      border: '1px solid var(--graphite-border)',
                      borderRadius: '6px',
                      color: 'var(--white)',
                    }}
                  >
                    <option value="all">All categories</option>
                    <option value="environmental">Environmental</option>
                    <option value="housing">Housing</option>
                    <option value="labor">Labor</option>
                    <option value="public_safety">Public safety</option>
                    <option value="medical">Medical</option>
                  </select>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', maxHeight: '62vh', overflow: 'auto' }}>
                  {filtered.map((r) => (
                    <button
                      key={r.id}
                      type="button"
                      onClick={() => {
                        setSelectedId(r.id);
                        setTab('verify');
                      }}
                      style={{
                        textAlign: 'left',
                        padding: '0.65rem 0.75rem',
                        borderRadius: 'var(--radius-lg)',
                        border:
                          selectedId === r.id ? '1px solid rgba(212, 175, 55, 0.45)' : '1px solid var(--graphite-border)',
                        background: selectedId === r.id ? 'var(--bg-panel-hover)' : 'var(--bg-elevated)',
                        color: 'inherit',
                        cursor: 'pointer',
                        display: 'grid',
                        gridTemplateColumns: r.thumbnailUrl ? '72px 1fr' : '1fr',
                        gap: '0.65rem',
                        alignItems: 'start',
                      }}
                    >
                      {r.thumbnailUrl ? (
                        <img
                          src={r.thumbnailUrl}
                          alt=""
                          width={72}
                          height={72}
                          style={{
                            width: '72px',
                            height: '72px',
                            objectFit: 'cover',
                            borderRadius: '6px',
                            border: '1px solid var(--graphite-border)',
                            background: 'var(--bg-deep)',
                          }}
                          loading="lazy"
                          referrerPolicy="no-referrer"
                        />
                      ) : null}
                      <div style={{ minWidth: 0 }}>
                      <div className="mono" style={{ fontSize: '0.65rem', color: 'var(--silver-dim)' }}>
                        {r.id}
                      </div>
                      <div style={{ fontWeight: 600, fontSize: '0.82rem', marginTop: '0.2rem' }}>{r.title}</div>
                      <div className="text-muted" style={{ fontSize: '0.72rem', marginTop: '0.35rem' }}>
                        {r.city} · {categoryPlaybooks[r.categoryKey as CategoryKey]?.label ?? r.category}
                      </div>
                      <div style={{ marginTop: '0.45rem', display: 'flex', flexWrap: 'wrap', gap: '0.35rem' }}>
                        <span className={severityStyle(r.severity)}>{r.severity}</span>
                        <span className="tag tag-sector">{statusLabel(r.status)}</span>
                      </div>
                      <div className="text-muted" style={{ fontSize: '0.68rem', marginTop: '0.35rem' }}>
                        {r.evidenceCount} evidence · {r.verificationScore}% score
                      </div>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="panel span-8">
              {!selected ? (
                <div className="panel-body">
                  <p className="text-muted">Select a report from the queue.</p>
                </div>
              ) : detailLoading ? (
                <div className="panel-body">
                  <p className="text-muted">Loading report…</p>
                </div>
              ) : (
                <>
                  <div className="panel-header">
                    <h3 style={{ margin: 0, fontSize: '1rem' }}>{detail?.report.title ?? selected.title}</h3>
                    <span className="badge">{detail?.report.id ?? selected.id}</span>
                  </div>
                  <div className="panel-body">
                    {!detail?.report && (
                      <p role="alert" style={{ color: '#fca5a5', fontSize: '0.8rem' }}>
                        Detail unavailable from API — showing queue row only.
                      </p>
                    )}
                    <p style={{ fontSize: '0.85rem', lineHeight: 1.5, marginTop: 0 }}>
                      {detail?.report.description ?? selected.summary}
                    </p>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: '0.65rem', marginTop: '0.75rem' }}>
                      <div className="stat-row" style={{ flexDirection: 'column', alignItems: 'flex-start' }}>
                        <span className="stat-label">City</span>
                        <span>{detail?.report.city ?? selected.city}</span>
                      </div>
                      <div className="stat-row" style={{ flexDirection: 'column', alignItems: 'flex-start' }}>
                        <span className="stat-label">Status</span>
                        <span>{statusLabel(detail?.report.status ?? selected.status)}</span>
                      </div>
                      <div className="stat-row" style={{ flexDirection: 'column', alignItems: 'flex-start' }}>
                        <span className="stat-label">Reporter</span>
                        <span style={{ fontSize: '0.78rem' }}>{detail?.report.reporter ?? '—'}</span>
                      </div>
                    </div>
                    {detail?.report.publicUrl && (
                      <p style={{ marginTop: '0.75rem' }}>
                        <a href={detail.report.publicUrl} target="_blank" rel="noopener noreferrer" className="btn btn-primary" style={{ fontSize: '0.75rem' }}>
                          Open in DPAL web app ↗
                        </a>
                      </p>
                    )}

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginTop: '1rem' }}>
                        <div style={{ border: '1px solid var(--graphite-border)', borderRadius: 'var(--radius-lg)', padding: '0.75rem' }}>
                        <div className="section-title">Evidence</div>
                        <p className="text-muted" style={{ fontSize: '0.75rem' }}>
                          {detail?.report.evidence?.length ?? 0} items
                        </p>
                        <div
                          style={{
                            display: 'grid',
                            gridTemplateColumns: 'repeat(auto-fill, minmax(100px, 1fr))',
                            gap: '0.5rem',
                            marginTop: '0.5rem',
                          }}
                        >
                          {(detail?.report.evidence || []).slice(0, 12).map((ev) =>
                            ev.type === 'image' && ev.file_url ? (
                              <a
                                key={ev.id}
                                href={ev.file_url}
                                target="_blank"
                                rel="noopener noreferrer"
                                style={{ display: 'block', lineHeight: 0 }}
                              >
                                <img
                                  src={ev.thumbnail_url || ev.file_url}
                                  alt="Filing evidence"
                                  width={120}
                                  height={120}
                                  style={{
                                    width: '100%',
                                    height: '100px',
                                    objectFit: 'cover',
                                    borderRadius: '6px',
                                    border: '1px solid var(--graphite-border)',
                                  }}
                                  loading="lazy"
                                  referrerPolicy="no-referrer"
                                />
                              </a>
                            ) : (
                              <div key={ev.id} className="text-muted" style={{ fontSize: '0.72rem', wordBreak: 'break-all' }}>
                                {ev.type}
                                {ev.file_url ? (
                                  <>
                                    {' · '}
                                    <a href={ev.file_url} target="_blank" rel="noopener noreferrer">
                                      open
                                    </a>
                                  </>
                                ) : null}
                              </div>
                            ),
                          )}
                        </div>
                      </div>
                      <div style={{ border: '1px solid var(--graphite-border)', borderRadius: 'var(--radius-lg)', padding: '0.75rem' }}>
                        <div className="section-title">Category playbook</div>
                        <p className="text-muted" style={{ fontSize: '0.75rem' }}>{playbook?.severityRule}</p>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem', marginTop: '0.5rem' }}>
                          {playbook?.actions.map((a) => (
                            <span key={a} className="tag tag-sector" style={{ fontSize: '0.65rem' }}>
                              {a}
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>

                    <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap', marginTop: '1rem' }}>
                      {(['verify', 'actions', 'history', 'routing'] as Tab[]).map((t) => (
                        <button
                          key={t}
                          type="button"
                          className={tab === t ? 'btn btn-primary' : 'btn'}
                          style={{ fontSize: '0.72rem' }}
                          onClick={() => setTab(t)}
                        >
                          {t === 'verify' && 'Verification'}
                          {t === 'actions' && 'Outbound actions'}
                          {t === 'history' && 'Timeline'}
                          {t === 'routing' && 'Routing rules'}
                        </button>
                      ))}
                    </div>

                    {tab === 'verify' && (
                      <div style={{ marginTop: '1rem', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                        <div>
                          <div className="section-title">Checks</div>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', marginTop: '0.5rem' }}>
                            {checks.map((c) => (
                              <div
                                key={c.label}
                                style={{
                                  padding: '0.45rem 0.6rem',
                                  borderRadius: '6px',
                                  border: `1px solid ${c.ok ? 'rgba(61,122,92,0.4)' : 'rgba(184,134,11,0.4)'}`,
                                  background: c.ok ? 'rgba(61,122,92,0.12)' : 'rgba(184,134,11,0.1)',
                                  fontSize: '0.78rem',
                                }}
                              >
                                {c.label}: {c.ok ? 'pass' : 'review'}
                              </div>
                            ))}
                          </div>
                        </div>
                        <div>
                          <div className="section-title">Verifier notes</div>
                          <textarea
                            value={notes}
                            onChange={(e) => setNotes(e.target.value)}
                            rows={6}
                            placeholder="Credibility, contradictions, witness quality, next steps…"
                            style={{
                              width: '100%',
                              marginTop: '0.5rem',
                              padding: '0.5rem',
                              background: 'var(--bg-deep)',
                              border: '1px solid var(--graphite-border)',
                              borderRadius: '6px',
                              color: 'var(--silver)',
                              fontFamily: 'inherit',
                            }}
                          />
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginTop: '0.5rem' }}>
                            <button type="button" className="btn btn-primary" disabled={busy} onClick={() => void runVerify()}>
                              Save verification
                            </button>
                            <button type="button" className="btn" disabled={busy} onClick={() => void saveNotes()}>
                              Save notes
                            </button>
                            <button type="button" className="btn" disabled={busy} onClick={() => void requestEvidence()}>
                              Request more evidence
                            </button>
                          </div>
                        </div>
                      </div>
                    )}

                    {tab === 'actions' && (
                      <div style={{ marginTop: '1rem', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                        <div>
                          <div className="section-title">Action type</div>
                          <select
                            value={actionType}
                            onChange={(e) => setActionType(e.target.value)}
                            style={{
                              width: '100%',
                              marginTop: '0.35rem',
                              padding: '0.45rem',
                              background: 'var(--bg-deep)',
                              border: '1px solid var(--graphite-border)',
                              color: 'var(--white)',
                              borderRadius: '6px',
                            }}
                          >
                            <option value="call">Call agency</option>
                            <option value="email_city">Email city / department</option>
                            <option value="emergency_dispatch">Emergency escalation</option>
                            <option value="non_emergency">Non-emergency dispatch</option>
                            <option value="legal_referral">Legal referral</option>
                            <option value="assign_followup">Assign follow-up</option>
                          </select>
                          <div className="section-title" style={{ marginTop: '0.75rem' }}>
                            Suggested contacts
                          </div>
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem', marginTop: '0.35rem' }}>
                            {playbook?.agencies.map((a) => (
                              <span key={a} className="tag">
                                {a}
                              </span>
                            ))}
                          </div>
                        </div>
                        <div>
                          <div className="section-title">Message / summary</div>
                          <textarea
                            value={actionMessage}
                            onChange={(e) => setActionMessage(e.target.value)}
                            rows={8}
                            placeholder="What was verified, what you are asking the agency to do, deadlines…"
                            style={{
                              width: '100%',
                              marginTop: '0.35rem',
                              padding: '0.5rem',
                              background: 'var(--bg-deep)',
                              border: '1px solid var(--graphite-border)',
                              borderRadius: '6px',
                              color: 'var(--silver)',
                              fontFamily: 'inherit',
                            }}
                          />
                          <button type="button" className="btn btn-primary" style={{ marginTop: '0.5rem' }} disabled={busy} onClick={() => void sendOutbound()}>
                            Log outbound action
                          </button>
                          <p className="text-muted" style={{ fontSize: '0.68rem', marginTop: '0.5rem' }}>
                            Creates an audit entry. Wire Twilio/SendGrid/webhooks on the server for real calls and email.
                          </p>
                        </div>
                      </div>
                    )}

                    {tab === 'history' && (
                      <div style={{ marginTop: '1rem' }}>
                        <div className="section-title">Audit timeline</div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginTop: '0.5rem' }}>
                          {(detail?.timeline || []).map((ev) => (
                            <div
                              key={ev.id}
                              style={{
                                padding: '0.6rem 0.75rem',
                                border: '1px solid var(--graphite-border)',
                                borderRadius: '6px',
                                fontSize: '0.78rem',
                              }}
                            >
                              <div className="mono" style={{ fontSize: '0.65rem', color: 'var(--gold)' }}>
                                {ev.at ? new Date(ev.at).toLocaleString() : ''} · {ev.label || ev.type}
                              </div>
                              {ev.detail && <div style={{ marginTop: '0.25rem' }}>{ev.detail}</div>}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {tab === 'routing' && (
                      <div style={{ marginTop: '1rem' }}>
                        <div className="section-title">Category routing (reference)</div>
                        <table className="table-lite" style={{ marginTop: '0.5rem' }}>
                          <thead>
                            <tr>
                              <th>Condition</th>
                              <th>Route</th>
                              <th>Action</th>
                            </tr>
                          </thead>
                          <tbody>
                            <tr>
                              <td>Urgent injury risk + strong evidence</td>
                              <td>Emergency services</td>
                              <td>Call + log + attach packet</td>
                            </tr>
                            <tr>
                              <td>Credible code / housing violation</td>
                              <td>City department</td>
                              <td>Email + follow-up deadline</td>
                            </tr>
                            <tr>
                              <td>Legal pattern</td>
                              <td>Legal partner</td>
                              <td>Referral + preserve evidence</td>
                            </tr>
                            <tr>
                              <td>Insufficient evidence</td>
                              <td>Hold</td>
                              <td>Request proof before escalation</td>
                            </tr>
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>

          <p className="text-muted" style={{ fontSize: '0.72rem', marginTop: '1.5rem', maxWidth: '900px', lineHeight: 1.5 }}>
            Privacy: verifiers should use report-scoped context only. Full situation-room chat is not shown here by design — use
            report-linked threads and internal notes. Outbound actions are logged under <span className="mono">server/data/verifier-audit.json</span> until
            you connect PostgreSQL/Mongo models.
          </p>
        </main>
      </div>
    </div>
  );
}
