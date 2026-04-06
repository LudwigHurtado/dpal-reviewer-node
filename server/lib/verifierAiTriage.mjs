/**
 * Verifier AI copilot: triage + guided quest + category/agency drafts.
 * Uses OPENAI_API_KEY when set; otherwise deterministic heuristics (still useful).
 */

function normalizeCategoryKey(raw) {
  const v = String(raw || '').toLowerCase().replace(/[\s-]+/g, '_');
  if (['environmental', 'housing', 'labor', 'public_safety', 'medical'].includes(v)) return v;
  if (v.includes('environment') || v.includes('pollution')) return 'environmental';
  if (v.includes('housing') || v.includes('tenant') || v.includes('landlord')) return 'housing';
  if (v.includes('labor') || v.includes('worker') || v.includes('wage') || v.includes('osha')) return 'labor';
  if (v.includes('safety') || v.includes('police') || v.includes('traffic')) return 'public_safety';
  if (v.includes('medical') || v.includes('elder') || v.includes('child') || v.includes('health')) return 'medical';
  return 'public_safety';
}

function buildCategoryQuest(categoryKey) {
  const shared = [
    'Validate core facts: exact location, time window, and a concise incident narrative.',
    'Preserve accountability evidence: screenshots, media URLs, witness details, and report ID.',
    'Set a follow-up checkpoint (24-72h) and document agency response or no-action reason.',
  ];
  const byCategory = {
    environmental: [
      'Confirm hazard type (spill, smoke, dumping, runoff) and immediate public exposure risk.',
      'Route to environmental authority and request field inspection + case/reference number.',
      'If water/air contamination is credible, escalate to regional regulator in parallel.',
    ],
    housing: [
      'Confirm habitability violations (heat, mold, wiring, structural) and vulnerable occupants.',
      'Send compliance request to housing/code enforcement with inspection request.',
      'If retaliation/displacement risk appears, prepare legal aid referral with timeline.',
    ],
    labor: [
      'Confirm worker risk facts (unsafe machinery, wage theft pattern, retaliation indicators).',
      'Route to labor safety authority and request investigator assignment.',
      'If ongoing hazard persists, escalate to legal/worker center partner for protection steps.',
    ],
    public_safety: [
      'Confirm immediacy of harm and whether emergency escalation is required now.',
      'Route to non-emergency or emergency dispatcher with precise location and risk summary.',
      'Request incident number and supervisor follow-up timeline for accountability.',
    ],
    medical: [
      'Confirm patient/elder/child safety indicators and whether urgent welfare intervention is needed.',
      'Route to health regulator/facility oversight with concrete safety observations.',
      'If abuse/neglect indicators exist, escalate to protective services immediately.',
    ],
  };
  return [...(byCategory[categoryKey] || byCategory.public_safety), ...shared];
}

function buildAgencyDrafts(categoryKey, payload) {
  const title = payload.title || 'Community safety report';
  const location = payload.location || 'reported location';
  const description = String(payload.description || '').slice(0, 500);
  const reportId = payload.reportId || 'N/A';

  const packs = {
    environmental: [
      {
        agency: 'City Environmental Department',
        channel: 'email',
        subject: `Request for environmental inspection — ${title}`,
        body:
          `Hello,\n\nI am a DPAL verifier requesting an inspection for a reported environmental hazard.\n\n` +
          `Report ID: ${reportId}\nLocation: ${location}\n` +
          `Summary: ${description}\n\n` +
          `Please confirm receipt, provide a case number, and share expected response timing.\n\nThank you.`,
      },
      {
        agency: 'County Health Department',
        channel: 'email',
        subject: `Public health concern referral — ${title}`,
        body:
          `Hello,\n\nWe are forwarding a verified community concern with possible health impact.\n\n` +
          `Report ID: ${reportId}\nLocation: ${location}\n` +
          `Concern: ${description}\n\n` +
          `Please advise triage outcome, assigned unit, and next steps.\n\nRegards,\nDPAL Verifier Team`,
      },
    ],
    housing: [
      {
        agency: 'Code Enforcement',
        channel: 'email',
        subject: `Habitability/code complaint referral — ${title}`,
        body:
          `Hello,\n\nDPAL is referring a housing safety concern for code review.\n\n` +
          `Report ID: ${reportId}\nAddress/Location: ${location}\n` +
          `Issue summary: ${description}\n\n` +
          `Please confirm inspection scheduling and provide case tracking details.\n\nThank you.`,
      },
      {
        agency: 'Housing Authority',
        channel: 'email',
        subject: `Request for housing intervention — ${title}`,
        body:
          `Hello,\n\nThis message requests housing intervention support for a reported unsafe condition.\n\n` +
          `Report ID: ${reportId}\nLocation: ${location}\n` +
          `Reported condition: ${description}\n\n` +
          `Please confirm referral intake and expected follow-up timeline.\n\nRegards,\nDPAL Verifier`,
      },
    ],
    labor: [
      {
        agency: 'State Labor Department',
        channel: 'email',
        subject: `Worker safety/labor standards referral — ${title}`,
        body:
          `Hello,\n\nDPAL is referring a worker protection concern for review.\n\n` +
          `Report ID: ${reportId}\nWorksite/Location: ${location}\n` +
          `Summary: ${description}\n\n` +
          `Please confirm intake and whether an investigator will be assigned.\n\nThank you.`,
      },
      {
        agency: 'OSHA Regional Office',
        channel: 'email',
        subject: `Potential workplace hazard notification — ${title}`,
        body:
          `Hello,\n\nWe are submitting a potential workplace hazard concern.\n\n` +
          `Report ID: ${reportId}\nLocation: ${location}\n` +
          `Hazard details: ${description}\n\n` +
          `Please provide complaint/reference number and response expectations.\n\nDPAL Verifier Team`,
      },
    ],
    public_safety: [
      {
        agency: 'Police Non-Emergency Dispatch',
        channel: 'call_or_email',
        subject: `Public safety concern follow-up — ${title}`,
        body:
          `Dispatcher/Officer,\n\nI am calling from DPAL regarding a public safety report.\n\n` +
          `Report ID: ${reportId}\nLocation: ${location}\n` +
          `Concern summary: ${description}\n\n` +
          `Request: please log this concern, share incident/reference number, and confirm next steps.`,
      },
      {
        agency: 'City Public Safety Office',
        channel: 'email',
        subject: `Community risk accountability request — ${title}`,
        body:
          `Hello,\n\nDPAL requests review of a reported public safety issue.\n\n` +
          `Report ID: ${reportId}\nLocation: ${location}\n` +
          `Summary: ${description}\n\n` +
          `Please provide response timeline, assigned unit, and planned mitigation actions.\n\nThank you.`,
      },
    ],
    medical: [
      {
        agency: 'Health Department',
        channel: 'email',
        subject: `Patient/community health concern referral — ${title}`,
        body:
          `Hello,\n\nDPAL is submitting a health-related concern for review.\n\n` +
          `Report ID: ${reportId}\nLocation: ${location}\n` +
          `Concern details: ${description}\n\n` +
          `Please confirm intake and share planned review timeline.\n\nRegards,\nDPAL Verifier`,
      },
      {
        agency: 'Adult/Child Protective Services',
        channel: 'email',
        subject: `Potential welfare risk referral — ${title}`,
        body:
          `Hello,\n\nWe are referring a possible welfare/safety concern.\n\n` +
          `Report ID: ${reportId}\nLocation: ${location}\n` +
          `Observed concern: ${description}\n\n` +
          `Please confirm referral receipt and case handling path.\n\nThank you.`,
      },
    ],
  };
  return packs[categoryKey] || packs.public_safety;
}

