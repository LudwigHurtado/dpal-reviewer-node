import type {
  VerifierActionResponse,
  VerifierAiTriage,
  VerifierCaseState,
  VerifierDetailResponse,
  VerifierDisposition,
  VerifierQueueResponse,
} from '../verifier/types';

const IDENTITY_KEY = 'dpal_verifier_identity';

export function getVerifierIdentity(): string {
  if (typeof window === 'undefined') return '';
  try {
    return localStorage.getItem(IDENTITY_KEY)?.trim() || '';
  } catch {
    return '';
  }
}

export function setVerifierIdentity(name: string): void {
  try {
    localStorage.setItem(IDENTITY_KEY, name.trim().slice(0, 120));
  } catch {
    /* ignore */
  }
}

/**
 * Base URL for this repo’s Express routes (`/api/reviewer/v1/verifier/...`).
 */
function baseUrl(): string {
  const raw = import.meta.env.VITE_API_BASE_URL;
  if (raw === undefined || raw === '') return '/api';
  let u = raw.trim().replace(/\/$/, '');
  if (/^https?:\/\/[^/?#]+\/?$/i.test(u)) {
    u = `${u.replace(/\/$/, '')}/api`;
  }
  return u;
}

function verifierRoot(): string {
  return `${baseUrl()}/reviewer/v1/verifier`;
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
    'Deploy server/index.mjs to Railway, set DPAL_UPSTREAM_URL, then set Vercel VITE_API_BASE_URL to that Reviewer service URL ending in /api.';
  const hint = res.status === 404 ? hint404 : '';
  return new Error(`${apiErr || res.statusText || res.status} (${res.status}) — ${url}${hint}`);
}

function headers(json = false): HeadersInit {
  const h: HeadersInit = { Accept: 'application/json' };
  const token = import.meta.env.VITE_API_BEARER_TOKEN;
  if (token) h.Authorization = `Bearer ${token}`;
  const id = getVerifierIdentity();
  if (id) h['X-Verifier-Identity'] = id;
  if (json) h['Content-Type'] = 'application/json';
  return h;
}

function performedByBody(extra: Record<string, unknown> = {}): Record<string, unknown> {
  const id = getVerifierIdentity();
  return id ? { ...extra, performedBy: id } : extra;
}

export async function fetchVerifierQueue(): Promise<VerifierQueueResponse> {
  const url = `${verifierRoot()}/reports`;
  const res = await fetch(url, { headers: headers() });
  const data = (await parseJsonSafe(res)) as unknown as VerifierQueueResponse;
  if (!res.ok) throw httpError(res, url, data as unknown as Record<string, unknown>);
  return data;
}

export async function fetchVerifierReportDetail(reportId: string): Promise<VerifierDetailResponse> {
  const id = encodeURIComponent(reportId);
  const url = `${verifierRoot()}/reports/${id}`;
  const res = await fetch(url, { headers: headers() });
  const data = (await parseJsonSafe(res)) as unknown as VerifierDetailResponse;
  if (!res.ok) throw httpError(res, url, data as unknown as Record<string, unknown>);
  return data;
}

export async function postVerifierNotes(reportId: string, text: string): Promise<{ ok: boolean }> {
  const id = encodeURIComponent(reportId);
  const res = await fetch(`${verifierRoot()}/reports/${id}/notes`, {
    method: 'POST',
    headers: headers(true),
    body: JSON.stringify(performedByBody({ text })),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json() as Promise<{ ok: boolean }>;
}

export async function patchVerifierCase(
  reportId: string,
  body: Partial<{
    disposition: VerifierDisposition;
    assignedVerifier: string;
    assignedSupervisor: string;
    deadline: string | null;
    redactionNotes: string;
    reporterFacingStatus: string;
    publicNote: string;
  }>,
): Promise<VerifierActionResponse> {
  const id = encodeURIComponent(reportId);
  const res = await fetch(`${verifierRoot()}/reports/${id}/case`, {
    method: 'PATCH',
    headers: headers(true),
    body: JSON.stringify(performedByBody(body as Record<string, unknown>)),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(JSON.stringify(data));
  return data as VerifierActionResponse;
}

export async function postDisposition(
  reportId: string,
  disposition: VerifierDisposition,
  note?: string,
): Promise<VerifierActionResponse> {
  const id = encodeURIComponent(reportId);
  const res = await fetch(`${verifierRoot()}/reports/${id}/disposition`, {
    method: 'POST',
    headers: headers(true),
    body: JSON.stringify(performedByBody({ disposition, note: note || '' })),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(JSON.stringify(data));
  return data as VerifierActionResponse;
}

export async function postAiTriage(reportId: string): Promise<{ ok: boolean; triage: VerifierAiTriage }> {
  const id = encodeURIComponent(reportId);
  const res = await fetch(`${verifierRoot()}/reports/${id}/ai-triage`, {
    method: 'POST',
    headers: headers(true),
    body: JSON.stringify({}),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(JSON.stringify(data));
  return data as { ok: boolean; triage: VerifierAiTriage };
}

export async function postCallScript(reportId: string): Promise<{ ok: boolean; script: string; mode?: string }> {
  const id = encodeURIComponent(reportId);
  const res = await fetch(`${verifierRoot()}/reports/${id}/actions/call-script`, {
    method: 'POST',
    headers: headers(true),
    body: JSON.stringify({}),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(JSON.stringify(data));
  return data as { ok: boolean; script: string; mode?: string };
}

export async function postVerify(reportId: string, body: Record<string, unknown>): Promise<VerifierActionResponse> {
  const id = encodeURIComponent(reportId);
  const res = await fetch(`${verifierRoot()}/reports/${id}/verify`, {
    method: 'POST',
    headers: headers(true),
    body: JSON.stringify(performedByBody(body)),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(JSON.stringify(data));
  return data as VerifierActionResponse;
}

export async function postRequestEvidence(reportId: string, message: string): Promise<VerifierActionResponse> {
  const id = encodeURIComponent(reportId);
  const res = await fetch(`${verifierRoot()}/reports/${id}/request-evidence`, {
    method: 'POST',
    headers: headers(true),
    body: JSON.stringify(performedByBody({ message })),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(JSON.stringify(data));
  return data as VerifierActionResponse;
}

export type OutboundKind =
  | 'call'
  | 'call-outbound'
  | 'email'
  | 'escalate'
  | 'legal-referral'
  | 'assign-followup'
  | 'nonprofit-referral'
  | 'internal-followup'
  | 'escalate-emergency'
  | 'notify-reporter';

export async function postOutboundAction(
  reportId: string,
  kind: OutboundKind,
  body: Record<string, unknown>,
): Promise<VerifierActionResponse> {
  const id = encodeURIComponent(reportId);
  const pathMap: Record<OutboundKind, string> = {
    call: 'call',
    'call-outbound': 'call-outbound',
    email: 'email',
    escalate: 'escalate',
    'legal-referral': 'legal-referral',
    'assign-followup': 'assign-followup',
    'nonprofit-referral': 'nonprofit-referral',
    'internal-followup': 'internal-followup',
    'escalate-emergency': 'escalate-emergency',
    'notify-reporter': 'notify-reporter',
  };
  const path = pathMap[kind];
  const res = await fetch(`${verifierRoot()}/reports/${id}/actions/${path}`, {
    method: 'POST',
    headers: headers(true),
    body: JSON.stringify(performedByBody(body)),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(JSON.stringify(data));
  return data as VerifierActionResponse;
}

export async function postPhoneLog(
  reportId: string,
  body: {
    summary: string;
    called_number?: string;
    duration_min?: number;
    reached_contact?: boolean;
  },
): Promise<VerifierActionResponse> {
  const id = encodeURIComponent(reportId);
  const res = await fetch(`${verifierRoot()}/reports/${id}/actions/phone-log`, {
    method: 'POST',
    headers: headers(true),
    body: JSON.stringify(performedByBody(body)),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(JSON.stringify(data));
  return data as VerifierActionResponse;
}

export async function postAccountability(
  reportId: string,
  actionId: string,
  body: {
    response_summary?: string;
    resolution?: string;
    no_action_reason?: string;
    recorded_to_whom?: string;
  },
): Promise<VerifierActionResponse> {
  const rid = encodeURIComponent(reportId);
  const aid = encodeURIComponent(actionId);
  const res = await fetch(`${verifierRoot()}/reports/${rid}/actions/${aid}/accountability`, {
    method: 'POST',
    headers: headers(true),
    body: JSON.stringify(performedByBody(body)),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(JSON.stringify(data));
  return data as VerifierActionResponse;
}

export async function postCloseCase(
  reportId: string,
  no_action_reason: string,
): Promise<VerifierActionResponse> {
  const id = encodeURIComponent(reportId);
  const res = await fetch(`${verifierRoot()}/reports/${id}/close`, {
    method: 'POST',
    headers: headers(true),
    body: JSON.stringify(performedByBody({ no_action_reason })),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(JSON.stringify(data));
  return data as VerifierActionResponse;
}

export type { VerifierCaseState };
