import type { ReviewerDashboard } from '../types/reviewer';

function baseUrl(): string {
  const raw = import.meta.env.VITE_API_BASE_URL;
  if (raw === undefined || raw === '') return '/api';
  return raw.replace(/\/$/, '');
}

export async function fetchDashboard(): Promise<ReviewerDashboard> {
  const url = `${baseUrl()}/reviewer/v1/dashboard`;
  const headers: HeadersInit = { Accept: 'application/json' };
  const token = import.meta.env.VITE_API_BEARER_TOKEN;
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(url, { headers });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Dashboard ${res.status}: ${text || res.statusText}`);
  }
  return res.json() as Promise<ReviewerDashboard>;
}
