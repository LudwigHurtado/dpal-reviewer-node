import fs from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FILE = join(__dirname, '..', 'data', 'verifier-audit.json');

function ensureFile() {
  if (!fs.existsSync(FILE)) {
    const dir = dirname(FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(FILE, JSON.stringify({ notes: {}, timelines: {}, actions: [] }, null, 2), 'utf8');
  }
}

export function readAudit() {
  ensureFile();
  try {
    return JSON.parse(fs.readFileSync(FILE, 'utf8'));
  } catch {
    return { notes: {}, timelines: {}, actions: [] };
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
