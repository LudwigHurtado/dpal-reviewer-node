/**
 * Evidence URLs from the API should already be absolute. If a relative path slips through
 * (e.g. misconfigured Reviewer env), prefix with the main DPAL API origin so <img src> does
 * not resolve against the Vercel host (which has no /uploads).
 */
export function resolveVerifierMediaUrl(url: string | undefined | null): string {
  if (url == null) return '';
  const u = String(url).trim();
  if (!u || u.startsWith('blob:')) return u;
  if (/^data:/i.test(u)) return u;
  if (/^https?:\/\//i.test(u)) return u;
  if (u.startsWith('//')) return `https:${u}`;
  const origin = import.meta.env.VITE_DPAL_MAIN_API_ORIGIN?.trim().replace(/\/$/, '');
  if (origin && u.startsWith('/')) return `${origin}${u}`;
  return u;
}
