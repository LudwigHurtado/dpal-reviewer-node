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

/**
 * Turn relative API paths (/api/assets/…) into absolute URLs so the Validator UI (different origin) can load images.
 * Blob URLs cannot be resolved cross-origin and are returned as-is (usually unusable in another app).
 */
export function resolveUpstreamAssetUrl(url) {
  const u = String(url || '').trim();
  if (!u || u.startsWith('blob:')) return u;
  if (/^https?:\/\//i.test(u)) return u;
  const base = process.env.DPAL_UPSTREAM_URL?.replace(/\/$/, '');
  if (!base) return u;
  if (u.startsWith('//')) return `https:${u}`;
  if (u.startsWith('/')) return `${base}${u}`;
  return `${base}/${u}`;
}

/** Collect every image URL string stored by the main DPAL app (payload + top-level + filing history). */
export function collectImageUrlStringsFromReportShape(rawDoc) {
  const out = [];
  const push = (v) => {
    if (typeof v === 'string' && v.trim()) out.push(v.trim());
  };
  const doc = rawDoc && typeof rawDoc === 'object' ? rawDoc : {};
  const p = doc.payload && typeof doc.payload === 'object' ? doc.payload : {};
  if (Array.isArray(doc.imageUrls)) doc.imageUrls.forEach(push);
  if (Array.isArray(p.imageUrls)) p.imageUrls.forEach(push);
  if (Array.isArray(doc.filingImageHistory)) doc.filingImageHistory.forEach(push);
  if (Array.isArray(p.filingImageHistory)) p.filingImageHistory.forEach(push);
  return [...new Set(out)];
}

function payloadObj(r) {
  return r?.payload && typeof r.payload === 'object' ? r.payload : {};
}

/** Prefer top-level fields, then Mongo-style `payload`, then `_id` (ObjectId or string). */
export function mapUpstreamReport(r) {
  const p = payloadObj(r);
  let id = pickStr(r, ['id', 'report_id', 'reportId', 'uuid', 'public_id'], '');
  if (!id && r?._id != null) id = String(r._id);
  if (!id) id = pickStr(p, ['id', 'reportId'], '');
  const title =
    pickStr(r, ['title', 'subject', 'name', 'headline'], '') ||
    pickStr(p, ['title', 'subject', 'name', 'headline'], 'Untitled report');
  const summary =
    pickStr(r, ['summary', 'description', 'body', 'details'], '') ||
    pickStr(p, ['summary', 'description', 'body', 'details'], '');
  const category =
    pickStr(r, ['category', 'type', 'topic', 'sector'], '') ||
    pickStr(p, ['category', 'type', 'topic', 'sector'], 'General');
  const stage =
    pickStr(r, ['stage', 'status', 'review_stage', 'lifecycleState'], '') ||
    pickStr(p, ['stage', 'lifecycleState'], 'Triage');
  const assignee = pickStr(r, ['assignee', 'assigned_to', 'reviewer'], 'Unassigned');
  const sla = pickStr(r, ['sla', 'sla_window'], '—');
  let conf = pickNum(r, ['confidence', 'score', 'confidence_pct'], NaN);
  if (!Number.isFinite(conf)) conf = pickNum(p, ['confidence', 'score'], 50);
  const confidence = Math.min(100, Math.max(0, conf));
  const submittedAt =
    pickStr(r, ['submittedAt', 'submitted_at', 'created_at', 'createdAt', 'updatedAt', 'timestamp'], '') ||
    pickStr(p, ['submittedAt', 'createdAt', 'timestamp'], '');
  const location =
    pickStr(r, ['location', 'region', 'city'], '') ||
    pickStr(p, ['location', 'city', 'region'], '');
  const publicUrlRaw =
    pickStr(r, ['publicUrl', 'url', 'link', 'public_url', 'web_url'], '') ||
    pickStr(p, ['publicUrl', 'url'], '');

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
  const body = await res.json();
  if (body && typeof body === 'object' && body.report && typeof body.report === 'object') return body.report;
  if (body && typeof body === 'object' && body.data && typeof body.data === 'object') return body.data;
  return body;
}
