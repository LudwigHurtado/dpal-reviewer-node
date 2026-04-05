/**
 * Optional merge of reports from the main DPAL API. Set env:
 *   DPAL_UPSTREAM_URL=https://your-main-api.example
 *   DPAL_UPSTREAM_REPORTS_PATH=/api/v1/reports   (default)
 *   DPAL_UPSTREAM_AUTH_HEADER=Bearer ...         (optional)
 *
 * Expected JSON shapes supported:
 *   { "reports": [...] } | { "data": [...] } | [ ... ]
 * Each item: { id, title?, summary?, category?, sla?, confidence?, assignee?, stage?, submittedAt? }
 *   or aliases: report_id, subject, description, type, status
 */

function pickStr(obj, keys, fallback = '') {
  for (const k of keys) {
    if (obj[k] != null && String(obj[k]).trim() !== '') return String(obj[k]);
  }
  return fallback;
}

/** True when path targets dpal-ai-server style feed. */
function isFeedPath(path) {
  return String(path || '').includes('/feed');
}

function pickNum(obj, keys, fallback = 0) {
  for (const k of keys) {
    const v = obj[k];
    if (typeof v === 'number' && !Number.isNaN(v)) return v;
    if (typeof v === 'string' && v.trim() !== '') {
      const n = Number(v);
      if (!Number.isNaN(n)) return n;
    }
  }
  return fallback;
}

/** Build public DPAL web URL for a report id (uses `DPAL_PUBLIC_REPORT_BASE` on the API server). */
export function buildPublicReportUrl(reportId) {
  const id = String(reportId || '').trim();
  if (!id) return undefined;
  const base = process.env.DPAL_PUBLIC_REPORT_BASE?.replace(/\/$/, '');
  if (!base) return undefined;
  const hasQuery = base.includes('?');
  return `${base}${hasQuery ? '&' : '?'}reportId=${encodeURIComponent(id)}`;
}

export function mapUpstreamReport(r) {
  const id = pickStr(r, ['id', 'report_id', 'reportId', 'uuid', 'public_id'], '');
  const title = pickStr(r, ['title', 'subject', 'name', 'headline'], 'Untitled report');
  const summary = pickStr(r, ['summary', 'description', 'body', 'details'], '');
  const category = pickStr(r, ['category', 'type', 'topic', 'sector'], 'General');
  const stage = pickStr(r, ['stage', 'status', 'review_stage', 'lifecycleState'], 'Triage');
  const assignee = pickStr(r, ['assignee', 'assigned_to', 'reviewer'], 'Unassigned');
  const sla = pickStr(r, ['sla', 'sla_window'], '—');
  const confidence = Math.min(100, Math.max(0, pickNum(r, ['confidence', 'score', 'confidence_pct'], 50)));
  const submittedAt = pickStr(r, ['submittedAt', 'submitted_at', 'created_at', 'createdAt', 'updatedAt', 'timestamp'], '');
  const location = pickStr(r, ['location', 'region', 'city'], '');
  const publicUrlRaw = pickStr(r, ['publicUrl', 'url', 'link', 'public_url', 'web_url'], '');

  const resolvedId = id || `RPT-${Date.now()}`;
  const publicUrl = publicUrlRaw || buildPublicReportUrl(resolvedId);

  return {
    id: resolvedId,
    title,
    summary,
    category,
    sla: sla || '—',
    confidence,
    assignee,
    stage,
    ...(submittedAt ? { submittedAt } : {}),
    ...(location ? { location } : {}),
    ...(publicUrl ? { publicUrl } : {}),
  };
}

export async function fetchUpstreamReports() {
  const base = process.env.DPAL_UPSTREAM_URL?.replace(/\/$/, '');
  if (!base) return null;

  let path = process.env.DPAL_UPSTREAM_REPORTS_PATH || '/api/reports/feed';
  if (!path.startsWith('/')) path = `/${path}`;

  let url = `${base}${path}`;
  if (isFeedPath(path) && !/[?&]limit=/.test(url)) {
    url += url.includes('?') ? '&' : '?';
    url += `limit=${encodeURIComponent(process.env.DPAL_UPSTREAM_REPORTS_LIMIT || '120')}`;
  }

  const headers = { Accept: 'application/json' };
  const auth = process.env.DPAL_UPSTREAM_AUTH_HEADER;
  if (auth) headers.Authorization = auth;

  const res = await fetch(url, { headers });
  if (!res.ok) {
    console.warn(`[reviewer-api] upstream ${res.status} ${res.statusText} for ${url}`);
    return null;
  }

  const raw = await res.json();
  let list = [];
  if (Array.isArray(raw)) list = raw;
  else if (raw?.ok === true && Array.isArray(raw.items)) list = raw.items;
  else if (Array.isArray(raw.reports)) list = raw.reports;
  else if (Array.isArray(raw.data)) list = raw.data;
  else if (Array.isArray(raw.items)) list = raw.items;
  else {
    console.warn('[reviewer-api] upstream JSON has no recognizable report array');
    return null;
  }

  return list.map(mapUpstreamReport);
}

/** Raw feed items (before mapUpstreamReport) for verifier evidence counts etc. */
export async function fetchUpstreamFeedRawList() {
  const base = process.env.DPAL_UPSTREAM_URL?.replace(/\/$/, '');
  if (!base) return null;

  let path = process.env.DPAL_UPSTREAM_REPORTS_PATH || '/api/reports/feed';
  if (!path.startsWith('/')) path = `/${path}`;

  let url = `${base}${path}`;
  if (isFeedPath(path) && !/[?&]limit=/.test(url)) {
    url += url.includes('?') ? '&' : '?';
    url += `limit=${encodeURIComponent(process.env.DPAL_UPSTREAM_REPORTS_LIMIT || '120')}`;
  }

  const headers = { Accept: 'application/json' };
  const auth = process.env.DPAL_UPSTREAM_AUTH_HEADER;
  if (auth) headers.Authorization = auth;

  const res = await fetch(url, { headers });
  if (!res.ok) return null;

  const raw = await res.json();
  let list = [];
  if (Array.isArray(raw)) list = raw;
  else if (raw?.ok === true && Array.isArray(raw.items)) list = raw.items;
  else if (Array.isArray(raw.reports)) list = raw.reports;
  else if (Array.isArray(raw.data)) list = raw.data;
  else if (Array.isArray(raw.items)) list = raw.items;
  else return null;

  return list;
}

/**
 * Full report document from main API (Mongo anchor). Enables verifier detail panel.
 */
export async function fetchUpstreamReportById(reportId) {
  const base = process.env.DPAL_UPSTREAM_URL?.replace(/\/$/, '');
  if (!base) return null;
  const id = encodeURIComponent(String(reportId || '').trim());
  if (!id) return null;
  const headers = { Accept: 'application/json' };
  const auth = process.env.DPAL_UPSTREAM_AUTH_HEADER;
  if (auth) headers.Authorization = auth;
  const res = await fetch(`${base}/api/reports/${id}`, { headers });
  if (!res.ok) return null;
  return res.json();
}
