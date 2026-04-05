import type { QueueRow } from '../types/reviewer';

/** Resolve a link to open the public filing in the main DPAL web app. */
export function resolvePublicReportUrl(row: QueueRow): string | undefined {
  if (row.publicUrl?.trim()) return row.publicUrl.trim();
  const base = import.meta.env.VITE_DPAL_PUBLIC_WEB_URL?.replace(/\/$/, '').trim();
  if (!base || !row.id) return undefined;
  const u = new URL(base.includes('?') ? base : `${base}/`);
  u.searchParams.set('reportId', row.id);
  return u.toString();
}
