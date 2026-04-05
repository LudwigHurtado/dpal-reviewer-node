import {
  mapUpstreamReport,
  buildPublicReportUrl,
  resolveUpstreamAssetUrl,
  collectImageUrlStringsFromReportShape,
} from './upstream.mjs';

function pickStr(obj, keys, fallback = '') {
  for (const k of keys) {
    if (obj[k] != null && String(obj[k]).trim() !== '') return String(obj[k]);
  }
  return fallback;
}

function countEvidence(raw) {
  const p = raw?.payload || raw;
  let n = 0;
  if (Array.isArray(p.imageUrls)) n += p.imageUrls.length;
  if (Array.isArray(raw?.imageUrls)) n = Math.max(n, raw.imageUrls.length);
  if (Array.isArray(p.filingImageHistory)) n = Math.max(n, p.filingImageHistory.length);
  if (Array.isArray(raw?.filingImageHistory)) n = Math.max(n, raw.filingImageHistory.length);
  const rec = p.evidenceVault?.records;
  if (Array.isArray(rec)) n += rec.length;
  if (typeof raw?.evidenceCount === 'number') n = Math.max(n, raw.evidenceCount);
  const collected = collectImageUrlStringsFromReportShape(raw);
  n = Math.max(n, collected.length);
  return n;
}

/** Map DPAL category string → playbook key */
export function categoryToKey(category) {
  const s = String(category || '').toLowerCase();
  if (/environment|water|pollution|dump|climate|fire\s*environmental/i.test(s)) return 'environmental';
  if (/housing|landlord|tenant|mold|heat|wiring|structural/i.test(s)) return 'housing';
  if (/labor|workplace|osha|wage|employ/i.test(s)) return 'labor';
  if (/police|safety|traffic|road|violence|arrest|public\s*safety|accident/i.test(s)) return 'public_safety';
  if (/medical|elder|child|neglect|patient|health|care/i.test(s)) return 'medical';
  return 'environmental';
}

function inferSeverity(raw, base) {
  const sev = pickStr(raw, ['severity'], '').toLowerCase();
  if (['catastrophic', 'urgent'].includes(sev)) return 'urgent';
  if (sev === 'critical' || sev === 'high') return 'high';
  const life = pickStr(raw?.payload || raw, ['lifecycleState'], '').toLowerCase();
  if (life === 'certified') return 'medium';
  const trust = typeof base.confidence === 'number' ? base.confidence : 50;
  if (trust >= 88 && countEvidence(raw) >= 4) return 'high';
  if (trust < 55) return 'medium';
  return 'medium';
}

function lifecycleToStatus(lifecycle, stage) {
  const l = String(lifecycle || '').toLowerCase();
  const s = String(stage || '').toLowerCase();
  if (l === 'certified' || s === 'resolved') return 'resolved';
  if (l === 'anchored') return 'needs_action';
  if (l === 'verified') return 'ready_to_escalate';
  if (l === 'submitted') return 'under_review';
  return 'under_review';
}

/**
 * One queue row for the verifier portal (list + card).
 */
export function toVerifierQueueRow(raw) {
  const base = mapUpstreamReport(raw);
  const id = base.id || pickStr(raw, ['reportId', 'id'], '');
  const p = raw?.payload || raw;
  const city =
    pickStr(p, ['city'], '') ||
    extractCityFromLocation(base.location);

  const evidenceCount = countEvidence(raw);
  const categoryKey = categoryToKey(base.category);
  const severity = inferSeverity(raw, base);
  const status = lifecycleToStatus(p.lifecycleState || raw.lifecycleState, base.stage);
  const imgUrls = collectImageUrlStringsFromReportShape(raw);
  const thumbnailUrl = imgUrls[0] ? resolveUpstreamAssetUrl(imgUrls[0]) : undefined;

  return {
    id,
    title: base.title,
    summary: base.summary.slice(0, 500),
    category: base.category,
    categoryKey,
    city: city || '—',
    severity,
    verificationScore: Math.round(base.confidence),
    status,
    evidenceCount,
    stage: base.stage,
    publicUrl: base.publicUrl || buildPublicReportUrl(id),
    ...(thumbnailUrl ? { thumbnailUrl } : {}),
  };
}

function extractCityFromLocation(loc) {
  if (!loc || typeof loc !== 'string') return '';
  const parts = loc.split(',').map((s) => s.trim()).filter(Boolean);
  const city = parts[0] || loc;
  return city.length > 64 ? `${city.slice(0, 61)}…` : city;
}
