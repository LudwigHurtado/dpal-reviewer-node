import fs from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FILE = join(__dirname, '..', 'data', 'verifier-audit.json');

function defaultAuditShape() {
  return { notes: {}, timelines: {}, actions: [], caseStates: {} };
}

function ensureFile() {
  if (!fs.existsSync(FILE)) {
    const dir = dirname(FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(FILE, JSON.stringify(defaultAuditShape(), null, 2), 'utf8');
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
  try {
    return migrateAuditShape(JSON.parse(fs.readFileSync(FILE, 'utf8')));
  } catch {
    return defaultAuditShape();
  }
}

function writeAudit(data) {
  ensureFile();
  fs.writeFileSync(FILE, JSON.stringify(data, null, 2), 'utf8');
}

export function getNotes(reportId) {
  const id = String(reportId || '');
  return readAudit().notes[id] || { text: '', updatedAt: null };
}

export function saveNotes(reportId, text, performedBy = 'verifier') {
  const data = readAudit();
  const id = String(reportId || '');
  const prev = data.notes[id]?.text || '';
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
  const id = String(reportId || '');
  const data = readAudit();
  const raw = data.caseStates[id];
  return { ...DEFAULT_CASE, ...(raw && typeof raw === 'object' ? raw : {}) };
}

/**
 * @param {Record<string, unknown>} patch
 * @param {string} performedBy
 * @param {{ label?: string, detail?: string }} [timelineMeta]
 */
export function mergeCaseState(reportId, patch, performedBy = 'verifier', timelineMeta) {
  const data = readAudit();
  const id = String(reportId || '');
  const prev = { ...DEFAULT_CASE, ...(data.caseStates[id] || {}) };
  const next = { ...prev, ...patch, updatedAt: new Date().toISOString(), updatedBy: performedBy };
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
  const id = String(reportId || '');
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
  const id = String(reportId || '');
  return data.timelines[id] || [];
}

export function getActionsForReport(reportId) {
  const id = String(reportId || '');
  return readAudit().actions.filter((a) => a.reportId === id);
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
