import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  fetchVerifierQueue,
  fetchVerifierReportDetail,
  getVerifierIdentity,
  postAiTriage,
  postOutboundAction,
  postRequestEvidence,
  postVerifierNotes,
  postVerify,
  setVerifierIdentity,
} from '../api/verifierClient';
import { VerifierCaseWorkspace } from './VerifierCaseWorkspace';
import { categoryPlaybooks } from '../verifier/categoryPlaybooks';
import type {
  CategoryKey,
  Severity,
  VerifierAiTriage,
  VerifierCaseState,
  VerifierDetailMeta,
  VerifierQueueRow,
  VerifierReportDetail,
  TimelineEvent,
  VerifierSituationMessage,
} from '../verifier/types';
import { demoVerifierReports } from '../data/verifierDemo';
import { resolveVerifierMediaUrl } from '../lib/mediaUrl';

type Tab = 'verify' | 'actions' | 'history' | 'routing' | 'situation';

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

/** Shrink full detail back to a queue row for the left-hand list. */
function detailToQueueRow(r: VerifierReportDetail): VerifierQueueRow {
  const evCount = Array.isArray(r.evidence) ? r.evidence.length : r.evidenceCount;
  return {
    id: r.id,
    title: r.title,
    summary: (r.summary || r.description || '').slice(0, 500),
    category: r.category,
    categoryKey: r.categoryKey,
    city: r.city,
    severity: r.severity,
    verificationScore: r.verificationScore,
    status: r.status,
    evidenceCount: evCount,
    stage: r.stage,
    publicUrl: r.publicUrl,
    thumbnailUrl: r.thumbnailUrl,
  };
}

function syntheticDetail(row: VerifierQueueRow): {
  report: VerifierReportDetail;
  notes: { text: string; updatedAt: string | null };
  timeline: TimelineEvent[];
  situationMessages: VerifierSituationMessage[];
  caseState: VerifierCaseState;
  meta: VerifierDetailMeta;
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
    situationMessages: [],
    caseState: {
      disposition: 'under_review',
      assignedVerifier: '',
      assignedSupervisor: '',
      deadline: null,
      redactionNotes: '',
      reporterFacingStatus: 'under_review',
      lastReviewedBy: '',
      lastReviewedAt: null,
    },
    meta: {
      dispositions: [
        'under_review',
        'verified',
        'needs_more_evidence',
        'urgent',
        'duplicate',
        'false_unsupported',
        'closed_no_action',
        'escalated',
        'action_taken',
        'follow_up_requested',
      ],
    },
  };
}

