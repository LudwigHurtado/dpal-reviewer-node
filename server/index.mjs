import './loadEnv.mjs';
import express from 'express';
import cors from 'cors';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

import { fetchUpstreamReports, buildPublicReportUrl } from './lib/upstream.mjs';
import { readReviews, upsertReview, ALLOWED_EFFECTS } from './lib/reviewsStore.mjs';
import { createVerifierPortalRouter } from './verifierRoutes.mjs';
import { getEmailConfigStatus } from './lib/verifierEmail.mjs';
import { getVerifierAuditFilePath } from './lib/verifierAudit.mjs';
import { getVoiceConfigStatus } from './lib/verifierVoice.mjs';

const DATA_FILE = join(__dirname, 'data', 'dashboard.json');

const PORT = Number(process.env.REVIEWER_API_PORT || process.env.PORT || 8787);
const SSE_INTERVAL_MS = Number(process.env.REVIEWER_SSE_INTERVAL_MS || 12000);

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

async function computeDashboardPayload() {
  const dashboard = cloneDashboard(readLocalDashboard());
  const upstream = await fetchUpstreamReports();
  if (upstream && upstream.length > 0) {
    dashboard.queueRows = enrichQueueRows(upstream);
    dashboard._sources = { queueRows: 'upstream', upstream: true };
  } else {
    dashboard.queueRows = enrichQueueRows(dashboard.queueRows || []);
    dashboard._sources = { queueRows: 'local', upstream: false };
  }
  return dashboard;
}

function upstreamBase() {
  return process.env.DPAL_UPSTREAM_URL?.replace(/\/$/, '') || '';
}

const app = express();
app.set('trust proxy', 1);
app.use(cors({ origin: true }));
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: false }));

/** Root — valid JSON so opening the Railway URL in a browser is not an empty/invalid HTTP response. */
app.get('/', (_req, res) => {
  res.json({
    ok: true,
    service: 'dpal-reviewer-api',
    hint:
      'This host is the JSON API only. Open the Verifier Action Portal on Vercel (set VITE_API_BASE_URL to this origin + /api).',
    health: '/api/reviewer/v1/health',
    verifierQueue: '/api/reviewer/v1/verifier/reports',
  });
});

/** Full dashboard payload (primary contract for the Review-Node UI). */
app.get('/api/reviewer/v1/dashboard', async (_req, res) => {
  try {
    const dashboard = await computeDashboardPayload();
    res.json(dashboard);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Failed to load dashboard', detail: String(e?.message || e) });
  }
});

/** Server-Sent Events: push fresh dashboard JSON on connect and every SSE_INTERVAL_MS (near real-time queue). */
app.get('/api/reviewer/v1/stream', async (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  if (typeof res.flushHeaders === 'function') res.flushHeaders();

  const send = async () => {
    try {
      const dashboard = await computeDashboardPayload();
      res.write(`data: ${JSON.stringify({ type: 'dashboard', dashboard })}\n\n`);
    } catch (e) {
      res.write(`event: error\ndata: ${JSON.stringify({ message: String(e?.message || e) })}\n\n`);
    }
  };

  await send();
  const iv = setInterval(send, SSE_INTERVAL_MS);
  req.on('close', () => {
    clearInterval(iv);
  });
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

/**
 * Verifier Action Portal — live queue, detail, verify, outbound actions, timeline (local audit JSON).
 * Mirrors desired contract: GET/POST /api/reviewer/v1/verifier/reports/…
 */
app.use('/api/reviewer/v1/verifier', createVerifierPortalRouter());

/** Health for load balancers / dev. */
app.get('/api/reviewer/v1/health', (_req, res) => {
  res.json({
    ok: true,
    service: 'dpal-reviewer-api',
    version: '3',
    upstream: Boolean(upstreamBase()),
    sseMs: SSE_INTERVAL_MS,
    verifierPortal: true,
    email: getEmailConfigStatus(),
    voice: getVoiceConfigStatus(),
    verifierAuditPath: getVerifierAuditFilePath(),
  });
});

const HOST = process.env.HOST || '0.0.0.0';
const server = app.listen(PORT, HOST, () => {
  console.log(`DPAL reviewer API listening on http://${HOST}:${PORT}`);
  console.log(`  Verifier audit JSON: ${getVerifierAuditFilePath()} (mount a volume here on Railway or data resets on deploy)`);
  if (process.env.DPAL_UPSTREAM_URL) {
    console.log(
      `  Upstream reports: ${process.env.DPAL_UPSTREAM_URL}${process.env.DPAL_UPSTREAM_REPORTS_PATH || '/api/reports/feed'}`,
    );
    console.log('  Verifier portal: /api/reviewer/v1/verifier/*');
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
