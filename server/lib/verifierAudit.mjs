import fs from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * Single JSON file for notes, timelines, actions, caseStates.
 * On Railway/Docker, set VERIFIER_AUDIT_PATH to a path on a mounted volume (e.g. /data/verifier-audit.json)
 * or the default container path below — otherwise data is lost on every deploy.
 */
function resolveAuditFilePath() {
  const fromEnv = process.env.VERIFIER_AUDIT_PATH?.trim();
  if (fromEnv) return fromEnv;
  const dir = process.env.VERIFIER_AUDIT_DIR?.trim();
  if (dir) return join(dir, 'verifier-audit.json');
  return join(__dirname, '..', 'data', 'verifier-audit.json');
}

/** Current audit JSON path (re-read each time so .env is respected after loadEnv runs). */
function auditFile() {
  return resolveAuditFilePath();
}

export function getVerifierAuditFilePath() {
  return auditFile();
}

function sameReportId(a, b) {
  const x = String(a ?? '').trim();
  const y = String(b ?? '').trim();
  if (x === y) return true;
  return x.toLowerCase() === y.toLowerCase();
}

function defaultAuditShape() {
  return { notes: {}, timelines: {}, actions: [], caseStates: {} };
}

function ensureFile() {
  const file = auditFile();
  if (!fs.existsSync(file)) {
    const dir = dirname(file);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(file, JSON.stringify(defaultAuditShape(), null, 2), 'utf8');
  }
}

function migrateAuditShape(data) {
  if (!data || typeof data !== 'object') return defaultAuditShape();
  if (!data.notes) data.notes = {};
  if (!data.timelines) data.timelines = {};
  if (!Array.isArray(data.actions)) data.actions = [];
  if (!data.caseStates || typeof data.caseStates !== 'object') data.caseStates = {};
  return data;
}

export function readAudit() {
  ensureFile();
  const file = auditFile();
  try {
    return migrateAuditShape(JSON.parse(fs.readFileSync(file, 'utf8')));
  } catch {
    return defaultAuditShape();
  }
}

function writeAudit(data) {
  ensureFile();
  const file = auditFile();
  fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf8');
}

export function getNotes(reportId) {
  const id = String(reportId || '').trim();
  const data = readAudit();
  const key = Object.keys(data.notes || {}).find((k) => sameReportId(k, id));
  return (key && data.notes[key]) || data.notes[id] || { text: '', updatedAt: null };
}

export function saveNotes(reportId, text, performedBy = 'verifier') {
  const data = readAudit();
  const id = String(reportId || '').trim();
  const nKeys = Object.keys(data.notes || {});
  const existingN = nKeys.find((k) => sameReportId(k, id)) || id;
  const prev = (data.notes[existingN] || data.notes[id])?.text || '';
  if (existingN !== id && sameReportId(existingN, id)) {
    delete data.notes[existingN];
  }
  data.notes[id] = {
    text: String(text || ''),
    updatedAt: new Date().toISOString(),
    updatedBy: performedBy,
  };
  if (String(text || '') !== prev) {
    appendTimelineEvent(data, id, {
      type: 'notes_saved',
      label: 'Verifier notes updated',
      detail: text ? `${String(text).slice(0, 200)}${text.length > 200 ? '…' : ''}` : '(empty)',
      performedBy,
    });
  }
  writeAudit(data);
  return data.notes[id];
}

export function appendTimelineEvent(data, reportId, event) {
  const id = String(reportId || '');
  if (!data.timelines[id]) data.timelines[id] = [];
  data.timelines[id].push({
    id: `evt-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    at: new Date().toISOString(),
    ...event,
  });
}

const DEFAULT_CASE = {
  disposition: 'under_review',
  assignedVerifier: '',
  assignedSupervisor: '',
  deadline: null,
  redactionNotes: '',
  reporterFacingStatus: 'under_review',
  lastReviewedBy: '',
  lastReviewedAt: null,
};

export function getCaseState(reportId) {
  const id = String(reportId || '').trim();
  const data = readAudit();
  const keys = Object.keys(data.caseStates || {});
  const key = keys.find((k) => sameReportId(k, id));
  const raw = (key && data.caseStates[key]) || data.caseStates[id];
  return { ...DEFAULT_CASE, ...(raw && typeof raw === 'object' ? raw : {}) };
}

/**
 * @param {Record<string, unknown>} patch
 * @param {string} performedBy
 * @param {{ label?: string, detail?: string }} [timelineMeta]
 */
export function mergeCaseState(reportId, patch, performedBy = 'verifier', timelineMeta) {
  const data = readAudit();
  const id = String(reportId || '').trim();
  const keys = Object.keys(data.caseStates || {});
  const existingKey = keys.find((k) => sameReportId(k, id)) || id;
  const prev = { ...DEFAULT_CASE, ...(data.caseStates[existingKey] || {}) };
  const next = { ...prev, ...patch, updatedAt: new Date().toISOString(), updatedBy: performedBy };
  if (existingKey !== id && sameReportId(existingKey, id)) {
    delete data.caseStates[existingKey];
  }
  data.caseStates[id] = next;
  appendTimelineEvent(data, id, {
    type: 'case_state',
    label: timelineMeta?.label || 'Case updated',
    detail: timelineMeta?.detail || JSON.stringify(patch).slice(0, 400),
    performedBy,
  });
  writeAudit(data);
  return next;
}

export function logAction(reportId, payload) {
  const data = readAudit();
  const id = String(reportId || '').trim();
  const entry = {
    id: `act-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    reportId: id,
    at: new Date().toISOString(),
    ...payload,
  };
  data.actions.push(entry);
  appendTimelineEvent(data, id, {
    type: payload.actionType || 'action',
    label: payload.label || 'Action recorded',
    detail: payload.summary || payload.destination_name || '',
    performedBy: payload.performed_by || 'verifier',
  });
  writeAudit(data);
  return entry;
}

export function getTimeline(reportId) {
  const data = readAudit();
  const id = String(reportId || '').trim();
  const merged = [];
  for (const k of Object.keys(data.timelines || {})) {
    if (sameReportId(k, id)) merged.push(...(data.timelines[k] || []));
  }
  merged.sort((a, b) => String(a.at).localeCompare(String(b.at)));
  return merged;
}

export function getActionsForReport(reportId) {
  const id = String(reportId || '').trim();
  return readAudit().actions.filter((a) => sameReportId(a.reportId, id));
}

export function updateActionEntry(actionId, patch) {
  const data = readAudit();
  const i = data.actions.findIndex((a) => a.id === actionId);
  if (i < 0) return null;
  data.actions[i] = {
    ...data.actions[i],
    ...patch,
    accountability_updated_at: new Date().toISOString(),
  };
  const rid = data.actions[i].reportId;
  appendTimelineEvent(data, rid, {
    type: 'accountability_update',
    label: 'Accountability record updated',
    detail: JSON.stringify(patch).slice(0, 400),
    performedBy: patch.performed_by || patch.recorded_by || 'verifier',
  });
  writeAudit(data);
  return data.actions[i];
}