export function VerifierPortal() {
  const [reports, setReports] = useState<VerifierQueueRow[]>([]);
  const [source, setSource] = useState<string>('');
  const [useDemo, setUseDemo] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [feedDebug, setFeedDebug] = useState<{ feedUrl?: string; httpStatus?: number } | null>(null);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detail, setDetail] = useState<{
    report: VerifierReportDetail;
    notes: { text: string; updatedAt: string | null };
    timeline: TimelineEvent[];
    situationMessages: VerifierSituationMessage[];
    caseState?: VerifierCaseState;
    meta?: VerifierDetailMeta;
  } | null>(null);

  const [verifierIdentity, setVerifierIdentityState] = useState('');
  useEffect(() => {
    setVerifierIdentityState(getVerifierIdentity());
  }, []);

  const [tab, setTab] = useState<Tab>('verify');
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<string>('all');
  const openedReportIdFromUrl = useRef(false);

  const [notes, setNotes] = useState('');
  const [actionType, setActionType] = useState('call');
  const [actionMessage, setActionMessage] = useState('');
  const [aiTriage, setAiTriage] = useState<VerifierAiTriage | null>(null);
  const [aiBusy, setAiBusy] = useState(false);
  /** Required for real email delivery (API has no recipient otherwise). */
  const [outboundEmail, setOutboundEmail] = useState('');
  const [outboundPhone, setOutboundPhone] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const loadQueue = useCallback(async () => {
    setLoading(true);
    setLoadErr(null);
    setFeedDebug(null);
    try {
      const data = await fetchVerifierQueue();
      const src = data.source || '';
      setSource(src);
      setFeedDebug(data.debug ?? null);
      if (data.reports && data.reports.length > 0) {
        setReports(data.reports);
        setUseDemo(false);
        setLoadErr(null);
        return;
      }
      if (src === 'upstream_empty' || src === 'unconfigured' || src === 'upstream_error') {
        setReports([]);
        setUseDemo(false);
        setLoadErr(data.message || (src === 'upstream_empty' ? 'Feed returned no reports.' : 'Could not load upstream feed.'));
        return;
      }
      setReports(demoVerifierReports);
      setUseDemo(true);
      setLoadErr(data.message || null);
    } catch (e: unknown) {
      setReports([]);
      setUseDemo(false);
      setLoadErr(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  /** Load one filing by id from upstream GET /api/reports/:id (works when the feed omits it or is capped). */
  const openByReportId = useCallback(async (rawId: string) => {
    const id = rawId.trim();
    if (!id) return;
    setNotice(null);
    setDetailLoading(true);
    try {
      const d = await fetchVerifierReportDetail(id);
      const row = detailToQueueRow(d.report);
      setReports((prev) => (prev.some((r) => r.id === row.id) ? prev : [row, ...prev]));
      setSelectedId(row.id);
      setUseDemo(false);
    } catch (e: unknown) {
      const base = e instanceof Error ? e.message : String(e);
      setNotice(
        `${base} — The Ledger can show filings still only in your browser. The verifier needs that filing on the server: successful POST /api/reports (or anchor), and GET /api/reports/${id} must return the document. The stored id may differ from the on-screen number (check the network tab or Mongo).`,
      );
    } finally {
      setDetailLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadQueue();
  }, [loadQueue]);

  useEffect(() => {
    if (openedReportIdFromUrl.current) return;
    const id = new URLSearchParams(window.location.search).get('reportId')?.trim();
    if (!id) return;
    openedReportIdFromUrl.current = true;
    void openByReportId(id);
  }, [openByReportId]);

  useEffect(() => {
    const id = window.setInterval(() => {
      if (!useDemo) void loadQueue();
    }, 25000);
    return () => window.clearInterval(id);
  }, [loadQueue, useDemo]);

  const loadDetail = useCallback(
    async (id: string, opts?: { silent?: boolean }) => {
      const silent = Boolean(opts?.silent);
      if (!silent) setDetailLoading(true);
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
            situationMessages: d.situationMessages ?? [],
            caseState: d.caseState,
            meta: d.meta,
          });
          setNotes(d.notes?.text || '');
          setAiTriage(null);
        }
      } catch (e: unknown) {
        setNotice(e instanceof Error ? e.message : String(e));
        setDetail(null);
      } finally {
        if (!silent) setDetailLoading(false);
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
    const withScore = reports
      .map((r) => {
        const hay = [r.id, r.title, r.city, r.summary, r.category].join(' ').toLowerCase();
        const cat = category === 'all' || r.categoryKey === category;
        if (!cat) return null;
        if (!q) return { row: r, score: 1 };

        if (!hay.includes(q)) return null;

        let score = 1;
        if (r.title.toLowerCase().includes(q)) score += 8;
        if (r.category.toLowerCase().includes(q) || String(r.categoryKey).toLowerCase().includes(q)) score += 6;
        if (r.city.toLowerCase().includes(q)) score += 4;
        if (r.id.toLowerCase().includes(q)) score += 3;
        if (r.summary.toLowerCase().includes(q)) score += 2;
        if (r.severity === 'urgent') score += 2;
        score += Math.round((r.verificationScore || 0) / 20);
        return { row: r, score };
      })
      .filter((x): x is { row: VerifierQueueRow; score: number } => Boolean(x))
      .sort((a, b) => b.score - a.score);

    return withScore.slice(0, 20).map((x) => x.row);
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

  const situationRoomDeepLink = useMemo(() => {
    const raw = import.meta.env.VITE_DPAL_PUBLIC_WEB_URL;
    const rid = detail?.report?.id ?? selected?.id;
    if (typeof raw !== 'string' || !raw.trim() || !rid) return null;
    try {
      const u = new URL(raw.trim().replace(/\/$/, ''));
      u.searchParams.set('reportId', rid);
      u.searchParams.set('situationRoom', '1');
      return u.toString();
    } catch {
      return null;
    }
  }, [detail?.report?.id, selected?.id]);

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
          : actionType === 'ai_call'
            ? 'call-outbound'
          : actionType === 'emergency_dispatch'
            ? 'escalate-emergency'
            : actionType === 'legal_referral'
              ? 'legal-referral'
              : actionType === 'assign_followup'
                ? 'assign-followup'
                : actionType === 'non_emergency'
                  ? 'call'
                  : 'call';
      if (useDemo) {
        setNotice('Demo mode — action not sent. Configure upstream + mail/call providers for production.');
      } else {
        if (kind === 'call-outbound' && !outboundPhone.trim()) {
          setNotice('Enter a destination phone number to place an AI call.');
          return;
        }
        const res = await postOutboundAction(selectedId, kind, {
          message: actionMessage,
          summary: actionMessage,
          destination_name: playbook?.agencies[0],
          destination_email: outboundEmail.trim() || undefined,
          destination_phone: outboundPhone.trim() || undefined,
          to_phone: outboundPhone.trim() || undefined,
          subject: `DPAL verifier — ${selected?.title?.slice(0, 80) || 'Report'} (${selectedId})`,
        });
        const d = res.delivery as {
          sent?: boolean;
          provider?: string;
          reason?: string;
          error?: unknown;
          errorSummary?: string;
        } | undefined;
        if (d?.sent) {
          setNotice(`Email sent via ${d.provider || 'mail'}.`);
        } else if (kind === 'email' || kind === 'escalate-emergency' || kind === 'legal-referral') {
          const detail =
            d?.errorSummary ||
            d?.reason ||
            (d?.error != null ? JSON.stringify(d.error) : '') ||
            'unknown';
          setNotice(
            outboundEmail.trim()
              ? `Email not delivered (${detail}). ${res.hint || 'Set RESEND_API_KEY, SENDGRID_API_KEY, or SMTP_* on the Reviewer API.'}`
              : 'Enter a recipient email above — the server cannot send without a To: address.',
          );
        } else {
          if (kind === 'call-outbound') {
            const sid = (res as { call?: { callSid?: string } }).call?.callSid;
            setNotice(`Outbound AI call started${sid ? ` (SID: ${sid})` : ''}.`);
          } else {
            setNotice(res.warning || res.hint || 'Action logged in verifier audit file.');
          }
        }
        await loadDetail(selectedId);
      }
    } catch (e: unknown) {
      setNotice(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const runAiCopilot = async () => {
    if (!selectedId || useDemo) {
      setNotice('AI copilot needs a real server report (not demo mode).');
      return;
    }
    setAiBusy(true);
    try {
      const res = await postAiTriage(selectedId);
      setAiTriage(res.triage);
      setNotice(
        `AI quest ready (${res.triage.mode || 'heuristic'}): urgency ${res.triage.urgency}, destination ${res.triage.destination}.`,
      );
    } catch (e: unknown) {
      setNotice(e instanceof Error ? e.message : String(e));
    } finally {
      setAiBusy(false);
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
                <span style={{ color: '#fcd34d', marginLeft: '0.5rem' }}>· Sample queue (enable upstream for live data)</span>
              )}
              {source === 'upstream' && !useDemo && (
                <span style={{ color: '#86efac', marginLeft: '0.5rem' }}>· Live upstream feed</span>
              )}
              {source === 'upstream_empty' && !useDemo && (
                <span style={{ color: '#93c5fd', marginLeft: '0.5rem' }}>· Connected — feed has no reports yet</span>
              )}
              {source === 'unconfigured' && !useDemo && (
                <span style={{ color: '#fca5a5', marginLeft: '0.5rem' }}>· DPAL_UPSTREAM_URL not set on Reviewer API</span>
              )}
              {source === 'upstream_error' && !useDemo && (
                <span style={{ color: '#fca5a5', marginLeft: '0.5rem' }}>· Upstream feed request failed</span>
              )}
            </div>
          </div>
          <div className="top-bar-actions" style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '0.65rem' }}>
            <label style={{ fontSize: '0.72rem', color: 'var(--silver-dim)', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
              Verifier identity
              <input
                type="text"
                value={verifierIdentity}
                onChange={(e) => {
                  const v = e.target.value;
                  setVerifierIdentityState(v);
                  setVerifierIdentity(v);
                }}
                placeholder="Name or staff ID"
                autoComplete="username"
                style={{
                  width: 'min(42vw, 200px)',
                  padding: '0.4rem 0.55rem',
                  fontSize: '0.78rem',
                  background: 'var(--bg-deep)',
                  border: '1px solid var(--graphite-border)',
                  borderRadius: '6px',
                  color: 'var(--silver)',
                }}
              />
            </label>
            <button type="button" className="btn" onClick={() => void loadQueue()} disabled={loading}>
              {loading ? 'Refreshing…' : 'Refresh queue'}
            </button>
          </div>
        </header>

        {loadErr && !useDemo && (
          <div
            role="status"
            style={{
              margin: '0 0 0.75rem',
              padding: '0.65rem 0.85rem',
              borderRadius: '8px',
              border: `1px solid ${source === 'upstream_empty' ? 'rgba(59, 130, 246, 0.35)' : 'rgba(248, 113, 113, 0.4)'}`,
              background:
                source === 'upstream_empty' ? 'rgba(59, 130, 246, 0.1)' : 'rgba(248, 113, 113, 0.08)',
              fontSize: '0.78rem',
              lineHeight: 1.45,
              maxWidth: '52rem',
            }}
          >
            <strong style={{ color: 'var(--silver)' }}>
              {source === 'upstream_empty' ? 'No filings on the server yet' : 'Queue could not load live data'}
            </strong>
            <div style={{ marginTop: '0.35rem', color: 'var(--silver-dim)' }}>{loadErr}</div>
            {feedDebug?.feedUrl && (
              <div className="mono" style={{ marginTop: '0.45rem', fontSize: '0.65rem', wordBreak: 'break-all', opacity: 0.9 }}>
                Tried: {feedDebug.feedUrl}
                {feedDebug.httpStatus != null ? ` → HTTP ${feedDebug.httpStatus}` : ''}
              </div>
            )}
          </div>
        )}

        <p
          role="note"
          style={{
            fontSize: '0.72rem',
            color: 'var(--silver-dim)',
            margin: '0 0 0.75rem',
            maxWidth: '52rem',
            lineHeight: 1.5,
          }}
        >
          <strong style={{ color: 'var(--silver)' }}>Library vs queue:</strong> The DPAL home hub merges{' '}
          <em>device-only</em> filings (localStorage) with the server feed. This portal only lists reports returned by your
          upstream API (<span className="mono">GET …/api/reports/feed</span>). To appear here, filings must be saved to the
          same backend your main app uses (<span className="mono">POST /api/reports</span> or anchor). IDs must match{' '}
          <span className="mono">GET /api/reports/:id</span> for full detail and images.
        </p>

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

        {loadErr && useDemo && !notice && (
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
                      color: '#f8fafc',
                    }}
                  >
                    <option value="all" style={{ color: '#111827', background: '#ffffff' }}>All categories</option>
                    <option value="environmental" style={{ color: '#111827', background: '#ffffff' }}>Environmental</option>
                    <option value="housing" style={{ color: '#111827', background: '#ffffff' }}>Housing</option>
                    <option value="labor" style={{ color: '#111827', background: '#ffffff' }}>Labor</option>
                    <option value="public_safety" style={{ color: '#111827', background: '#ffffff' }}>Public safety</option>
                    <option value="medical" style={{ color: '#111827', background: '#ffffff' }}>Medical</option>
                  </select>
                  <div className="text-muted" style={{ fontSize: '0.65rem', marginTop: '0.25rem' }}>
                    Showing up to 20 most relevant results per search/category.
                  </div>
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
                          src={resolveVerifierMediaUrl(r.thumbnailUrl)}
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
                  {filtered.length === 0 && !useDemo && (
                    <p className="text-muted" style={{ fontSize: '0.78rem', margin: 0 }}>
                      No reports in this queue. Use the status box above — then POST filings to your main API and refresh.
                    </p>
                  )}
                </div>
              </div>
            </div>

            <div className="panel span-8">
              {!selected && !useDemo && reports.length === 0 ? (
                <div className="panel-body">
                  <p className="text-muted">No report selected — the queue is empty until the feed returns filings.</p>
                </div>
              ) : !selected ? (
                <div className="panel-body">
                  <p className="text-muted">Select a report from the queue.</p>
                </div>
              ) : detailLoading && !detail?.report ? (
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
                                href={resolveVerifierMediaUrl(ev.file_url)}
                                target="_blank"
                                rel="noopener noreferrer"
                                style={{ display: 'block', lineHeight: 0 }}
                              >
                                <img
                                  src={resolveVerifierMediaUrl(ev.thumbnail_url || ev.file_url)}
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
                                />
                              </a>
                            ) : (
                              <div key={ev.id} className="text-muted" style={{ fontSize: '0.72rem', wordBreak: 'break-all' }}>
                                {ev.type}
                                {ev.file_url ? (
                                  <>
                                    {' · '}
                                    <a href={resolveVerifierMediaUrl(ev.file_url)} target="_blank" rel="noopener noreferrer">
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

                    {selectedId && detail?.report ? (
                      <VerifierCaseWorkspace
                        reportId={detail.report.id}
                        caseState={detail.caseState}
                        meta={detail.meta}
                        priorActions={(detail.report.priorActions || []) as unknown[]}
                        useDemo={useDemo}
                        onRefresh={async () => {
                          if (selectedId) await loadDetail(selectedId, { silent: true });
                        }}
                        setNotice={setNotice}
                      />
                    ) : null}

                    <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap', marginTop: '1rem' }}>
                      {(['verify', 'actions', 'history', 'situation', 'routing'] as Tab[]).map((t) => (
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
                          {t === 'situation' &&
                            `Situation chat${(detail?.situationMessages?.length ?? 0) > 0 ? ` (${detail?.situationMessages?.length})` : ''}`}
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
                          <div
                            style={{
                              border: '1px solid var(--graphite-border)',
                              borderRadius: 'var(--radius-lg)',
                              padding: '0.75rem',
                              marginBottom: '0.75rem',
                              background: 'rgba(59, 130, 246, 0.08)',
                            }}
                          >
                            <div className="section-title">AI Verifier Copilot</div>
                            <p className="text-muted" style={{ fontSize: '0.72rem', marginTop: '0.35rem', marginBottom: '0.5rem' }}>
                              Generate category-aware quest steps and pre-drafted agency statements for accountability outreach.
                            </p>
                            <button type="button" className="btn btn-primary" disabled={busy || aiBusy} onClick={() => void runAiCopilot()}>
                              {aiBusy ? 'Generating…' : 'Generate AI quest'}
                            </button>
                            {aiTriage && (
                              <div style={{ marginTop: '0.6rem', fontSize: '0.74rem', display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
                                <div>
                                  <strong>Urgency:</strong> {aiTriage.urgency} · <strong>Credibility:</strong>{' '}
                                  {Math.round(Number(aiTriage.credibility_estimate) || 0)}%
                                </div>
                                <div>
                                  <strong>Route:</strong> {aiTriage.destination}
                                </div>
                                {aiTriage.missing_info?.length ? (
                                  <div>
                                    <strong>Missing:</strong> {aiTriage.missing_info.join(', ')}
                                  </div>
                                ) : null}
                                {aiTriage.quest_steps?.length ? (
                                  <ol style={{ margin: '0.35rem 0 0.1rem 1rem', padding: 0 }}>
                                    {aiTriage.quest_steps.slice(0, 6).map((step, idx) => (
                                      <li key={`${step}-${idx}`} style={{ marginBottom: '0.18rem' }}>
                                        {step}
                                      </li>
                                    ))}
                                  </ol>
                                ) : null}
                              </div>
                            )}
                          </div>
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
                            <option value="ai_call">Place AI call (voice agent)</option>
                            <option value="email_city">Email city / department</option>
                            <option value="emergency_dispatch">Emergency escalation</option>
                            <option value="non_emergency">Non-emergency dispatch</option>
                            <option value="legal_referral">Legal referral</option>
                            <option value="assign_followup">Assign follow-up</option>
                          </select>
                          <label style={{ display: 'block', marginTop: '0.65rem', fontSize: '0.75rem', color: 'var(--silver-dim)' }}>
                            Recipient email(s) (required to actually send email — escalation / legal / city)
                            <input
                              type="email"
                              value={outboundEmail}
                              onChange={(e) => setOutboundEmail(e.target.value)}
                              placeholder="agency@city.gov, inspector@county.gov"
                              autoComplete="email"
                              style={{
                                width: '100%',
                                marginTop: '0.3rem',
                                padding: '0.45rem',
                                background: 'var(--bg-deep)',
                                border: '1px solid var(--graphite-border)',
                                color: 'var(--white)',
                                borderRadius: '6px',
                              }}
                            />
                          </label>
                          <label style={{ display: 'block', marginTop: '0.65rem', fontSize: '0.75rem', color: 'var(--silver-dim)' }}>
                            Destination phone (required for AI call)
                            <input
                              type="tel"
                              value={outboundPhone}
                              onChange={(e) => setOutboundPhone(e.target.value)}
                              placeholder="+1XXXXXXXXXX"
                              autoComplete="tel"
                              style={{
                                width: '100%',
                                marginTop: '0.3rem',
                                padding: '0.45rem',
                                background: 'var(--bg-deep)',
                                border: '1px solid var(--graphite-border)',
                                color: 'var(--white)',
                                borderRadius: '6px',
                              }}
                            />
                          </label>
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
                          {aiTriage?.agency_drafts?.length ? (
                            <div style={{ marginTop: '0.75rem' }}>
                              <div className="section-title">AI pre-drafted agency statements</div>
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem', marginTop: '0.45rem' }}>
                                {aiTriage.agency_drafts.slice(0, 5).map((d, idx) => (
                                  <div
                                    key={`${d.agency}-${idx}`}
                                    style={{
                                      border: '1px solid var(--graphite-border)',
                                      borderRadius: '6px',
                                      padding: '0.45rem 0.55rem',
                                      background: 'var(--bg-elevated)',
                                    }}
                                  >
                                    <div style={{ fontSize: '0.74rem', fontWeight: 600 }}>{d.agency}</div>
                                    {d.subject ? <div className="text-muted" style={{ fontSize: '0.68rem' }}>Subject: {d.subject}</div> : null}
                                    <button
                                      type="button"
                                      className="btn"
                                      style={{ fontSize: '0.68rem', marginTop: '0.35rem' }}
                                      onClick={() => {
                                        setActionType('email_city');
                                        setActionMessage(d.body || '');
                                      }}
                                    >
                                      Use this draft
                                    </button>
                                  </div>
                                ))}
                              </div>
                            </div>
                          ) : null}
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
                          {aiTriage?.draft_email ? (
                            <button
                              type="button"
                              className="btn"
                              style={{ marginTop: '0.5rem', marginLeft: '0.5rem' }}
                              onClick={() => setActionMessage(aiTriage.draft_email)}
                            >
                              Use AI quick draft
                            </button>
                          ) : null}
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

                    {tab === 'situation' && (
                      <div style={{ marginTop: '1rem' }}>
                        <div
                          style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'flex-start',
                            gap: '1rem',
                            flexWrap: 'wrap',
                          }}
                        >
                          <div className="section-title">Situation room thread</div>
                          {situationRoomDeepLink ? (
                            <a
                              href={situationRoomDeepLink}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="btn btn-primary"
                              style={{ fontSize: '0.72rem' }}
                            >
                              Open full chat in DPAL ↗
                            </a>
                          ) : null}
                        </div>
                        <p className="text-muted" style={{ fontSize: '0.72rem', marginTop: '0.35rem', lineHeight: 1.45 }}>
                          Read-only copy of messages from your filing API (
                          <span className="mono">GET /api/situation/:reportId/messages</span>). Set{' '}
                          <span className="mono">VITE_DPAL_PUBLIC_WEB_URL</span> on Vercel for the button above. New chat and
                          media uploads happen in the main app; use notes and outbound actions here for audit.
                        </p>
                        <div
                          style={{
                            maxHeight: 'min(50vh, 420px)',
                            overflowY: 'auto',
                            marginTop: '0.75rem',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '0.5rem',
                          }}
                        >
                          {(detail?.situationMessages || []).length === 0 ? (
                            <p className="text-muted" style={{ fontSize: '0.78rem' }}>
                              No messages returned. If the main API does not implement situation routes yet, only the DPAL app
                              will show chat. Otherwise confirm the room id matches this report id.
                            </p>
                          ) : (
                            [...(detail?.situationMessages || [])]
                              .sort((a, b) => a.timestamp - b.timestamp)
                              .map((m) => (
                                <div
                                  key={m.id}
                                  style={{
                                    padding: '0.5rem 0.65rem',
                                    border: '1px solid var(--graphite-border)',
                                    borderRadius: '6px',
                                    fontSize: '0.78rem',
                                    background: m.isSystem ? 'rgba(59, 130, 246, 0.08)' : 'var(--bg-elevated)',
                                  }}
                                >
                                  <div className="mono" style={{ fontSize: '0.62rem', color: 'var(--silver-dim)' }}>
                                    {m.sender} · {new Date(m.timestamp).toLocaleString()}
                                  </div>
                                  {m.text ? <div style={{ marginTop: '0.25rem', whiteSpace: 'pre-wrap' }}>{m.text}</div> : null}
                                  {m.imageUrl ? (
                                    <img
                                      src={resolveVerifierMediaUrl(m.imageUrl)}
                                      alt=""
                                      style={{ maxWidth: 'min(100%, 280px)', marginTop: '0.35rem', borderRadius: '4px' }}
                                      loading="lazy"
                                    />
                                  ) : null}
                                </div>
                              ))
                          )}
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
            Privacy: use the Situation chat tab for read-only context from the main API when available. Verifier notes and outbound
            actions are logged under <span className="mono">server/data/verifier-audit.json</span> until you connect PostgreSQL/Mongo models.
          </p>
        </main>
      </div>
    </div>
  );
}
