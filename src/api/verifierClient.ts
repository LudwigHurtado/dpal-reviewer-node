import type {
  VerifierActionResponse,
  VerifierDetailResponse,
  VerifierQueueResponse,
} from '../verifier/types';

function baseUrl(): string {
  const raw = import.meta.env.VITE_API_BASE_URL;
  if (raw === undefined || raw === '') return '/api';
  return raw.replace(/\/$/, '');
}

function headers(json = false): HeadersInit {
  const h: HeadersInit = { Accept: 'application/json' };
  const token = import.meta.env.VITE_API_BEARER_TOKEN;
  if (token) h.Authorization = `Bearer ${token}`;
  if (json) h['Content-Type'] = 'application/json';
  return h;
}

export async function fetchVerifierQueue(): Promise<VerifierQueueResponse> {
  const res = await fetch(`${baseUrl()}/reviewer/v1/verifier/reports`, { headers: headers() });
  const data = (await res.json()) as VerifierQueueResponse;
  if (!res.ok) throw new Error((data as { error?: string }).error || res.statusText);
  return data;
}

export async function fetchVerifierReportDetail(reportId: string): Promise<VerifierDetailResponse> {
  const id = encodeURIComponent(reportId);
  const res = await fetch(`${baseUrl()}/reviewer/v1/verifier/reports/${id}`, { headers: headers() });
  const data = (await res.json()) as VerifierDetailResponse;
  if (!res.ok) throw new Error((data as { error?: string }).error || res.statusText);
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
