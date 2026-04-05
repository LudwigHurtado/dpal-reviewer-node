/**
 * Optional real email via Resend HTTPS API (no extra npm dependency).
 * Set RESEND_API_KEY and VERIFIER_FROM_EMAIL on the Reviewer API host.
 */

export async function sendEmailIfConfigured({ to, subject, html, text }) {
  const key = process.env.RESEND_API_KEY?.trim();
  const from = process.env.VERIFIER_FROM_EMAIL?.trim();
  if (!key || !from) {
    return { sent: false, reason: 'RESEND_API_KEY or VERIFIER_FROM_EMAIL not set' };
  }
  const toList = Array.isArray(to) ? to : [to];
  const recipients = toList.map((e) => String(e).trim()).filter(Boolean);
  if (recipients.length === 0) return { sent: false, reason: 'no_recipients' };

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from,
        to: recipients,
        subject: String(subject || '').slice(0, 900),
        html: html || undefined,
        text: text || html?.replace(/<[^>]+>/g, ' ') || undefined,
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      return { sent: false, httpStatus: res.status, resend: data };
    }
    return { sent: true, id: data.id };
  } catch (e) {
    return { sent: false, error: String(e?.message || e) };
  }
}
