/**
 * Resolve verifier display name from request (header preferred for API clients).
 */
export function getVerifierIdentity(req) {
  const h = req.headers['x-verifier-identity'] || req.headers['x-verifier-id'];
  if (h && String(h).trim()) return String(h).trim().slice(0, 120);
  const fromBody = req.body?.performedBy ?? req.body?.performed_by;
  if (fromBody && String(fromBody).trim()) return String(fromBody).trim().slice(0, 120);
  return process.env.VERIFIER_DEFAULT_IDENTITY?.trim().slice(0, 120) || 'verifier';
}
