import type { ReportReviewEntry, ReviewEffect, ReviewerDashboard } from '../types/reviewer';

function baseUrl(): string {
  const raw = import.meta.env.VITE_API_BASE_URL;
  if (raw === undefined || raw === '') return '/api';
  return raw.replace(/\/$/, '');
}

function bearerHeaders(): HeadersInit {
  const headers: HeadersInit = { Accept: 'application/json' };
  const token = import.meta.env.VITE_API_BEARER_TOKEN;
  if (token) headers.Authorization = `Bearer ${token}`;
  return headers;
}

function jsonPostHeaders(): HeadersInit {
  return { ...bearerHeaders(), 'Content-Type': 'application/json' };
}

export async function fetchDashboard(): Promise<ReviewerDashboard> {
  const url = `${baseUrl()}/reviewer/v1/dashboard`;
  const res = await fetch(url, { headers: bearerHeaders() });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Dashboard ${res.status}: ${text || res.statusText}`);
  }
  return res.json() as Promise<ReviewerDashboard>;
}

export async function postReportReview(
  reportId: string,
  body: { opinion: string; effect: ReviewEffect },
): Promise<{ ok: boolean; reportId: string; review: ReportReviewEntry }> {
  const id = encodeURIComponent(reportId);
  const url = `${baseUrl()}/reviewer/v1/reports/${id}/review`;
  const res = await fetch(url, {
    method: 'POST',
    headers: jsonPostHeaders(),
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Save review ${res.status}: ${text || res.statusText}`);
  }
  return res.json() as Promise<{ ok: boolean; reportId: string; review: ReportReviewEntry }>;
}
