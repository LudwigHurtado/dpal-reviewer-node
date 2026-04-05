import { useState } from 'react';
import { clsx } from 'clsx';
import { ValidatorNetworkMap } from './components/ValidatorNetworkMap';
import { QueueReportReviewPanel } from './components/QueueReportReviewPanel';
import { SituationChatMonitor } from './components/SituationChatMonitor';
import { useReviewerDashboard } from './hooks/useReviewerDashboard';
import { resolvePublicReportUrl } from './utils/reportLinks';

const navItems = [
  { id: 'overview', label: 'Command overview' },
  { id: 'queues', label: 'Review queues' },
  { id: 'report-review', label: 'Opinions & effects' },
  { id: 'situation-chat', label: 'Situation chat control' },
  { id: 'validators', label: 'Validator network' },
  { id: 'trust', label: 'Trust & credentials' },
  { id: 'audit', label: 'Audit & chain proofs' },
];

function truncate(s: string, max: number) {
  if (s.length <= max) return s;
  return `${s.slice(0, max).trim()}…`;
}

export function App() {
  const [activeNav, setActiveNav] = useState('overview');
  const [stubNotice, setStubNotice] = useState<string | null>(null);
  const { data, loading, error, hadApiFailure, refresh, liveMode } = useReviewerDashboard();
  const useMock = import.meta.env.VITE_USE_MOCK_DATA === 'true';

  if (!data) {
    return (
      <div className="app-shell">
        <div className="main-area" style={{ padding: '2rem', color: 'var(--silver)' }}>
          {loading ? 'Loading review dashboard…' : 'No dashboard data.'}
        </div>
      </div>
    );
  }

  const qa = data.qualityAnalytics ?? {
    meanEvidenceGrade: 'B+',
    evidenceGradePct: 78,
    panelAgreementPct: 91,
    escalationPrecisionPct: 87,
  };

  const queueSource = data._sources?.queueRows === 'upstream' ? 'Main DPAL API' : 'Reviewer API (local file)';
  const dataMode = useMock ? 'MOCK_STATIC' : 'API';

  return (
    <div className="app-shell">
      <aside className="sidebar" aria-label="Primary">
        <div className="sidebar-brand">
          <h1>DPAL Enterprise</h1>
          <div className="title-main">Validator / Review-Node</div>
          <p className="subtitle">
            Trust, review, and accountability infrastructure — not social moderation.
          </p>
        </div>
        <nav className="nav-section" aria-label="Sections">
          <div className="nav-label">Navigate</div>
          {navItems.map((item) => (
            <button
              key={item.id}
              type="button"
              className={clsx('nav-item', activeNav === item.id && 'active')}
              onClick={() => {
                setActiveNav(item.id);
                document.getElementById(`sec-${item.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
              }}
            >
              {item.label}
            </button>
          ))}
        </nav>
        <div className="nav-section" style={{ marginTop: 'auto', paddingTop: '1rem' }}>
          <div className="nav-label">Environment</div>
          <div style={{ padding: '0 0.75rem', fontSize: '0.72rem', color: 'var(--silver-dim)' }}>
            <div className="mono">BUILD: review-node@1.0.0</div>
            <div className="mono" style={{ marginTop: '0.35rem' }}>
              DATA: {dataMode}
            </div>
            <div className="mono" style={{ marginTop: '0.35rem' }}>
              QUEUE: {queueSource}
            </div>
            {!useMock && (
              <div className="mono" style={{ marginTop: '0.35rem', lineHeight: 1.4 }}>
                LINKS:{' '}
                {import.meta.env.VITE_DPAL_PUBLIC_WEB_URL ? 'VITE_DPAL_PUBLIC_WEB_URL set' : 'set VITE_DPAL_PUBLIC_WEB_URL for Open report'}
              </div>
            )}
          </div>
        </div>
      </aside>

      <div className="main-area">
        <header className="top-bar">
          <div>
            <h2>Review-Node Command Center</h2>
            <div className="top-bar-meta">
              Session · UTC {new Date().toISOString().slice(0, 16).replace('T', ' ')} · Audit logging on
              {!useMock && (
                <span style={{ marginLeft: '0.75rem' }}>
                  · Queue sync:{' '}
                  <strong style={{ color: liveMode === 'sse' ? '#86efac' : liveMode === 'poll' ? '#fcd34d' : '#94a3b8' }}>
                    {liveMode === 'sse' ? 'live (SSE)' : liveMode === 'poll' ? 'polling' : 'static'}
                  </strong>
                </span>
              )}
            </div>
            {(loading || hadApiFailure) && (
              <div className="top-bar-meta" style={{ marginTop: '0.5rem' }}>
                {loading && <span>Syncing dashboard… </span>}
                {hadApiFailure && error && (
                  <span style={{ color: '#fca5a5' }}>
                    API error ({truncate(error, 120)}). Showing cached demo data until the API is reachable.
                  </span>
                )}
              </div>
            )}
          </div>
          <div className="top-bar-actions">
            <button
              type="button"
              className="btn"
              onClick={() =>
                setStubNotice(
                  'Export audit bundle is not wired yet — connect an export pipeline or download API when ready.',
                )
              }
            >
              Export audit bundle
            </button>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() =>
                setStubNotice(
                  'Assign validator is not wired yet — connect your assignment / roster service when ready.',
                )
              }
            >
              Assign validator
            </button>
          </div>
        </header>

        {stubNotice && (
          <div
            role="status"
            className="stub-notice"
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '1rem',
              flexWrap: 'wrap',
              padding: '0.6rem 1.25rem',
              fontSize: '0.78rem',
              color: 'var(--silver)',
              background: 'rgba(59, 130, 246, 0.12)',
              borderBottom: '1px solid rgba(59, 130, 246, 0.25)',
            }}
          >
            <span>{stubNotice}</span>
            <button type="button" className="btn" style={{ fontSize: '0.72rem', padding: '0.35rem 0.75rem' }} onClick={() => setStubNotice(null)}>
              Dismiss
            </button>
          </div>
        )}

        <main className="content-scroll">
          <section id="sec-overview" className="ecosystem-strip" aria-label="Reviewer ecosystem">
            {data.ecosystemRoles.map((role) => (
              <article key={role.id} className="eco-card">
                <h3>{role.title}</h3>
                <p>{role.desc}</p>
              </article>
            ))}
          </section>

          <p
            className="text-muted"
            style={{ marginBottom: '1.25rem', maxWidth: '920px', lineHeight: 1.55 }}
          >
            Public reports enter structured review: triage, evidence grading, panel consensus, escalation,
            and immutable validation history. Every material decision records who validated what, with
            quality scoring, accuracy tracking, and auditable revocation paths for enterprise, legal,
            nonprofit, and watchdog workflows.
          </p>

          <div className="grid-dashboard">
            <div id="sec-validators" className="panel span-7">
              <div className="panel-header">
                <h3>Validator network map</h3>
                <span className="badge">Live topology</span>
              </div>
              <div className="panel-body">
                <ValidatorNetworkMap />
                <div className="map-legend">
                  <span>
                    <span className="dot" style={{ background: '#2563eb' }} /> Hub node
                  </span>
                  <span>
                    <span className="dot" style={{ background: '#9a8b5f' }} /> Consensus path
                  </span>
                  <span>
                    <span className="dot" style={{ background: '#3d7a5c' }} /> Regional truth-check
                  </span>
                  <span>
                    <span className="dot" style={{ background: '#94a3b8' }} /> Satellite validator
                  </span>
                </div>
              </div>
            </div>

            <div className="panel span-5">
              <div className="panel-header">
                <h3>AI-assisted review summary</h3>
                <span className="badge">Advisory only</span>
              </div>
              <div className="panel-body">
                <p style={{ margin: 0, fontSize: '0.8125rem', lineHeight: 1.55, color: 'var(--silver)' }}>
                  {data.aiSummary}
                </p>
                <div style={{ marginTop: '1rem', paddingTop: '0.75rem', borderTop: '1px solid var(--graphite-border)' }}>
                  <div className="section-title">Model & policy</div>
                  <p className="text-muted" style={{ margin: 0 }}>
                    Summaries are generated under DPAL review policy v3.2; they do not replace legal or
                    sector determinations. Source citations attach to each queue item.
                  </p>
                </div>
              </div>
            </div>

            <div id="sec-queues" className="panel span-6">
              <div className="panel-header">
                <h3>Incoming report queues</h3>
                <span className="badge">{data.queueRows.length} open</span>
              </div>
              <div className="panel-body" style={{ padding: 0 }}>
                <table className="table-lite">
                  <thead>
                    <tr>
                      <th>ID</th>
                      <th>Report</th>
                      <th>Category</th>
                      <th>SLA</th>
                      <th>Confidence</th>
                      <th>Assignment</th>
                      <th>Stage</th>
                      <th>Open</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.queueRows.map((row) => {
                      const href = resolvePublicReportUrl(row);
                      return (
                        <tr key={row.id}>
                          <td className="mono">{row.id}</td>
                          <td>
                            <div style={{ fontWeight: 600, color: 'var(--white)', fontSize: '0.8rem' }}>
                              {row.title ?? '—'}
                            </div>
                            {row.summary && (
                              <div className="text-muted" style={{ fontSize: '0.72rem', marginTop: '0.25rem', maxWidth: '280px' }}>
                                {truncate(row.summary, 140)}
                              </div>
                            )}
                          </td>
                          <td>{row.category}</td>
                          <td>{row.sla}</td>
                          <td>{row.confidence}%</td>
                          <td>{row.assignee}</td>
                          <td>
                            <span className="tag tag-sector">{row.stage}</span>
                          </td>
                          <td>
                            {href ? (
                              <a href={href} target="_blank" rel="noopener noreferrer" className="mono" style={{ fontSize: '0.7rem', color: 'var(--gold)' }}>
                                Open ↗
                              </a>
                            ) : (
                              <span className="text-muted" style={{ fontSize: '0.68rem' }}>
                                —
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            <div id="sec-report-review" className="panel span-12">
              <div className="panel-header">
                <h3>Reviewer opinions & recommended effects</h3>
                <span className="badge">Per report</span>
              </div>
              <div className="panel-body">
                <p className="text-muted" style={{ marginTop: 0, marginBottom: '1rem', fontSize: '0.8rem', lineHeight: 1.55 }}>
                  Queue rows load from your reviewer API. When <span className="mono">DPAL_UPSTREAM_URL</span> is set on
                  that API, live reports from your main DPAL backend replace the demo queue. Save opinion and effect
                  here (stored on the API server in <span className="mono">reviewer-reviews.json</span> until auth and
                  attribution are added).
                </p>
                <QueueReportReviewPanel
                  rows={data.queueRows}
                  readOnly={useMock}
                  onSaved={() => refresh()}
                />
              </div>
            </div>

            <div id="sec-situation-chat" className="panel span-12">
              <div className="panel-header">
                <h3>Situation room oversight</h3>
                <span className="badge">Real-time chat</span>
              </div>
              <div className="panel-body">
                <p className="text-muted" style={{ marginTop: 0, marginBottom: '1rem', fontSize: '0.8rem', lineHeight: 1.55 }}>
                  The reviewer API proxies to your main DPAL backend (<span className="mono">GET/POST /api/situation/…</span>).
                  Set <span className="mono">DPAL_UPSTREAM_URL</span> on the API server to the same host as production (e.g. Railway{' '}
                  <span className="mono">dpal-ai-server</span>). You can read transcripts and post as <strong>DPAL Review Node</strong> to
                  steer conversations and flag issues.
                </p>
                <SituationChatMonitor readOnly={useMock} />
              </div>
            </div>

            <div className="panel span-6">
              <div className="panel-header">
                <h3>Escalation control</h3>
                <span className="badge">Recommendations</span>
              </div>
              <div className="panel-body">
                {data.escalations.map((e) => (
                  <div
                    key={e.id}
                    style={{
                      padding: '0.65rem 0',
                      borderBottom: '1px solid rgba(42, 53, 72, 0.6)',
                    }}
                  >
                    <div className="flex-between">
                      <span className="mono" style={{ fontSize: '0.72rem' }}>
                        {e.id}
                      </span>
                      <span
                        className="tag"
                        style={{
                          background: e.priority === 'High' ? 'rgba(168,84,84,0.25)' : 'rgba(184,134,11,0.2)',
                          color: e.priority === 'High' ? '#fecaca' : '#fcd34d',
                        }}
                      >
                        {e.priority}
                      </span>
                    </div>
                    <div className="mono" style={{ fontSize: '0.7rem', marginTop: '0.35rem' }}>
                      {e.report}
                    </div>
                    <p style={{ margin: '0.35rem 0 0', fontSize: '0.75rem', color: 'var(--silver)' }}>
                      {e.reason}
                    </p>
                    <p className="text-gold" style={{ margin: '0.35rem 0 0', fontSize: '0.72rem' }}>
                      → {e.recommendation}
                    </p>
                  </div>
                ))}
              </div>
            </div>

            <div className="panel span-6">
              <div className="panel-header">
                <h3>Reviewer performance</h3>
                <span className="badge">Trust scores</span>
              </div>
              <div className="panel-body">
                {data.reviewers.map((r) => (
                  <div key={r.name} className="stat-row">
                    <div>
                      <div style={{ fontWeight: 600, color: 'var(--white)', fontSize: '0.8rem' }}>{r.name}</div>
                      <div className="text-muted">
                        {r.role} · {r.reviews} reviews
                        {r.flag && (
                          <span className="tag tag-escalation" style={{ marginLeft: '0.35rem' }}>
                            Quality flag
                          </span>
                        )}
                      </div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div className="stat-value">{r.accuracy}% acc.</div>
                      <div className="text-muted">Trust {(r.trust * 100).toFixed(0)}%</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="panel span-6">
              <div className="panel-header">
                <h3>Review quality analytics</h3>
                <span className="badge">Rolling 30d</span>
              </div>
              <div className="panel-body">
                <div className="stat-row">
                  <span className="stat-label">Mean evidence grade</span>
                  <span className="stat-value">{qa.meanEvidenceGrade}</span>
                </div>
                <div className="progress-bar mb-1">
                  <span style={{ width: `${qa.evidenceGradePct}%` }} />
                </div>
                <div className="stat-row">
                  <span className="stat-label">Panel agreement rate</span>
                  <span className="stat-value">{qa.panelAgreementPct}%</span>
                </div>
                <div className="progress-bar mb-1">
                  <span style={{ width: `${qa.panelAgreementPct}%` }} />
                </div>
                <div className="stat-row">
                  <span className="stat-label">Escalation precision</span>
                  <span className="stat-value">{qa.escalationPrecisionPct}%</span>
                </div>
                <div className="progress-bar">
                  <span style={{ width: `${qa.escalationPrecisionPct}%` }} />
                </div>
                <p className="text-muted" style={{ marginTop: '0.75rem', marginBottom: 0 }}>
                  Low-quality reviewers are workload-capped; rewards accrue to high-accuracy validators per
                  enterprise policy.
                </p>
              </div>
            </div>

            <div id="sec-trust" className="panel span-6">
              <div className="panel-header">
                <h3>Credential status</h3>
                <span className="badge">Wallet-linked</span>
              </div>
              <div className="panel-body">
                {data.credentials.map((c) => (
                  <div
                    key={c.id}
                    style={{
                      marginBottom: '0.75rem',
                      padding: '0.65rem 0.75rem',
                      background: 'var(--bg-elevated)',
                      borderRadius: 'var(--radius)',
                      border: '1px solid var(--graphite-border)',
                    }}
                  >
                    <div className="flex-between">
                      <strong style={{ fontSize: '0.8rem' }}>{c.holder}</strong>
                      <span
                        className="tag"
                        style={{
                          background:
                            c.status === 'Active' ? 'rgba(61,122,92,0.25)' : 'rgba(184,134,11,0.2)',
                          color: c.status === 'Active' ? '#86efac' : '#fcd34d',
                        }}
                      >
                        {c.status}
                      </span>
                    </div>
                    <div className="text-muted" style={{ marginTop: '0.25rem' }}>
                      {c.type}
                    </div>
                    <div className="mono" style={{ fontSize: '0.68rem', marginTop: '0.35rem' }}>
                      {c.id} · {c.wallet}
                    </div>
                    <div className="text-muted" style={{ marginTop: '0.25rem', fontSize: '0.68rem' }}>
                      Issued {c.issued} · {c.chain}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="panel span-6">
              <div className="panel-header">
                <h3>Consensus review tracker</h3>
                <span className="badge">Multi-panel</span>
              </div>
              <div className="panel-body" style={{ padding: 0 }}>
                <table className="table-lite">
                  <thead>
                    <tr>
                      <th>Report</th>
                      <th>Panel</th>
                      <th>Agree / Dissent</th>
                      <th>Outcome</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.consensusItems.map((c) => (
                      <tr key={c.report}>
                        <td className="mono">{c.report}</td>
                        <td>{c.panel}</td>
                        <td>
                          {c.agree} / {c.dissent}
                        </td>
                        <td>{c.outcome}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="panel span-6">
              <div className="panel-header">
                <h3>Conflict-of-interest alerts</h3>
                <span className="badge">Compliance</span>
              </div>
              <div className="panel-body">
                {data.coiAlerts.map((a, idx) => (
                  <div
                    key={a.id}
                    className="alert-banner"
                    style={{ marginBottom: idx === data.coiAlerts.length - 1 ? 0 : '0.75rem' }}
                  >
                    <div>
                      <strong>{a.id}</strong> · {a.severity}
                      <div style={{ marginTop: '0.35rem', color: 'var(--silver)' }}>{a.detail}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="panel span-6">
              <div className="panel-header">
                <h3>Regional verification coverage</h3>
                <span className="badge">Truth-check teams</span>
              </div>
              <div className="panel-body">
                {data.regions.map((r) => (
                  <div key={r.code} className="stat-row">
                    <div>
                      <span style={{ fontWeight: 600, color: 'var(--white)' }}>Region {r.code}</span>
                      <span className="text-muted" style={{ marginLeft: '0.5rem' }}>
                        {r.teams} teams · {r.pending} pending
                      </span>
                    </div>
                    <span className="stat-value">{r.coverage}%</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="panel span-6">
              <div className="panel-header">
                <h3>Category expertise indicators</h3>
                <span className="badge">Sector panels</span>
              </div>
              <div className="panel-body">
                {data.expertise.map((e) => (
                  <div key={e.sector} style={{ marginBottom: '0.75rem' }}>
                    <div className="flex-between">
                      <span className="stat-label">{e.sector}</span>
                      <span className="mono" style={{ color: 'var(--white)', fontSize: '0.75rem' }}>
                        {e.depth}% · {e.panelists} panelists
                      </span>
                    </div>
                    <div className="progress-bar">
                      <span style={{ width: `${e.depth}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div id="sec-audit" className="panel span-6">
              <div className="panel-header">
                <h3>Audit-ready logs & chain proofs</h3>
                <span className="badge">Append-only</span>
              </div>
              <div className="panel-body">
                <div className="section-title">Recent events</div>
                <div className="timeline">
                  {data.auditEvents.map((ev) => (
                    <div key={ev.ts + ev.ref} className="timeline-item">
                      <div className="mono" style={{ color: 'var(--silver-dim)' }}>
                        {ev.ts}
                      </div>
                      <div>
                        <strong style={{ color: 'var(--white)' }}>{ev.actor}</strong> — {ev.action}
                      </div>
                      <div className="chain-line" style={{ marginTop: '0.35rem' }}>
                        Ref: {ev.ref}
                      </div>
                    </div>
                  ))}
                </div>
                <div style={{ marginTop: '1rem' }}>
                  <div className="section-title">Blockchain-backed validation proof (sample)</div>
                  <div className="chain-line">
                    attestation:v2:sha256:7f83b1657ff1fc53b92dc18148a1d65dfc2d4b1fa3d677284addd200126d9069@dpal-l2#block
                    4829103
                  </div>
                  <p className="text-muted" style={{ marginTop: '0.5rem', marginBottom: 0 }}>
                    Proofs anchor validator signatures and report hashes for third-party verification without
                    exposing underlying PII.
                  </p>
                </div>
                <div style={{ marginTop: '1rem', display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    className="btn"
                    onClick={() =>
                      setStubNotice(
                        'Revocation manifest export is not wired yet — hook to your attestation / chain export when ready.',
                      )
                    }
                  >
                    Download revocation manifest
                  </button>
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={() =>
                      setStubNotice(
                        'Integrity check is not wired yet — connect verification jobs or chain RPC when ready.',
                      )
                    }
                  >
                    Run integrity check
                  </button>
                </div>
              </div>
            </div>

            <div className="panel span-12">
              <div className="panel-header">
                <h3>Operational posture</h3>
                <span className="badge">Enterprise</span>
              </div>
              <div className="panel-body">
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                    gap: '1rem',
                    fontSize: '0.75rem',
                    color: 'var(--silver)',
                  }}
                >
                  <div>
                    <div className="section-title">Core value</div>
                    <ul style={{ margin: 0, paddingLeft: '1.1rem', lineHeight: 1.6 }}>
                      <li>Record who validated what</li>
                      <li>Track review quality & accuracy</li>
                      <li>Reward useful validators; flag low-quality reviewers</li>
                      <li>Auditable histories & enterprise-grade trust</li>
                    </ul>
                  </div>
                  <div>
                    <div className="section-title">Audience</div>
                    <p style={{ margin: 0, lineHeight: 1.6 }}>
                      Administrators, analysts, legal teams, QC managers, and credentialed validators share a
                      single command surface — aligned to serious oversight, not popularity contests.
                    </p>
                  </div>
                  <div>
                    <div className="section-title">Data source</div>
                    <p style={{ margin: 0, lineHeight: 1.6, color: 'var(--silver-dim)' }}>
                      Queue rows load from the reviewer API when{' '}
                      <span className="mono">VITE_USE_MOCK_DATA</span> is unset; set{' '}
                      <span className="mono">DPAL_UPSTREAM_URL</span> on the API server to merge reports from your
                      main DPAL backend. See <span className="mono">.env.example</span>.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
