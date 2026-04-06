/**
 * Outbound email for the Validator API — tries providers in order until one succeeds:
 * 1) Resend (RESEND_API_KEY + from: VERIFIER_FROM_EMAIL or RESEND_FROM / RESEND_FROM_EMAIL)
 * 2) SendGrid (SENDGRID_API_KEY + same from vars)
 * 3) SMTP (SMTP_HOST + …) via nodemailer
 *
 * For unrestricted delivery to any recipient, configure a verified sender/domain in your provider
 * (Resend/SendGrid/SMTP).
 */

import nodemailer from 'nodemailer';

/**
 * From address for Resend/SendGrid. VERIFIER_FROM_EMAIL is canonical; Resend docs often use RESEND_FROM.
 */
function verifierFromEmail() {
  return (
    process.env.VERIFIER_FROM_EMAIL?.trim() ||
    process.env.RESEND_FROM?.trim() ||
    process.env.RESEND_FROM_EMAIL?.trim() ||
    ''
  );
}

function parseFrom(raw) {
  const s = String(raw || '').trim();
  const m = /^(.+?)\s*<([^>]+)>$/.exec(s);
  if (m) return { name: m[1].trim(), email: m[2].trim() };
  if (s.includes('@')) return { name: '', email: s };
  return { name: '', email: '' };
}

function normalizeRecipients(to) {
  const toList = Array.isArray(to) ? to : [to];
  const out = [];
  const seen = new Set();
  for (const raw of toList) {
    const parts = String(raw || '')
      .split(/[;,]/g)
      .map((s) => s.trim())
      .filter(Boolean);
    for (const email of parts) {
      const key = email.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(email);
    }
  }
  return out;
}

async function sendViaResend({ to, subject, html, text }) {
  const key = process.env.RESEND_API_KEY?.trim();
  const fromRaw = verifierFromEmail();
  if (!key || !fromRaw) return { sent: false, skipped: true };
  const recipients = normalizeRecipients(to);
  if (recipients.length === 0) return { sent: false, reason: 'no_recipients' };

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: fromRaw,
      to: recipients,
      subject: String(subject || '').slice(0, 900),
      html: html || undefined,
      text: text || (html ? html.replace(/<[^>]+>/g, ' ') : undefined),
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    return { sent: false, httpStatus: res.status, provider: 'resend', error: data };
  }
  return { sent: true, id: data.id, provider: 'resend' };
}

async function sendViaSendGrid({ to, subject, html, text }) {
  const key = process.env.SENDGRID_API_KEY?.trim();
  const fromRaw = verifierFromEmail();
  if (!key || !fromRaw) return { sent: false, skipped: true };
  const { name, email: fromEmail } = parseFrom(fromRaw);
  if (!fromEmail) return { sent: false, reason: 'invalid_from' };
  const recipients = normalizeRecipients(to);
  if (recipients.length === 0) return { sent: false, reason: 'no_recipients' };

  const content = [];
  if (html) content.push({ type: 'text/html', value: html });
  if (text) content.push({ type: 'text/plain', value: text });
  if (content.length === 0) content.push({ type: 'text/plain', value: ' ' });

  const sgPayload = {
    personalizations: [{ to: recipients.map((email) => ({ email })) }],
    from: name ? { name, email: fromEmail } : { email: fromEmail },
    subject: String(subject || '').slice(0, 900),
    content,
  };

  const res = await fetch('https://api.sendgrid.com/v3/mail/send', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(sgPayload),
  });
  if (res.status === 202 || res.ok) {
    return { sent: true, id: res.headers.get('x-message-id') || 'sendgrid', provider: 'sendgrid' };
  }
  const errText = await res.text();
  let parsed;
  try {
    parsed = JSON.parse(errText);
  } catch {
    parsed = { raw: errText.slice(0, 400) };
  }
  return { sent: false, httpStatus: res.status, provider: 'sendgrid', error: parsed };
}

