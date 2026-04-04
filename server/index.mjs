import express from 'express';
import cors from 'cors';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { fetchUpstreamReports } from './lib/upstream.mjs';

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

const app = express();
app.use(cors({ origin: true }));
app.use(express.json({ limit: '2mb' }));

/** Full dashboard payload (primary contract for the Review-Node UI). */
app.get('/api/reviewer/v1/dashboard', async (_req, res) => {
  try {
    const dashboard = cloneDashboard(readLocalDashboard());
    const upstream = await fetchUpstreamReports();
    if (upstream && upstream.length > 0) {
      dashboard.queueRows = upstream;
      dashboard._sources = { queueRows: 'upstream', upstream: true };
    } else {
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
      return res.json({ reports: upstream, source: 'upstream' });
    }
    const { queueRows } = readLocalDashboard();
    res.json({ reports: queueRows, source: 'local' });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Failed to load reports', detail: String(e?.message || e) });
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
