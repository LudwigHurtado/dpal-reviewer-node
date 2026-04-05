import express from 'express';
import cors from 'cors';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { fetchUpstreamReports, buildPublicReportUrl } from './lib/upstream.mjs';
import { readReviews, upsertReview, ALLOWED_EFFECTS } from './lib/reviewsStore.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_FILE = join(__dirname, 'data', 'dashboard.json');

const PORT = Number(process.env.REVIEWER_API_PORT || process.env.PORT || 8787);

function readLocalDashboard() {
  const text = fs.readFileSync(DATA_FILE, 'utf8');
  return JSON.parse(text);
}

function cloneDashboard(d) {
  return JSON.parse(JSON.stringify(d));
}

/** Attach public URL + saved reviewer opinion/effect per report id. */
function enrichQueueRows(rows) {
  const reviews = readReviews();
  return rows.map((r) => {
    const id = r.id;
    const publicUrl = r.publicUrl || buildPublicReportUrl(id);
    const review = reviews[id];
    return {
      ...r,
      ...(publicUrl ? { publicUrl } : {}),
      ...(review ? { review } : {}),
    };
  });
}

const app = express();
app.use(cors({ origin: true }));
app.use(express.json({ limit: '2mb' }));

/** Full dashboard payload (primary contract for the Review-Node UI). */
app.get('/api/reviewer/v1/dashboard', async (_req, res) => {
  try {
    const dashboard = cloneDashboard(readLocalDashboard());
    const upstream = await fetchUpstreamReports();
    if (upstream && upstream.length > 0) {
      dashboard.queueRows = enrichQueueRows(upstream);
      dashboard._sources = { queueRows: 'upstream', upstream: true };
    } else {
      dashboard.queueRows = enrichQueueRows(dashboard.queueRows || []);
      dashboard._sources = { queueRows: 'local', upstream: false };
    }
    res.json(dashboard);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Failed to load dashboard', detail: String(e?.message || e) });
  }
});

/** Report list only (for integrations / debugging). */
app.get('/api/reviewer/v1/reports', async (_req, res) => {
  try {
    const upstream = await fetchUpstreamReports();
    if (upstream && upstream.length > 0) {
      return res.json({ reports: enrichQueueRows(upstream), source: 'upstream' });
    }
    const { queueRows } = readLocalDashboard();
    res.json({ reports: enrichQueueRows(queueRows || []), source: 'local' });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Failed to load reports', detail: String(e?.message || e) });
  }
});

/** All saved reviewer entries (opinion + effect) keyed by report id. */
app.get('/api/reviewer/v1/reviews', (_req, res) => {
  try {
    res.json({ reviews: readReviews() });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Failed to load reviews', detail: String(e?.message || e) });
  }
});

/**
 * Save reviewer opinion + recommended effect for a report (no auth yet — add later).
 * Body: { "opinion": string, "effect": "none"|"proceed_validation"|"request_evidence"|"escalate"|"hold" }
 */
app.post('/api/reviewer/v1/reports/:reportId/review', (req, res) => {
  try {
    const reportId = decodeURIComponent(req.params.reportId || '');
    const { opinion, effect } = req.body || {};
    if (!reportId) {
      return res.status(400).json({ error: 'Missing report id' });
    }
    if (effect != null && !ALLOWED_EFFECTS.has(String(effect))) {
      return res.status(400).json({ error: 'Invalid effect', allowed: [...ALLOWED_EFFECTS] });
    }
    const review = upsertReview(reportId, { opinion, effect });
    res.json({ ok: true, reportId, review });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Failed to save review', detail: String(e?.message || e) });
  }
});

/** Health for load balancers / dev. */
app.get('/api/reviewer/v1/health', (_req, res) => {
  res.json({ ok: true, service: 'dpal-reviewer-api', version: '1' });
});

const server = app.listen(PORT, () => {
  console.log(`DPAL reviewer API listening on http://127.0.0.1:${PORT}`);
  if (process.env.DPAL_UPSTREAM_URL) {
    console.log(`  Upstream reports: ${process.env.DPAL_UPSTREAM_URL}${process.env.DPAL_UPSTREAM_REPORTS_PATH || '/api/v1/reports'}`);
  }
  if (process.env.DPAL_PUBLIC_REPORT_BASE) {
    console.log(`  Public report links: ${process.env.DPAL_PUBLIC_REPORT_BASE} (?reportId=…)`);
  }
});

server.on('error', (err) => {
  if (err?.code === 'EADDRINUSE') {
    console.error(
      `\nPort ${PORT} is already in use (another reviewer API or app is running).\n` +
        `  • From the repo folder run: kill-port-8787.cmd\n` +
        `  • Or pick another port: set REVIEWER_API_PORT=8788  (and set Vite proxy VITE_DEV_API_PROXY_TARGET to match)\n`,
    );
  } else {
    console.error(err);
  }
  process.exit(1);
});
