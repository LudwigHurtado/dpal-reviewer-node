/**
 * Sync human-readable status lines to main DPAL API (PATCH ops-status) so reporters / main app see movement.
 */

export async function patchUpstreamOpsStatus(reportId, status, note) {
  const base = process.env.DPAL_UPSTREAM_URL?.replace(/\/$/, '');
  if (!base) {
    return { ok: false, skipped: true, reason: 'DPAL_UPSTREAM_URL not set' };
  }
  const id = encodeURIComponent(String(reportId || '').trim());
  if (!id) return { ok: false, skipped: true, reason: 'missing_id' };

  const headers = { Accept: 'application/json', 'Content-Type': 'application/json' };
  const auth = process.env.DPAL_UPSTREAM_AUTH_HEADER;
  if (auth) headers.Authorization = auth;

  const body = {
    status: String(status || 'Investigating'),
    note: String(note || '').slice(0, 800),
  };

  try {
    const res = await fetch(`${base}/api/reports/${id}/ops-status`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify(body),
    });
    const text = await res.text();
    let json;
    try {
      json = JSON.parse(text);
    } catch {
      json = { raw: text.slice(0, 200) };
    }
    if (!res.ok) {
      return { ok: false, httpStatus: res.status, upstream: json };
    }
    return { ok: true, upstream: json };
  } catch (e) {
    return { ok: false, error: String(e?.message || e) };
  }
}

/** Map internal disposition → opsStatus for dpal-ai-server normalizeOpsStatus */
export function opsStatusForDisposition(disposition) {
  const d = String(disposition || '').toLowerCase();
  if (d === 'verified' || d === 'action_taken') return 'Action Taken';
  if (d === 'false_unsupported' || d === 'duplicate' || d === 'closed_no_action') return 'Resolved';
  if (d === 'urgent' || d === 'escalated') return 'Investigating';
  if (d === 'needs_more_evidence' || d === 'follow_up_requested') return 'Investigating';
  return 'Investigating';
}

export function reporterLineForDisposition(disposition, extra = '') {
  const lines = {
    under_review: 'Your report is being reviewed for action.',
    verified: 'A verifier confirmed your filing. We are moving to next steps.',
    needs_more_evidence: 'We need more information to act on your report. Please check for a follow-up request.',
    urgent: 'Your report was marked urgent and is being prioritized.',
    duplicate: 'This report was linked to an existing case.',
    false_unsupported: 'This report could not be substantiated with available evidence.',
    closed_no_action: 'This case was closed with no further action recorded.',
    escalated: 'Your report was escalated for emergency or supervisory review.',
    action_taken: 'Action was taken on your report.',
    follow_up_requested: 'A follow-up was requested. Please watch for contact or next steps.',
  };
  const base = lines[String(disposition)] || lines.under_review;
  return extra ? `${base} ${extra}`.trim() : base;
}
