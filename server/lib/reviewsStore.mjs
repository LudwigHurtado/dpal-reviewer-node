import fs from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_FILE = join(__dirname, '..', 'data', 'reviewer-reviews.json');

const ALLOWED_EFFECTS = new Set([
  'none',
  'proceed_validation',
  'request_evidence',
  'escalate',
  'hold',
]);

/** @returns {Record<string, { opinion: string, effect: string, updatedAt: string }>} */
export function readReviews() {
  try {
    const text = fs.readFileSync(DATA_FILE, 'utf8');
    const data = JSON.parse(text);
    if (data && typeof data === 'object' && !Array.isArray(data)) return data;
  } catch {
    /* missing or invalid */
  }
  return {};
}

export function writeReviews(data) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), 'utf8');
}

/**
 * @param {string} reportId
 * @param {{ opinion?: string, effect?: string }} body
 */
export function upsertReview(reportId, body) {
  if (!reportId || typeof reportId !== 'string') {
    throw new Error('Invalid report id');
  }
  const opinion = String(body?.opinion ?? '').slice(0, 8000);
  let effect = String(body?.effect ?? 'none');
  if (!ALLOWED_EFFECTS.has(effect)) effect = 'none';

  const all = readReviews();
  const entry = {
    opinion,
    effect,
    updatedAt: new Date().toISOString(),
  };
  all[reportId] = entry;
  writeReviews(all);
  return entry;
}

export { ALLOWED_EFFECTS };
