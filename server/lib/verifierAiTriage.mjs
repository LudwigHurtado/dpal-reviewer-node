/**
 * Phase-1 AI triage: summary, urgency, credibility, destination, missing items, drafts, rationale.
 * Uses OPENAI_API_KEY when set; otherwise deterministic heuristics (still useful).
 */

function heuristicTriage({ title, description, category, location, evidenceCount }) {
  const text = `${title || ''} ${description || ''}`.toLowerCase();
  const missing = [];
  if (!location || String(location).length < 3) missing.push('missing_address');
  if (!/\d{4}|today|yesterday|am|pm|morning|night/.test(text) && text.length < 80) missing.push('missing_date_time');
  if (evidenceCount < 1) missing.push('no_clear_image_of_hazard');
  if (evidenceCount < 2) missing.push('need_second_image_angle');
  if (!/witness|bystander|saw|observed/.test(text)) missing.push('no_witness_details');

  let urgency = 'medium';
  if (/urgent|emergency|weapon|fire|collapse|bleeding|now|immediate/.test(text)) urgency = 'urgent';
  else if (/child|elder|senior|baby|vulnerable/.test(text)) urgency = 'high';

  const credibility = Math.min(95, 40 + (evidenceCount || 0) * 12 + Math.min(40, Math.floor(text.length / 25)));

  let destination = 'City / department contact (see category playbook)';
  if (/water|pollution|spill|smoke|odor|waste/.test(text)) destination = 'Environmental or health department';
  if (/landlord|mold|heat|wiring|housing|tenant/.test(text)) destination = 'Code enforcement / housing authority';
  if (/police|traffic|road|unsafe/.test(text)) destination = 'Public safety / non-emergency line as appropriate';
  if (/wage|osha|workplace|retaliation/.test(text)) destination = 'Labor department or worker center';

  return {
    summary: `${title || 'Report'} — ${String(description || '').slice(0, 280)}${String(description || '').length > 280 ? '…' : ''}`,
    urgency,
    credibility_estimate: credibility,
    destination,
    missing_info: missing,
    draft_email: `Subject: ${title || 'Community report'}\n\nWe are writing regarding ${location || 'the location described'}. ${String(description || '').slice(0, 400)}`,
    draft_call_summary: `Introduce the case, cite location (${location || 'see report'}), describe the hazard or concern, request timely response and reference ID.`,
    why_recommended: 'Heuristic triage (set OPENAI_API_KEY on the Reviewer API for richer AI output).',
    category_suggestion: category || 'General',
    mode: 'heuristic',
  };
}

export async function runVerifierAiTriage(input) {
  const key = process.env.OPENAI_API_KEY?.trim();
  const model = process.env.OPENAI_MODEL?.trim() || 'gpt-4o-mini';

  const payload = {
    title: input.title || '',
    description: input.description || '',
    category: input.category || '',
    location: input.location || '',
    evidenceCount: typeof input.evidenceCount === 'number' ? input.evidenceCount : 0,
  };

  if (!key) {
    return heuristicTriage(payload);
  }

  const system = `You are a DPAL verifier triage assistant. Output ONLY valid JSON with keys:
summary (string), urgency (one of: low, medium, high, urgent), credibility_estimate (number 0-100),
destination (string), missing_info (array of short codes like missing_address),
draft_email (string), draft_call_summary (string), why_recommended (string),
category_suggestion (string).`;

  const user = JSON.stringify(payload);

  try {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        temperature: 0.3,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
      }),
    });
    const data = await res.json();
    const text = data?.choices?.[0]?.message?.content;
    if (!text) {
      return { ...heuristicTriage(payload), mode: 'openai_error', openai: data };
    }
    const parsed = JSON.parse(text);
    return {
      summary: String(parsed.summary || ''),
      urgency: String(parsed.urgency || 'medium'),
      credibility_estimate: Number(parsed.credibility_estimate) || 50,
      destination: String(parsed.destination || ''),
      missing_info: Array.isArray(parsed.missing_info) ? parsed.missing_info.map(String) : [],
      draft_email: String(parsed.draft_email || ''),
      draft_call_summary: String(parsed.draft_call_summary || ''),
      why_recommended: String(parsed.why_recommended || ''),
      category_suggestion: String(parsed.category_suggestion || payload.category),
      mode: 'openai',
    };
  } catch (e) {
    return { ...heuristicTriage(payload), mode: 'openai_exception', error: String(e?.message || e) };
  }
}

export async function generateCallScript(input) {
  const key = process.env.OPENAI_API_KEY?.trim();
  const model = process.env.OPENAI_MODEL?.trim() || 'gpt-4o-mini';
  const brief = `${input.title || ''}\n${input.description || ''}\nLocation: ${input.location || '—'}\nCategory: ${input.category || '—'}`;
  if (!key) {
    return {
      script: `1) Identify yourself as a DPAL verifier.\n2) Reference report: ${input.title || 'case'}.\n3) Summarize: ${String(input.description || '').slice(0, 400)}\n4) Ask for agency response timeline and incident reference number.\n5) Thank the operator.`,
      mode: 'heuristic',
    };
  }
  try {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        temperature: 0.4,
        messages: [
          {
            role: 'system',
            content:
              'Write a concise phone script for a verifier calling a city agency or hotline. Bulleted, polite, under 220 words.',
          },
          { role: 'user', content: brief.slice(0, 6000) },
        ],
      }),
    });
    const data = await res.json();
    const text = data?.choices?.[0]?.message?.content;
    return { script: String(text || '').slice(0, 4000), mode: 'openai' };
  } catch (e) {
    return {
      script: `Call script unavailable (${String(e?.message || e)}). Use triage draft_call_summary instead.`,
      mode: 'error',
    };
  }
}