async function sendViaSmtp({ to, subject, html, text }) {
  const host = process.env.SMTP_HOST?.trim();
  if (!host) return { sent: false, skipped: true };
  const port = Number(process.env.SMTP_PORT || 587);
  const user = process.env.SMTP_USER?.trim() || '';
  const pass = process.env.SMTP_PASS?.trim() || '';
  const secure = String(process.env.SMTP_SECURE || '').toLowerCase() === 'true' || port === 465;
  const fromRaw = verifierFromEmail() || process.env.SMTP_FROM?.trim() || user;
  if (!fromRaw) return { sent: false, reason: 'set_VERIFIER_FROM_EMAIL_or_SMTP_FROM' };

  const recipients = normalizeRecipients(to);
  if (recipients.length === 0) return { sent: false, reason: 'no_recipients' };

  const transporter = nodemailer.createTransport({
    host,
    port,
    secure,
    auth: user ? { user, pass } : undefined,
  });

  const info = await transporter.sendMail({
    from: fromRaw,
    to: recipients.join(', '),
    subject: String(subject || '').slice(0, 900),
    html: html || undefined,
    text: text || (html ? html.replace(/<[^>]+>/g, ' ') : ''),
  });
  return { sent: true, id: info.messageId, provider: 'smtp' };
}

/**
 * @returns {Promise<{ sent: boolean, id?: string, provider?: string, reason?: string, error?: unknown, httpStatus?: number, attempts?: unknown[] }>}
 */
export async function sendVerifierEmail({ to, subject, html, text }) {
  const attempts = [];

  if (process.env.RESEND_API_KEY?.trim() && verifierFromEmail()) {
    try {
      const r = await sendViaResend({ to, subject, html, text });
      if (r.sent) return r;
      attempts.push(r);
    } catch (e) {
      attempts.push({ provider: 'resend', error: String(e?.message || e) });
    }
  }

  if (process.env.SENDGRID_API_KEY?.trim() && verifierFromEmail()) {
    try {
      const r = await sendViaSendGrid({ to, subject, html, text });
      if (r.sent) return r;
      if (!r.skipped) attempts.push(r);
    } catch (e) {
      attempts.push({ provider: 'sendgrid', error: String(e?.message || e) });
    }
  }

  if (process.env.SMTP_HOST?.trim()) {
    try {
      const r = await sendViaSmtp({ to, subject, html, text });
      if (r.sent) return r;
      if (!r.skipped) attempts.push(r);
    } catch (e) {
      attempts.push({ provider: 'smtp', error: String(e?.message || e) });
    }
  }

  const configured =
    Boolean(process.env.RESEND_API_KEY?.trim()) ||
    Boolean(process.env.SENDGRID_API_KEY?.trim()) ||
    Boolean(process.env.SMTP_HOST?.trim());

  let errorSummary;
  for (const a of attempts) {
    if (a?.error != null) {
      errorSummary = typeof a.error === 'object' ? JSON.stringify(a.error) : String(a.error);
      break;
    }
    if (a?.httpStatus) {
      errorSummary = `HTTP ${a.httpStatus}`;
    }
  }

  return {
    sent: false,
    reason: configured ? 'all_providers_failed' : 'no_mailer_configured',
    attempts,
    errorSummary,
  };
}

/** @deprecated use sendVerifierEmail */
export async function sendEmailIfConfigured(payload) {
  return sendVerifierEmail(payload);
}

/**
 * Non-secret diagnostics for health/debug (which providers have env set).
 */
export function getEmailConfigStatus() {
  const from = verifierFromEmail();
  return {
    resend: Boolean(process.env.RESEND_API_KEY?.trim() && from),
    sendgrid: Boolean(process.env.SENDGRID_API_KEY?.trim() && from),
    smtp: Boolean(process.env.SMTP_HOST?.trim()),
    fromSet: Boolean(from),
  };
}