function evaluateReportQuality({ title, description, category }) {
  const text = `${title || ''} ${description || ''}`.toLowerCase().trim();
  const issues = [];
  const suggestions = [];
  let followUp = false;

  if (text.length < 40) {
    issues.push('report_too_short');
    suggestions.push('Ask reporter for a fuller narrative: what happened, where, when, and who was involved.');
    followUp = true;
  }
  if (!/[.!?]/.test(String(description || '')) && String(description || '').length < 120) {
    issues.push('limited_context');
    suggestions.push('Request clearer sentence-level details and chronological order of events.');
    followUp = true;
  }
  if (!/where|location|street|ave|road|st|near|at|inside/.test(text)) {
    issues.push('unclear_location_context');
    suggestions.push('Contact reporter to confirm exact location and landmarks.');
    followUp = true;
  }

  const inferred = normalizeCategoryKey(text);
  const provided = normalizeCategoryKey(category);
  if (provided && inferred && provided !== inferred) {
    issues.push('possible_category_mismatch');
    suggestions.push(`Review category: current "${category}" may fit better as "${inferred}".`);
  }

  if (!followUp && issues.length === 0) {
    suggestions.push('Report appears coherent; proceed with agency routing and accountability timeline.');
  } else if (followUp) {
    suggestions.push('Before escalation, contact reporter and help them fix/complete the report details.');
  }

  return { issues, suggestions, followUp };
}

function heuristicTriage({ title, description, category, location, evidenceCount, reportId }) {
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

  const categoryKey = normalizeCategoryKey(category);
  const quality = evaluateReportQuality({ title, description, category });
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
    quality_issues: quality.issues,
    remediation_suggestions: quality.suggestions,
    reporter_follow_up_needed: quality.followUp,
    quest_steps: buildCategoryQuest(categoryKey),
    agency_drafts: buildAgencyDrafts(categoryKey, { title, description, location, reportId }),
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
    reportId: input.reportId || '',
  };

  if (!key) {
    return heuristicTriage(payload);
  }

  const system = `You are a DPAL verifier triage assistant. Output ONLY valid JSON with keys:
summary (string), urgency (one of: low, medium, high, urgent), credibility_estimate (number 0-100),
destination (string), missing_info (array of short codes like missing_address),
draft_email (string), draft_call_summary (string), why_recommended (string),
category_suggestion (string), quality_issues (array of short strings), remediation_suggestions (array of strings),
reporter_follow_up_needed (boolean), quest_steps (array of strings), agency_drafts (array of objects with keys agency, channel, subject, body).`;

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
    const categoryKey = normalizeCategoryKey(parsed.category_suggestion || payload.category);
    const parsedDrafts = Array.isArray(parsed.agency_drafts)
      ? parsed.agency_drafts
          .map((x) => ({
            agency: String(x?.agency || '').slice(0, 140),
            channel: String(x?.channel || 'email').slice(0, 50),
            subject: String(x?.subject || '').slice(0, 220),
            body: String(x?.body || '').slice(0, 6000),
          }))
          .filter((x) => x.agency && x.body)
      : [];
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
      quality_issues: Array.isArray(parsed.quality_issues) ? parsed.quality_issues.map((s) => String(s).slice(0, 120)) : [],
      remediation_suggestions: Array.isArray(parsed.remediation_suggestions)
        ? parsed.remediation_suggestions.map((s) => String(s).slice(0, 280))
        : evaluateReportQuality(payload).suggestions,
      reporter_follow_up_needed: Boolean(parsed.reporter_follow_up_needed),
      quest_steps: Array.isArray(parsed.quest_steps) ? parsed.quest_steps.map((s) => String(s).slice(0, 280)) : buildCategoryQuest(categoryKey),
      agency_drafts: parsedDrafts.length > 0 ? parsedDrafts : buildAgencyDrafts(categoryKey, payload),
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
