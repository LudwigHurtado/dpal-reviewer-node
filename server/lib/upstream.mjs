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
 * Turn relative API paths (/api/assets/…, /uploads/…) into absolute URLs so the Validator UI (different origin) can load images.
 * Re-roots absolute URLs that point at the wrong host (localhost, old deploy, Vercel) when the path is clearly main-API media.
 * Blob URLs cannot be resolved cross-origin and are returned as-is (usually unusable in another app).
 */
export function resolveUpstreamAssetUrl(url) {
  let u = String(url || '').trim();
  if (!u || u.startsWith('blob:')) return u;
  if (u.startsWith('data:')) return u;

  u = u.replace(/\/v1\/assets\//g, '/api/assets/');

  const base = process.env.DPAL_UPSTREAM_URL?.replace(/\/$/, '') || '';

  if (/^https?:\/\//i.test(u)) {
    if (!base) return u;
    let parsed;
    try {
      parsed = new URL(u);
    } catch {
      return u;
    }
    const path = parsed.pathname + parsed.search + parsed.hash;
    const host = parsed.hostname.toLowerCase();
    const isMainApiMedia = path.startsWith('/uploads') || path.startsWith('/api/assets');
    let upstreamHost = '';
    try {
      upstreamHost = new URL(base).hostname.toLowerCase();
    } catch {
      return u;
    }
    const legacyOrLocalHost =
      host === 'localhost' ||
      host === '127.0.0.1' ||
      host === 'api.dpal.net' ||
      host.endsWith('.vercel.app');
    /** Same path on a different Railway deploy (URL in DB predates current DPAL_UPSTREAM_URL). */
    const staleRailway = host.endsWith('.up.railway.app') && host !== upstreamHost;
    if (isMainApiMedia && (legacyOrLocalHost || staleRailway)) {
      return `${base}${path.startsWith('/') ? path : `/${path}`}`;
    }
    return u;
  }

  if (u.startsWith('//')) return `https:${u}`;
  if (!base) return u;
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

/**
 * Verifier feed: raw list + status so the UI can distinguish
 * "not configured" vs "HTTP error" vs "empty feed" vs "ok".
 */
export async function fetchUpstreamVerifierFeedResult() {
  const base = process.env.DPAL_UPSTREAM_URL?.replace(/\/$/, '');
  if (!base) {
    return {
      source: 'unconfigured',
      rawList: null,
      message:
        'DPAL_UPSTREAM_URL is not set on the Reviewer API process. Add it to .env / .env.local (or Railway env) and restart the API.',
    };
  }

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

  let res;
  try {
    res = await fetch(url, { headers });
  } catch (e) {
    return {
      source: 'upstream_error',
      rawList: null,
      message: `Network error calling upstream feed: ${String(e?.message || e)}`,
      debug: { feedUrl: url },
    };
  }

  if (!res.ok) {
    return {
      source: 'upstream_error',
      rawList: null,
      message: `Upstream returned ${res.status} ${res.statusText}. Check DPAL_UPSTREAM_URL and that the main API exposes GET ${path || '/api/reports/feed'}.`,
      debug: { feedUrl: url, httpStatus: res.status },
    };
  }

  let raw;
  try {
    raw = await res.json();
  } catch (e) {
    return {
      source: 'upstream_error',
      rawList: null,
      message: 'Upstream response was not valid JSON.',
      debug: { feedUrl: url },
    };
  }

  let list = [];
  if (Array.isArray(raw)) list = raw;
  else if (raw?.ok === true && Array.isArray(raw.items)) list = raw.items;
  else if (Array.isArray(raw.reports)) list = raw.reports;
  else if (Array.isArray(raw.data)) list = raw.data;
  else if (Array.isArray(raw.items)) list = raw.items;
  else {
    return {
      source: 'upstream_error',
      rawList: null,
      message:
        'Feed JSON did not contain a recognizable array (reports, items, or data). See server/lib/upstream.mjs for supported shapes.',
      debug: { feedUrl: url },
    };
  }

  if (list.length === 0) {
    return {
      source: 'upstream_empty',
      rawList: [],
      message:
        'Connected to upstream successfully, but the feed returned zero reports. POST filings to your main API, then refresh.',
      debug: { feedUrl: url },
    };
  }

  return { source: 'upstream', rawList: list, message: undefined, debug: { feedUrl: url } };
}

/** Raw feed items (before mapUpstreamReport) for verifier evidence counts etc. */
export async function fetchUpstreamFeedRawList() {
  const r = await fetchUpstreamVerifierFeedResult();
  if (r.source !== 'upstream' && r.source !== 'upstream_empty') return null;
  return r.rawList;
}

/**
 * Situation-room chat for a report (same contract as dpal-front-end situationService).
 * GET {DPAL_UPSTREAM_URL}/api/situation/:roomId/messages?limit=200
 */
export async function fetchUpstreamSituationMessages(roomId) {
  const base = process.env.DPAL_UPSTREAM_URL?.replace(/\/$/, '');
  if (!base || roomId == null || String(roomId).trim() === '') return [];

  const headers = { Accept: 'application/json' };
  const auth = process.env.DPAL_UPSTREAM_AUTH_HEADER;
  if (auth) headers.Authorization = auth;

  const raw = String(roomId).trim();
  const variants = [...new Set([raw, raw.replace(/^REP-/i, 'rep-'), raw.replace(/^rep-/i, 'REP-')])];

  for (const rid of variants) {
    if (!rid) continue;
    try {
      const enc = encodeURIComponent(rid);
      const res = await fetch(`${base}/api/situation/${enc}/messages?limit=200`, { headers });
      if (!res.ok) continue;
      const data = await res.json();
      const list = Array.isArray(data?.messages) ? data.messages : [];
      return list.map((m) => ({
        id: String(m?.id || m?._id || `m-${Math.random().toString(36).slice(2, 9)}`),
        sender: String(m?.sender || 'OPERATIVE'),
        text: String(m?.text || ''),
        timestamp: Number(m?.timestamp || 0) || Date.now(),
        isSystem: Boolean(m?.isSystem),
        imageUrl: m?.imageUrl ? resolveUpstreamAssetUrl(String(m.imageUrl)) : undefined,
        audioUrl: m?.audioUrl ? String(m.audioUrl) : undefined,
      }));
    } catch {
      /* try next variant */
    }
  }
  return [];
}

/**
 * Join upstream origin + `/api/reports/...` without producing `/api/api/...` when the origin
 * already ends with `/api` (common when DPAL_UPSTREAM_URL is set to the API root).
 */
export function buildUpstreamReportDetailUrl(baseRaw, encodedReportId) {
  const base = String(baseRaw || '').replace(/\/$/, '');
  const suffix = `/api/reports/${encodedReportId}`;
  if (!base) return { upstreamUrl: '', pathForLog: suffix };
  if (base.endsWith('/api') && suffix.startsWith('/api/')) {
    const rest = suffix.slice('/api'.length);
    return { upstreamUrl: `${base}${rest}`, pathForLog: rest };
  }
  return { upstreamUrl: `${base}${suffix}`, pathForLog: suffix };
}

function parseReportJsonBody(body) {
  if (body && typeof body === 'object' && body.report && typeof body.report === 'object') return body.report;
  if (body && typeof body === 'object' && body.data && typeof body.data === 'object') return body.data;
  if (body && typeof body === 'object') return body;
  return null;
}

/** Same path join as detail: avoid `/api/api/...` when base ends with `/api`. */
function joinUpstreamBaseAndPath(baseRaw, path) {
  const base = String(baseRaw || '').replace(/\/$/, '');
  let p = path.startsWith('/') ? path : `/${path}`;
  if (base.endsWith('/api') && p.startsWith('/api/')) {
    p = p.slice('/api'.length);
  }
  return `${base}${p}`;
}

/**
 * Upstream reports feed URL (same contract as fetchUpstreamReports / verifier feed).
 * @returns {{ feedUrl: string, pathForLog: string }}
 */
function buildUpstreamFeedFetchUrl(baseRaw) {
  const base = String(baseRaw || '').replace(/\/$/, '');
  let path = process.env.DPAL_UPSTREAM_REPORTS_PATH || '/api/reports/feed';
  if (!path.startsWith('/')) path = `/${path}`;

  let feedUrl = joinUpstreamBaseAndPath(base, path);
  if (isFeedPath(path) && !/[?&]limit=/.test(feedUrl)) {
    feedUrl += feedUrl.includes('?') ? '&' : '?';
    feedUrl += `limit=${encodeURIComponent(process.env.DPAL_UPSTREAM_REPORTS_LIMIT || '120')}`;
  }
  return { feedUrl, pathForLog: path };
}

/** Detail 404 fallback: always request enough rows to find the id (task: limit=120). */
function buildUpstreamFeedFallbackFetchUrl(baseRaw) {
  const { feedUrl: initial, pathForLog } = buildUpstreamFeedFetchUrl(baseRaw);
  try {
    const u = new URL(initial);
    u.searchParams.set('limit', '120');
    return { feedUrl: u.toString(), pathForLog };
  } catch {
    const sep = initial.includes('?') ? '&' : '?';
    return { feedUrl: `${initial}${sep}limit=120`, pathForLog };
  }
}

function parseUpstreamFeedJsonToList(raw) {
  if (Array.isArray(raw)) return raw;
  if (raw?.ok === true && Array.isArray(raw.items)) return raw.items;
  if (Array.isArray(raw?.reports)) return raw.reports;
  if (Array.isArray(raw?.data)) return raw.data;
  if (Array.isArray(raw?.items)) return raw.items;
  return null;
}

function stringIdFromField(v) {
  if (v == null) return '';
  if (typeof v === 'object' && v.$oid != null) return String(v.$oid).trim();
  const s = String(v).trim();
  if (!s || s === '[object Object]') return '';
  return s;
}

/** Collect id-like fields from a feed row (top-level + common payload nesting). */
function feedItemIdStrings(item) {
  if (!item || typeof item !== 'object') return [];
  const keys = ['id', 'reportId', 'report_id', 'uuid', 'public_id', '_id'];
  const out = [];
  for (const k of keys) {
    const s = stringIdFromField(item[k]);
    if (s) out.push(s);
  }
  const p = item.payload;
  if (p && typeof p === 'object') {
    for (const k of ['id', 'reportId', 'report_id', 'uuid', 'public_id']) {
      const s = stringIdFromField(p[k]);
      if (s) out.push(s);
    }
  }
  return [...new Set(out)];
}

function feedItemMatchesReportId(item, rawId) {
  const want = String(rawId || '').trim();
  if (!want) return false;
  return feedItemIdStrings(item).some((id) => id === want);
}

function findFeedItemByReportId(list, rawId) {
  if (!Array.isArray(list)) return null;
  for (const item of list) {
    if (feedItemMatchesReportId(item, rawId)) return item;
  }
  return null;
}

/**
 * Fallback detail document from a feed row (GET /api/reports/:id returned 404).
 * Same field contract as task spec; fills from nested `payload` when top-level is absent.
 */
function normalizeFeedItemToVerifierReport(matched, reportId) {
  const rid = String(reportId || '').trim();
  const idVal =
    stringIdFromField(matched.reportId) ||
    stringIdFromField(matched.id) ||
    stringIdFromField(matched._id) ||
    rid;
  const p = matched.payload && typeof matched.payload === 'object' ? matched.payload : {};
  const title = matched.title ?? p.title;
  const description = matched.description ?? p.description;
  const category = matched.category ?? p.category;
  const location = matched.location || matched.city || p.location || p.city || '';
  const severity = matched.severity ?? p.severity;
  const opsStatus = matched.opsStatus ?? p.opsStatus;

  return {
    id: idVal,
    reportId: idVal,
    title,
    description,
    category,
    severity,
    opsStatus,
    createdAt: matched.createdAt,
    updatedAt: matched.updatedAt,
    channel: matched.channel,
    payload: {
      title,
      description,
      category,
      location,
      severity,
      opsStatus,
      source: 'upstream_feed_fallback',
    },
  };
}

/**
 * Full report document from main API (Mongo anchor). Structured result for verifier + logging.
 * @returns {Promise<object>}
 */
export async function fetchUpstreamReportById(reportId) {
  const rawId = String(reportId ?? '').trim();
  const upstreamConfigured = Boolean(process.env.DPAL_UPSTREAM_URL?.trim());

  console.log('[reviewer-upstream] fetchUpstreamReportById', {
    reportId: rawId || '(empty)',
    upstreamUrlEnvSet: upstreamConfigured,
  });

  if (!upstreamConfigured) {
    return {
      ok: false,
      error: 'upstream_not_configured',
      upstreamConfigured: false,
    };
  }

  const base = process.env.DPAL_UPSTREAM_URL.trim().replace(/\/$/, '');
  if (!rawId) {
    console.log('[reviewer-upstream] fetchUpstreamReportById: empty report id after trim');
    return {
      ok: false,
      error: 'upstream_error',
      upstreamConfigured: true,
      message: 'Missing report id.',
    };
  }

  const encodedId = encodeURIComponent(rawId);
  const { upstreamUrl, pathForLog } = buildUpstreamReportDetailUrl(base, encodedId);

  const headers = { Accept: 'application/json' };
  const auth = process.env.DPAL_UPSTREAM_AUTH_HEADER;
  if (auth) headers.Authorization = auth;

  let res;
  try {
    res = await fetch(upstreamUrl, { headers });
  } catch (e) {
    const message = String(e?.message || e);
    console.log('[reviewer-upstream] fetchUpstreamReportById: network error', {
      reportId: rawId,
      upstreamPath: pathForLog,
      message,
    });
    return {
      ok: false,
      error: 'upstream_network_error',
      upstreamConfigured: true,
      upstreamUrl,
      message,
    };
  }

  const upstreamStatus = res.status;
  console.log('[reviewer-upstream] fetchUpstreamReportById: upstream response', {
    reportId: rawId,
    upstreamPath: pathForLog,
    upstreamStatus,
  });

  if (upstreamStatus === 404) {
    console.log('[reviewer-upstream] fetchUpstreamReportById: detail endpoint returned 404', {
      reportId: rawId,
      upstreamPath: pathForLog,
    });

    const { feedUrl, pathForLog: feedPathLog } = buildUpstreamFeedFallbackFetchUrl(base);
    console.log('[reviewer-upstream] fetchUpstreamReportById: feed fallback URL called', {
      reportId: rawId,
      feedPath: feedPathLog,
      feedUrl,
    });

    let feedRes;
    try {
      feedRes = await fetch(feedUrl, { headers });
    } catch (e) {
      console.log('[reviewer-upstream] fetchUpstreamReportById: feed fallback network error', {
        reportId: rawId,
        message: String(e?.message || e),
      });
      return {
        ok: false,
        error: 'report_not_found',
        upstreamConfigured: true,
        upstreamStatus: 404,
        upstreamUrl,
        feedUrl,
        message: 'Detail endpoint returned 404 and feed fallback did not contain the report.',
      };
    }

    if (!feedRes.ok) {
      console.log('[reviewer-upstream] fetchUpstreamReportById: feed fallback HTTP error', {
        reportId: rawId,
        feedStatus: feedRes.status,
      });
      return {
        ok: false,
        error: 'report_not_found',
        upstreamConfigured: true,
        upstreamStatus: 404,
        upstreamUrl,
        feedUrl,
        message: 'Detail endpoint returned 404 and feed fallback did not contain the report.',
      };
    }

    let feedRaw;
    try {
      feedRaw = await feedRes.json();
    } catch (e) {
      console.log('[reviewer-upstream] fetchUpstreamReportById: feed fallback not JSON', { reportId: rawId });
      return {
        ok: false,
        error: 'report_not_found',
        upstreamConfigured: true,
        upstreamStatus: 404,
        upstreamUrl,
        feedUrl,
        message: 'Detail endpoint returned 404 and feed fallback did not contain the report.',
      };
    }

    const feedList = parseUpstreamFeedJsonToList(feedRaw);
    if (!feedList) {
      console.log('[reviewer-upstream] fetchUpstreamReportById: feed fallback unrecognized shape', {
        reportId: rawId,
      });
      return {
        ok: false,
        error: 'report_not_found',
        upstreamConfigured: true,
        upstreamStatus: 404,
        upstreamUrl,
        feedUrl,
        message: 'Detail endpoint returned 404 and feed fallback did not contain the report.',
      };
    }

    const matched = findFeedItemByReportId(feedList, rawId);
    if (!matched) {
      console.log('[reviewer-upstream] fetchUpstreamReportById: feed fallback no matching item', {
        reportId: rawId,
        feedItemCount: feedList.length,
      });
      return {
        ok: false,
        error: 'report_not_found',
        upstreamConfigured: true,
        upstreamStatus: 404,
        upstreamUrl,
        feedUrl,
        message: 'Detail endpoint returned 404 and feed fallback did not contain the report.',
      };
    }

    const normalizedReport = normalizeFeedItemToVerifierReport(matched, rawId);
    console.log('[reviewer-upstream] fetchUpstreamReportById: feed fallback match found', {
      reportId: rawId,
      resolvedId: normalizedReport.id,
    });

    return {
      ok: true,
      report: normalizedReport,
      upstreamConfigured: true,
      upstreamStatus: 200,
      upstreamUrl,
      fallback: 'feed',
      feedUrl,
    };
  }

  if (!res.ok) {
    let detail = res.statusText || `HTTP ${upstreamStatus}`;
    try {
      const t = await res.text();
      if (t && t.length < 400) detail = `${detail}: ${t}`;
    } catch {
      /* ignore */
    }
    console.log('[reviewer-upstream] fetchUpstreamReportById: upstream error', {
      reportId: rawId,
      upstreamStatus,
      found: false,
    });
    return {
      ok: false,
      error: 'upstream_error',
      upstreamConfigured: true,
      upstreamStatus,
      upstreamUrl,
      message: detail,
    };
  }

  let body;
  try {
    body = await res.json();
  } catch (e) {
    const message = `Upstream response was not valid JSON: ${String(e?.message || e)}`;
    console.log('[reviewer-upstream] fetchUpstreamReportById: JSON parse failed', { reportId: rawId, upstreamStatus });
    return {
      ok: false,
      error: 'upstream_error',
      upstreamConfigured: true,
      upstreamStatus,
      upstreamUrl,
      message,
    };
  }

  const report = parseReportJsonBody(body);
  const found = Boolean(report && typeof report === 'object');
  console.log('[reviewer-upstream] fetchUpstreamReportById: parsed body', {
    reportId: rawId,
    upstreamStatus,
    reportFound: found,
  });

  if (!found) {
    return {
      ok: false,
      error: 'upstream_error',
      upstreamConfigured: true,
      upstreamStatus,
      upstreamUrl,
      message: 'Upstream returned JSON that did not contain a usable report object.',
    };
  }

  return {
    ok: true,
    report,
    upstreamConfigured: true,
    upstreamStatus,
    upstreamUrl,
  };
}
