import type {
  VerifierActionResponse,
  VerifierDetailResponse,
  VerifierQueueResponse,
} from '../verifier/types';

/**
 * Base URL for this repo’s Express routes (`/api/reviewer/v1/verifier/...`).
 * - Dev default: `/api` → Vite proxies to `VITE_DEV_API_PROXY_TARGET` (reviewer API on :8787).
 * - If `VITE_API_BASE_URL` is an absolute URL without `/api`, append `/api` so paths are not
 *   `https://host/reviewer/...` (404) instead of `https://host/api/reviewer/...`.
 */
function baseUrl(): string {
  const raw = import.meta.env.VITE_API_BASE_URL;
  if (raw === undefined || raw === '') return '/api';
  let u = raw.trim().replace(/\/$/, '');
  // `https://host` (no path) → `https://host/api` so we don't request `/reviewer/...` at domain root (404).
  if (/^https?:\/\/[^/?#]+\/?$/i.test(u)) {
    u = `${u.replace(/\/$/, '')}/api`;
  }
  return u;
}

function verifierReportsPath(): string {
  return `${baseUrl()}/reviewer/v1/verifier/reports`;
}

async function parseJsonSafe(res: Response): Promise<Record<string, unknown>> {
  try {
    return (await res.json()) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function httpError(res: Response, url: string, data: Record<string, unknown>): Error {
  const apiErr = typeof data.error === 'string' ? data.error : '';
  const hint404 =
    ' The Verifier UI must call the Reviewer Node Express app (this repo server/index.mjs), not the main DPAL filing API. ' +
    'Those are two different deployments. Deploy server/index.mjs to Railway (or similar), set DPAL_UPSTREAM_URL there to your main API (e.g. web-production-…), ' +
    'then set Vercel VITE_API_BASE_URL to that Reviewer service URL ending in /api (e.g. https://your-reviewer-service.up.railway.app/api). ' +
    'Do not set VITE_API_BASE_URL to the main filing host unless it also implements /api/reviewer/v1/verifier/*. ' +
    'Locally: remove VITE_API_BASE_URL and run npm run dev:all so /api proxies to port 8787.';
  const hint = res.status === 404 ? hint404 : '';
  return new Error(`${apiErr || res.statusText || res.status} (${res.status}) — ${url}${hint}`);
}

function headers(json = false): HeadersInit {
  const h: HeadersInit = { Accept: 'application/json' };
  const token = import.meta.env.VITE_API_BEARER_TOKEN;
  if (token) h.Authorization = `Bearer ${token}`;
  if (json) h['Content-Type'] = 'application/json';
  return h;
}

export async function fetchVerifierQueue(): Promise<VerifierQueueResponse> {
  const url = verifierReportsPath();
  const res = await fetch(url, { headers: headers() });
  const data = (await parseJsonSafe(res)) as unknown as VerifierQueueResponse;
  if (!res.ok) throw httpError(res, url, data as unknown as Record<string, unknown>);
  return data;
}

export async function fetchVerifierReportDetail(reportId: string): Promise<VerifierDetailResponse> {
  const id = encodeURIComponent(reportId);
  const url = `${baseUrl()}/reviewer/v1/verifier/reports/${id}`;
  const res = await fetch(url, { headers: headers() });
  const data = (await parseJsonSafe(res)) as unknown as VerifierDetailResponse;
  if (!res.ok) throw httpError(res, url, data as unknown as Record<string, unknown>);
  return data;
}

export async function postVerifierNotes(reportId: string, text: string): Promise<{ ok: boolean }> {
  const id = encodeURIComponent(reportId);
  const res = await fetch(`${baseUrl()}/reviewer/v1/verifier/reports/${id}/notes`, {
    method: 'POST',
    headers: headers(true),
    body: JSON.stringify({ text, performedBy: 'verifier' }),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json() as Promise<{ ok: boolean }>;
}

export async function postVerify(reportId: string, body: Record<string, unknown>): Promise<VerifierActionResponse> {
  const id = encodeURIComponent(reportId);
  const res = await fetch(`${baseUrl()}/reviewer/v1/verifier/reports/${id}/verify`, {
    method: 'POST',
    headers: headers(true),
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(JSON.stringify(data));
  return data as VerifierActionResponse;
}

export async function postRequestEvidence(reportId: string, message: string): Promise<VerifierActionResponse> {
  const id = encodeURIComponent(reportId);
  const res = await fetch(`${baseUrl()}/reviewer/v1/verifier/reports/${id}/request-evidence`, {
    method: 'POST',
    headers: headers(true),
    body: JSON.stringify({ message, performedBy: 'verifier' }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(JSON.stringify(data));
  return data as VerifierActionResponse;
}

export async function postOutboundAction(
  reportId: string,
  kind: 'call' | 'email' | 'escalate' | 'legal-referral' | 'assign-followup',
  body: Record<string, unknown>,
): Promise<VerifierActionResponse> {
  const id = encodeURIComponent(reportId);
  const path =
    kind === 'legal-referral'
      ? 'legal-referral'
      : kind === 'assign-followup'
        ? 'assign-followup'
        : kind;
  const res = await fetch(`${baseUrl()}/reviewer/v1/verifier/reports/${id}/actions/${path}`, {
    method: 'POST',
    headers: headers(true),
    body: JSON.stringify({ ...body, performedBy: 'verifier' }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(JSON.stringify(data));
  return data as VerifierActionResponse;
}
