import { useCallback, useEffect, useMemo, useState } from 'react';
import type { CSSProperties } from 'react';
import type { VerifierAiTriage, VerifierCaseState, VerifierDetailMeta, VerifierDisposition } from '../verifier/types';
import {
  patchVerifierCase,
  postAccountability,
  postAiTriage,
  postCallScript,
  postCloseCase,
  postDisposition,
  postOutboundAction,
  postPhoneLog,
} from '../api/verifierClient';

const DISPOSITION_LABELS: Record<string, string> = {
  under_review: 'Under review',
  verified: 'Verified',
  needs_more_evidence: 'Needs more evidence',
  urgent: 'Urgent',
  duplicate: 'Duplicate',
  false_unsupported: 'False / unsupported',
  closed_no_action: 'Closed (no action)',
  escalated: 'Escalated',
  action_taken: 'Action taken',
  follow_up_requested: 'Follow-up requested',
};

type PriorAction = {
  id?: string;
  actionType?: string;
  label?: string;
  at?: string;
  performed_by?: string;
  destination_email?: string;
  destination_name?: string;
  summary?: string;
  sent_at?: string;
  response_summary?: string;
  resolution?: string;
};

export function VerifierCaseWorkspace(props: {
  reportId: string;
  caseState: VerifierCaseState | undefined;
  meta: VerifierDetailMeta | undefined;
  priorActions: unknown[];
  useDemo: boolean;
  onRefresh: () => Promise<void>;
  setNotice: (s: string | null) => void;
}) {
  const { reportId, caseState, meta, priorActions, useDemo, onRefresh, setNotice } = props;
  const [busy, setBusy] = useState(false);
  const [triage, setTriage] = useState<VerifierAiTriage | null>(null);
  const [callScript, setCallScript] = useState<string | null>(null);

  const [assignV, setAssignV] = useState(caseState?.assignedVerifier ?? '');
  const [assignS, setAssignS] = useState(caseState?.assignedSupervisor ?? '');
  const [deadline, setDeadline] = useState(caseState?.deadline ?? '');
  const [redact, setRedact] = useState(caseState?.redactionNotes ?? '');

  const [emailTo, setEmailTo] = useState('');
  const [emailSubj, setEmailSubj] = useState('');
  const [emailBody, setEmailBody] = useState('');
  const [phoneSummary, setPhoneSummary] = useState('');
  const [phoneNum, setPhoneNum] = useState('');
  const [notifyEmail, setNotifyEmail] = useState('');
  const [closeReason, setCloseReason] = useState('');

  useEffect(() => {
    setAssignV(caseState?.assignedVerifier ?? '');
    setAssignS(caseState?.assignedSupervisor ?? '');
    setDeadline(caseState?.deadline ?? '');
    setRedact(caseState?.redactionNotes ?? '');
  }, [caseState]);

  const [accActionId, setAccActionId] = useState('');
  const [accResponse, setAccResponse] = useState('');
  const [accResolution, setAccResolution] = useState('');
  const [accNoAction, setAccNoAction] = useState('');

  const actions = useMemo(() => (Array.isArray(priorActions) ? priorActions : []) as PriorAction[], [priorActions]);

  const run = useCallback(
    async (fn: () => Promise<void>) => {
      if (useDemo) {
        setNotice('Demo mode — connect the Reviewer API to persist case workspace.');
        return;
      }
      setBusy(true);
      try {
        await fn();
        await onRefresh();
      } catch (e: unknown) {
        setNotice(e instanceof Error ? e.message : String(e));
      } finally {
        setBusy(false);
      }
    },
    [useDemo, onRefresh, setNotice],
  );

  const dispositions = meta?.dispositions?.length
    ? meta.dispositions
    : Object.keys(DISPOSITION_LABELS);

  return (
    <div
      style={{
        marginTop: '1rem',
        padding: '1rem',
        borderRadius: 'var(--radius-lg)',
        border: '1px solid rgba(212, 175, 55, 0.25)',
        background: 'linear-gradient(180deg, rgba(15, 23, 42, 0.9), rgba(15, 23, 42, 0.65))',
      }}
    >
      <div className="section-title" style={{ marginBottom: '0.35rem' }}>
        Case workspace — verification · action · accountability
      </div>
      <p className="text-muted" style={{ fontSize: '0.72rem', marginTop: 0, lineHeight: 1.5 }}>
        Intake lives in the main DPAL app. Here you verify, push outbound help, and record what was sent and what happened
        next. When <span className="mono">DPAL_UPSTREAM_URL</span> is set, disposition and reporter-facing lines sync to the
        main API (<span className="mono">PATCH /api/reports/:id/ops-status</span>). Email delivery uses Resend when configured
        on the Reviewer host.
      </p>

      {/* AI */}
      <div style={{ marginTop: '0.85rem' }}>
        <div className="section-title" style={{ fontSize: '0.78rem' }}>AI triage (recommended next action)</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginTop: '0.4rem' }}>
          <button
            type="button"
            className="btn btn-primary"
            style={{ fontSize: '0.72rem' }}
            disabled={busy}
            onClick={() =>
              void run(async () => {
                const r = await postAiTriage(reportId);
                setTriage(r.triage);
                setNotice('AI triage ready — review summary and drafts below.');
              })
            }
          >
            Run AI triage
          </button>
          <button
            type="button"
            className="btn"
            style={{ fontSize: '0.72rem' }}
            disabled={busy}
            onClick={() =>
              void run(async () => {
                const r = await postCallScript(reportId);
                setCallScript(r.script);
                setNotice('Call script generated.');
              })
            }
          >
            Generate call script
          </button>
        </div>
        {triage && (
          <div
            style={{
              marginTop: '0.65rem',
              padding: '0.65rem',
              borderRadius: '8px',
              border: '1px solid var(--graphite-border)',
              fontSize: '0.76rem',
              lineHeight: 1.5,
            }}
          >
            <div>
              <strong>Summary</strong> · {triage.summary}
            </div>
            <div style={{ marginTop: '0.35rem' }}>
              <strong>Urgency</strong> · {triage.urgency} · <strong>Credibility</strong> ·{' '}
              {triage.credibility_estimate ?? '—'}
            </div>
            <div style={{ marginTop: '0.35rem' }}>
              <strong>Destination</strong> · {triage.destination}
            </div>
            <div style={{ marginTop: '0.35rem' }}>
              <strong>Missing</strong> · {(triage.missing_info || []).join(', ') || '—'}
            </div>
            <div style={{ marginTop: '0.35rem' }}>
              <strong>Why</strong> · {triage.why_recommended}
            </div>
            <details style={{ marginTop: '0.5rem' }}>
              <summary style={{ cursor: 'pointer' }}>Draft email</summary>
              <pre
                style={{
                  whiteSpace: 'pre-wrap',
                  margin: '0.35rem 0 0',
                  fontSize: '0.7rem',
                  opacity: 0.95,
                }}
              >
                {triage.draft_email}
              </pre>
            </details>
          </div>
        )}
        {callScript && (
          <div style={{ marginTop: '0.5rem' }}>
            <div className="section-title" style={{ fontSize: '0.72rem' }}>Call script</div>
            <pre
              style={{
                whiteSpace: 'pre-wrap',
                fontSize: '0.72rem',
                padding: '0.5rem',
                borderRadius: '6px',
                border: '1px solid var(--graphite-border)',
                maxHeight: '200px',
                overflow: 'auto',
              }}
            >
              {callScript}
            </pre>
          </div>
        )}
      </div>

      {/* Disposition */}
      <div style={{ marginTop: '1rem' }}>
        <div className="section-title" style={{ fontSize: '0.78rem' }}>Report disposition</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem', marginTop: '0.4rem' }}>
          {dispositions.map((d) => (
            <button
              key={d}
              type="button"
              className={caseState?.disposition === d ? 'btn btn-primary' : 'btn'}
              style={{ fontSize: '0.68rem' }}
              disabled={busy}
              onClick={() =>
                void run(async () => {
                  await postDisposition(reportId, d as VerifierDisposition, '');
                  setNotice(`Disposition set: ${DISPOSITION_LABELS[d] || d}`);
                })
              }
            >
              {DISPOSITION_LABELS[d] || d}
            </button>
          ))}
        </div>
        <p className="text-muted" style={{ fontSize: '0.68rem', marginTop: '0.35rem' }}>
          Current: <span className="mono">{caseState?.disposition || '—'}</span>
          {caseState?.lastReviewedBy ? (
            <>
              {' '}
              · Last touch: {caseState.lastReviewedBy}
            </>
          ) : null}
        </p>
      </div>

      {/* Assignments */}
      <div style={{ marginTop: '1rem', display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '0.65rem' }}>
        <label style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', fontSize: '0.72rem' }}>
          Assign verifier
          <input
            value={assignV}
            onChange={(e) => setAssignV(e.target.value)}
            className="input-like"
            style={inputStyle}
          />
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', fontSize: '0.72rem' }}>
          Assign supervisor
          <input
            value={assignS}
            onChange={(e) => setAssignS(e.target.value)}
            className="input-like"
            style={inputStyle}
          />
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', fontSize: '0.72rem' }}>
          Deadline
          <input
            type="datetime-local"
            value={deadline?.slice(0, 16) || ''}
            onChange={(e) => setDeadline(e.target.value ? `${e.target.value}:00.000Z` : '')}
            style={inputStyle}
          />
        </label>
      </div>
      <label style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', fontSize: '0.72rem', marginTop: '0.65rem' }}>
        Redaction / sensitive info (internal)
        <textarea
          value={redact}
          onChange={(e) => setRedact(e.target.value)}
          rows={2}
          placeholder="What to withhold from outbound comms…"
          style={{ ...inputStyle, minHeight: '52px' }}
        />
      </label>
      <button
        type="button"
        className="btn btn-primary"
        style={{ fontSize: '0.72rem', marginTop: '0.5rem' }}
        disabled={busy}
        onClick={() =>
          void run(async () => {
            await patchVerifierCase(reportId, {
              assignedVerifier: assignV,
              assignedSupervisor: assignS,
              deadline: deadline || null,
              redactionNotes: redact,
            });
            setNotice('Case assignments & redaction notes saved.');
          })
        }
      >
        Save assignments & redaction
      </button>

      {/* Outbound */}
      <div style={{ marginTop: '1.1rem' }}>
        <div className="section-title" style={{ fontSize: '0.78rem' }}>Outside action</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginTop: '0.5rem' }}>
          <div style={{ border: '1px solid var(--graphite-border)', borderRadius: '8px', padding: '0.6rem' }}>
            <div style={{ fontSize: '0.72rem', fontWeight: 600 }}>Email city / agency</div>
            <input placeholder="to@agency.gov" value={emailTo} onChange={(e) => setEmailTo(e.target.value)} style={{ ...inputStyle, marginTop: '0.35rem' }} />
            <input placeholder="Subject" value={emailSubj} onChange={(e) => setEmailSubj(e.target.value)} style={{ ...inputStyle, marginTop: '0.35rem' }} />
            <textarea placeholder="Message" value={emailBody} onChange={(e) => setEmailBody(e.target.value)} rows={4} style={{ ...inputStyle, marginTop: '0.35rem' }} />
            <button
              type="button"
              className="btn btn-primary"
              style={{ fontSize: '0.7rem', marginTop: '0.35rem' }}
              disabled={busy}
              onClick={() =>
                void run(async () => {
                  if (!emailTo.trim()) {
                    setNotice('Enter a recipient email address.');
                    return;
                  }
                  const res = await postOutboundAction(reportId, 'email', {
                    destination_email: emailTo.trim(),
                    subject: emailSubj || `Report ${reportId}`,
                    message: emailBody,
                    html: `<p>${emailBody.replace(/</g, '&lt;')}</p>`,
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
                  } else {
                    const detail =
                      d?.errorSummary ||
                      d?.reason ||
                      (d?.error != null ? JSON.stringify(d.error) : 'no provider');
                    setNotice(`Not sent (${detail}). ${res.hint || 'Configure RESEND, SendGrid, or SMTP on the Reviewer API.'}`);
                  }
                })
              }
            >
              Send / log email
            </button>
          </div>
          <div style={{ border: '1px solid var(--graphite-border)', borderRadius: '8px', padding: '0.6rem' }}>
            <div style={{ fontSize: '0.72rem', fontWeight: 600 }}>Log phone call</div>
            <input placeholder="Number called" value={phoneNum} onChange={(e) => setPhoneNum(e.target.value)} style={{ ...inputStyle, marginTop: '0.35rem' }} />
            <textarea placeholder="Summary of call" value={phoneSummary} onChange={(e) => setPhoneSummary(e.target.value)} rows={3} style={{ ...inputStyle, marginTop: '0.35rem' }} />
            <button
              type="button"
              className="btn"
              style={{ fontSize: '0.7rem', marginTop: '0.35rem' }}
              disabled={busy}
              onClick={() =>
                void run(async () => {
                  await postPhoneLog(reportId, { summary: phoneSummary, called_number: phoneNum, reached_contact: true });
                  setNotice('Phone call logged.');
                })
              }
            >
              Log call
            </button>
          </div>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem', marginTop: '0.65rem' }}>
          {(
            [
              ['legal-referral', 'Legal referral'],
              ['nonprofit-referral', 'Nonprofit referral'],
              ['escalate-emergency', 'Emergency escalation'],
              ['internal-followup', 'Internal follow-up'],
              ['notify-reporter', 'Notify reporter'],
            ] as const
          ).map(([kind, label]) => (
            <button
              key={kind}
              type="button"
              className="btn"
              style={{ fontSize: '0.68rem' }}
              disabled={busy}
              onClick={() =>
                void run(async () => {
                  const msg = window.prompt(`${label} — short summary?`) || '';
                  if (kind === 'notify-reporter') {
                    await postOutboundAction(reportId, 'notify-reporter', {
                      message: msg,
                      reporter_email: notifyEmail || undefined,
                      public_line: msg.slice(0, 400),
                    });
                  } else {
                    await postOutboundAction(reportId, kind, { message: msg, summary: msg });
                  }
                  setNotice(`${label} logged.`);
                })
              }
            >
              {label}
            </button>
          ))}
        </div>
        <div style={{ marginTop: '0.65rem', fontSize: '0.72rem' }}>
          <label>
            Reporter email (for notify)
            <input value={notifyEmail} onChange={(e) => setNotifyEmail(e.target.value)} style={{ ...inputStyle, marginLeft: '0.35rem', width: 'min(100%, 240px)' }} />
          </label>
        </div>
      </div>

      {/* Accountability */}
      <div style={{ marginTop: '1.1rem' }}>
        <div className="section-title" style={{ fontSize: '0.78rem' }}>Accountability — record responses</div>
        <p className="text-muted" style={{ fontSize: '0.68rem' }}>
          Pick an action id from the table, then record agency response, resolution, or why nothing happened.
        </p>
        <div style={{ overflowX: 'auto' }}>
          <table className="table-lite" style={{ fontSize: '0.68rem', minWidth: '520px' }}>
            <thead>
              <tr>
                <th>ID</th>
                <th>Type</th>
                <th>When</th>
                <th>Summary</th>
              </tr>
            </thead>
            <tbody>
              {actions.length === 0 ? (
                <tr>
                  <td colSpan={4} className="text-muted">
                    No actions yet.
                  </td>
                </tr>
              ) : (
                actions.map((a) => (
                  <tr key={a.id}>
                    <td className="mono">{a.id?.slice(0, 12)}…</td>
                    <td>{a.actionType || a.label}</td>
                    <td>{a.at ? new Date(a.at).toLocaleString() : '—'}</td>
                    <td>{(a.summary || '').slice(0, 80)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', marginTop: '0.5rem' }}>
          <input
            placeholder="Action id (full id from audit)"
            value={accActionId}
            onChange={(e) => setAccActionId(e.target.value)}
            style={inputStyle}
          />
        </div>
        <textarea placeholder="Response received (agency)" value={accResponse} onChange={(e) => setAccResponse(e.target.value)} rows={2} style={{ ...inputStyle, marginTop: '0.35rem' }} />
        <textarea placeholder="Resolution" value={accResolution} onChange={(e) => setAccResolution(e.target.value)} rows={2} style={{ ...inputStyle, marginTop: '0.35rem' }} />
        <textarea placeholder="Why no action (if applicable)" value={accNoAction} onChange={(e) => setAccNoAction(e.target.value)} rows={2} style={{ ...inputStyle, marginTop: '0.35rem' }} />
        <button
          type="button"
          className="btn btn-primary"
          style={{ fontSize: '0.7rem', marginTop: '0.35rem' }}
          disabled={busy || !accActionId.trim()}
          onClick={() =>
            void run(async () => {
              await postAccountability(reportId, accActionId.trim(), {
                response_summary: accResponse,
                resolution: accResolution,
                no_action_reason: accNoAction,
              });
              setNotice('Accountability updated.');
            })
          }
        >
          Save accountability for action
        </button>
      </div>

      {/* Close */}
      <div style={{ marginTop: '1rem', paddingTop: '0.75rem', borderTop: '1px solid var(--graphite-border)' }}>
        <div className="section-title" style={{ fontSize: '0.78rem' }}>Close case</div>
        <textarea
          placeholder="Why closed / no further action (recorded in audit + timeline)"
          value={closeReason}
          onChange={(e) => setCloseReason(e.target.value)}
          rows={2}
          style={{ ...inputStyle, marginTop: '0.35rem' }}
        />
        <button
          type="button"
          className="btn"
          style={{ fontSize: '0.72rem', marginTop: '0.35rem', borderColor: 'rgba(248,113,113,0.5)' }}
          disabled={busy}
          onClick={() =>
            void run(async () => {
              await postCloseCase(reportId, closeReason || 'Closed from verifier workspace.');
              setNotice('Case closed and upstream notified when configured.');
            })
          }
        >
          Close with reason
        </button>
      </div>
    </div>
  );
}

const inputStyle: CSSProperties = {
  width: '100%',
  padding: '0.4rem 0.5rem',
  background: 'var(--bg-deep)',
  border: '1px solid var(--graphite-border)',
  borderRadius: '6px',
  color: 'var(--silver)',
  fontFamily: 'inherit',
  fontSize: '0.78rem',
};
