function escXml(s) {
  return String(s || '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

function twimlGatherResponse({ say, actionUrl, finish = false }) {
  const safeSay = escXml(say || 'Hello. This is DPAL calling about your report.');
  if (finish) {
    return `<?xml version="1.0" encoding="UTF-8"?><Response><Say voice="alice">${safeSay}</Say><Hangup/></Response>`;
  }
  const safeAction = escXml(actionUrl);
  return (
    `<?xml version="1.0" encoding="UTF-8"?>` +
    `<Response>` +
    `<Gather input="speech dtmf" timeout="5" speechTimeout="auto" action="${safeAction}" method="POST">` +
    `<Say voice="alice">${safeSay}</Say>` +
    `</Gather>` +
    `<Say voice="alice">I did not receive a response. We will follow up by text or email. Thank you.</Say>` +
    `<Hangup/>` +
    `</Response>`
  );
}

export function getVoiceConfigStatus() {
  const hasApiKey =
    Boolean(process.env.TWILIO_API_KEY_SID?.trim()) &&
    Boolean(process.env.TWILIO_API_KEY_SECRET?.trim()) &&
    Boolean(process.env.TWILIO_ACCOUNT_SID?.trim()) &&
    Boolean(process.env.TWILIO_FROM_NUMBER?.trim());
  return {
    twilio: Boolean(
      hasApiKey ||
        (process.env.TWILIO_ACCOUNT_SID?.trim() &&
          process.env.TWILIO_AUTH_TOKEN?.trim() &&
          process.env.TWILIO_FROM_NUMBER?.trim()),
    ),
    twilioAuthMode: hasApiKey ? 'api_key' : 'auth_token',
    webhookBaseSet: Boolean(process.env.VOICE_WEBHOOK_BASE_URL?.trim()),
  };
}

function voiceWebhookBaseFromReq(req) {
  const fixed = process.env.VOICE_WEBHOOK_BASE_URL?.trim();
  if (fixed) return fixed.replace(/\/$/, '');
  const proto = req.headers['x-forwarded-proto'] || req.protocol || 'https';
  const host = req.headers['x-forwarded-host'] || req.get('host');
  return `${proto}://${host}`.replace(/\/$/, '');
}

function buildReportContext(report) {
  return {
    id: report?.id || '',
    title: report?.title || '',
    description: report?.description || '',
    category: report?.category || '',
    location: report?.location || report?.city || '',
    status: report?.status || '',
    severity: report?.severity || report?.urgency || '',
  };
}

export async function placeTwilioOutboundCall({ req, reportId, toPhone, actionId, reportContext }) {
  const sid = process.env.TWILIO_ACCOUNT_SID?.trim();
  const token = process.env.TWILIO_AUTH_TOKEN?.trim();
  const apiKeySid = process.env.TWILIO_API_KEY_SID?.trim();
  const apiKeySecret = process.env.TWILIO_API_KEY_SECRET?.trim();
  const from = process.env.TWILIO_FROM_NUMBER?.trim();
  if (!sid || !from || (!(apiKeySid && apiKeySecret) && !token)) {
    return { ok: false, reason: 'twilio_not_configured' };
  }
  const base = voiceWebhookBaseFromReq(req);
  const answerUrl = `${base}/api/reviewer/v1/verifier/voice/twilio/answer?reportId=${encodeURIComponent(reportId)}&actionId=${encodeURIComponent(actionId)}`;
  const statusUrl = `${base}/api/reviewer/v1/verifier/voice/twilio/status?reportId=${encodeURIComponent(reportId)}&actionId=${encodeURIComponent(actionId)}`;

  const body = new URLSearchParams();
  body.set('To', toPhone);
  body.set('From', from);
  body.set('Url', answerUrl);
  body.set('Method', 'POST');
  body.set('StatusCallback', statusUrl);
  body.set('StatusCallbackMethod', 'POST');
  body.set('StatusCallbackEvent', 'initiated ringing answered completed');
  body.set(
    'MachineDetection',
    process.env.TWILIO_MACHINE_DETECTION?.trim() || 'Enable',
  );

  const authModes = [];
  if (apiKeySid && apiKeySecret) authModes.push({ mode: 'api_key', user: apiKeySid, pass: apiKeySecret });
  if (token) authModes.push({ mode: 'auth_token', user: sid, pass: token });

  const attempts = [];
  for (const m of authModes) {
    const auth = Buffer.from(`${m.user}:${m.pass}`).toString('base64');
    const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Calls.json`, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${auth}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body,
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok) {
      return {
        ok: true,
        provider: 'twilio',
        authMode: m.mode,
        callSid: data.sid,
        to: toPhone,
        from,
        answerUrl,
        statusUrl,
        reportContext,
      };
    }
    attempts.push({
      mode: m.mode,
      httpStatus: res.status,
      error: data,
    });
  }

  return {
    ok: false,
    reason: 'twilio_call_failed',
    attempts,
    httpStatus: attempts[0]?.httpStatus,
    error: attempts[0]?.error,
  };
}

function heuristicVoiceStep({ reportContext, userText, turnIndex }) {
  const t = String(userText || '').toLowerCase();
  if (!userText || !String(userText).trim()) {
    return {
      reply:
        `This is DPAL about report ${reportContext.id}. Can you confirm what happened, where it happened, and when?`,
      done: false,
      followUpNeeded: true,
    };
  }
  if (turnIndex >= 2 || /thank|bye|that's all|thats all|done/.test(t)) {
    return {
      reply:
        'Thank you. We recorded your update and a verifier will review the report and follow up with next steps.',
      done: true,
      followUpNeeded: false,
      summary: `Caller update captured: ${String(userText).slice(0, 240)}`,
    };
  }
  if (/wrong category|wrong cat|not police|not housing|not labor|not medical|not environmental/.test(t)) {
    return {
      reply:
        'Thank you for clarifying. We will update the report category and continue verification. Is there any additional detail we should add?',
      done: false,
      followUpNeeded: true,
      summary: 'Caller indicated category mismatch.',
    };
  }
  if (/i don't know|dont know|not sure|confused/.test(t)) {
    return {
      reply:
        'No problem. A DPAL verifier can contact you directly to help complete your report details before escalation.',
      done: true,
      followUpNeeded: true,
      summary: 'Caller needs verifier assistance to complete report details.',
    };
  }
  return {
    reply:
      'Got it. Please share any missing details such as exact location, time, and who was involved. You can say done when finished.',
    done: false,
    followUpNeeded: false,
    summary: `Caller detail: ${String(userText).slice(0, 220)}`,
  };
}

export async function generateVoiceAiTurn({ reportContext, userText, turnIndex }) {
  const key = process.env.OPENAI_API_KEY?.trim();
  const model = process.env.OPENAI_MODEL?.trim() || 'gpt-4o-mini';
  if (!key) return { ...heuristicVoiceStep({ reportContext, userText, turnIndex }), mode: 'heuristic' };

  const system =
    'You are a DPAL voice agent speaking to a reporter about their incident report. ' +
    'Be concise and calm. Ask for clarification if report details are unclear or category seems wrong. ' +
    'Output ONLY valid JSON with keys: reply (string), done (boolean), followUpNeeded (boolean), summary (string).';
  const payload = {
    report: reportContext,
    userText: String(userText || ''),
    turnIndex: Number(turnIndex || 0),
  };
  try {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        temperature: 0.3,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: JSON.stringify(payload) },
        ],
      }),
    });
    const data = await res.json();
    const text = data?.choices?.[0]?.message?.content;
    if (!text) return { ...heuristicVoiceStep({ reportContext, userText, turnIndex }), mode: 'openai_empty' };
    const parsed = JSON.parse(text);
    return {
      reply: String(parsed.reply || '').slice(0, 500),
      done: Boolean(parsed.done),
      followUpNeeded: Boolean(parsed.followUpNeeded),
      summary: String(parsed.summary || '').slice(0, 600),
      mode: 'openai',
    };
  } catch {
    return { ...heuristicVoiceStep({ reportContext, userText, turnIndex }), mode: 'openai_error' };
  }
}

export function buildInitialVoiceTwiml({ report, reportId, actionId, req }) {
  const base = voiceWebhookBaseFromReq(req);
  const actionUrl = `${base}/api/reviewer/v1/verifier/voice/twilio/gather?reportId=${encodeURIComponent(reportId)}&actionId=${encodeURIComponent(actionId)}`;
  const intro =
    `Hello, this is DPAL support calling about your report ${reportId}. ` +
    `We want to confirm details so we can help resolve your case. ` +
    `Please briefly describe what happened and any corrections needed.`;
  return twimlGatherResponse({ say: intro, actionUrl, finish: false });
}

export function buildNextVoiceTwiml({ req, reportId, actionId, reply, done }) {
  const base = voiceWebhookBaseFromReq(req);
  const actionUrl = `${base}/api/reviewer/v1/verifier/voice/twilio/gather?reportId=${encodeURIComponent(reportId)}&actionId=${encodeURIComponent(actionId)}`;
  return twimlGatherResponse({ say: reply, actionUrl, finish: done });
}

export { buildReportContext };
