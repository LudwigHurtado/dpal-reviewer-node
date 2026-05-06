import fs from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_FILE = join(__dirname, '..', 'data', 'reviewer-cases.json');

export const REVIEWER_CASE_STATUSES = new Set([
  'pending_review',
  'needs_more_evidence',
  'verified',
  'rejected',
  'escalated',
  'closed',
]);

function ensureDataFile() {
  if (!fs.existsSync(DATA_FILE)) {
    fs.writeFileSync(DATA_FILE, JSON.stringify({ cases: {} }, null, 2), 'utf8');
  }
}

function nowIso() {
  return new Date().toISOString();
}

export function readReviewerCasesStore() {
  ensureDataFile();
  try {
    const text = fs.readFileSync(DATA_FILE, 'utf8');
    const parsed = JSON.parse(text);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      if (parsed.cases && typeof parsed.cases === 'object' && !Array.isArray(parsed.cases)) {
        return parsed;
      }
    }
  } catch {
    /* fallback below */
  }
  return { cases: {} };
}

export function writeReviewerCasesStore(store) {
  ensureDataFile();
  fs.writeFileSync(DATA_FILE, JSON.stringify(store, null, 2), 'utf8');
}

export function upsertReviewerCase(payload) {
  const caseId = String(payload?.caseId || '').trim();
  const goal = String(payload?.goal || '').trim();
  if (!caseId) throw new Error('caseId is required');
  if (!goal) throw new Error('goal is required');

  const store = readReviewerCasesStore();
  const existing = store.cases[caseId];
  const createdAt = existing?.createdAt || nowIso();
  const updatedAt = nowIso();
  const reportId = String(payload?.reportId || existing?.reportId || `field-os-${caseId}`).trim();
  const status = existing?.status || 'pending_review';
  const reviewerNotes = Array.isArray(existing?.reviewerNotes) ? existing.reviewerNotes : [];

  store.cases[caseId] = {
    ...existing,
    ...payload,
    source: 'field_os_super_agent',
    reportId,
    status,
    humanVerified: status === 'verified',
    reviewerNotes,
    reviewedAt: existing?.reviewedAt || null,
    reviewerId: existing?.reviewerId || null,
    decision: existing?.decision || null,
    createdAt,
    updatedAt,
  };
  writeReviewerCasesStore(store);
  return store.cases[caseId];
}

export function listReviewerCases() {
  const store = readReviewerCasesStore();
  return Object.values(store.cases || {}).sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')));
}

export function getReviewerCase(caseId) {
  const store = readReviewerCasesStore();
  return store.cases[String(caseId || '').trim()] || null;
}

export function patchReviewerCaseStatus(caseId, body) {
  const id = String(caseId || '').trim();
  if (!id) throw new Error('caseId is required');
  const store = readReviewerCasesStore();
  const current = store.cases[id];
  if (!current) return null;

  const status = String(body?.status || '').trim();
  if (!REVIEWER_CASE_STATUSES.has(status)) {
    throw new Error(`invalid status: ${status}`);
  }

  const reviewerNote = String(body?.reviewerNote || '').trim();
  const reviewerId = String(body?.reviewerId || '').trim() || null;
  const decision = String(body?.decision || '').trim() || null;

  const nextNotes = Array.isArray(current.reviewerNotes) ? [...current.reviewerNotes] : [];
  if (reviewerNote) {
    nextNotes.push({
      note: reviewerNote,
      at: nowIso(),
      reviewerId,
    });
  }

  const reviewedAt = status === 'pending_review' ? null : nowIso();
  const next = {
    ...current,
    status,
    humanVerified: status === 'verified',
    reviewerNotes: nextNotes,
    reviewedAt,
    reviewerId,
    decision: decision || status,
    updatedAt: nowIso(),
  };
  store.cases[id] = next;
  writeReviewerCasesStore(store);
  return next;
}
