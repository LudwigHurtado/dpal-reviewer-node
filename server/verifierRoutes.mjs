import { Router } from 'express';
import {
  fetchUpstreamVerifierFeedResult,
  fetchUpstreamReportById,
  fetchUpstreamSituationMessages,
  resolveUpstreamAssetUrl,
  collectImageUrlStringsFromReportShape,
} from './lib/upstream.mjs';
import { toVerifierQueueRow } from './lib/verifierRows.mjs';
import {
  readAudit,
  getNotes,
  saveNotes,
  logAction,
  getTimeline,
  getActionsForReport,
  getCaseState,
  mergeCaseState,
  updateActionEntry,
} from './lib/verifierAudit.mjs';
import { getVerifierIdentity } from './lib/verifierIdentity.mjs';
import {
  patchUpstreamOpsStatus,
  opsStatusForDisposition,
  reporterLineForDisposition,
} from './lib/verifierUpstreamSync.mjs';
import { sendVerifierEmail, getEmailConfigStatus } from './lib/verifierEmail.mjs';
import { runVerifierAiTriage, generateCallScript } from './lib/verifierAiTriage.mjs';

const DISPOSITIONS = new Set([
  'under_review',
  'verified',
  'needs_more_evidence',
  'urgent',
  'duplicate',
  'false_unsupported',
  'closed_no_action',
  'escalated',
  'action_taken',
  'follow_up_requested',
]);

function syncDispositionUpstream(reportId, disposition, performedBy, extraNote = '') {
  const line = reporterLineForDisposition(disposition, extraNote);
  const ops = opsStatusForDisposition(disposition);
  return patchUpstreamOpsStatus(reportId, ops, `[Verifier ${performedBy}] ${line}`);
}

export function createVerifierPortalRouter() {
  const router = Router();

  /** Which email providers are configured (no secrets). */
  router.get('/email/status', (_req, res) => {
    res.json({ ok: true, ...getEmailConfigStatus() });
  });

  router.get('/reports', async (_req, res) => {
    try {
      const result = await fetchUpstreamVerifierFeedResult();
      if (result.source === 'upstream') {
        const reports = result.rawList.map((raw) => toVerifierQueueRow(raw));
        return res.json({
          ok: true,
          reports,
          source: 'upstream',
          debug: result.debug,
        });
      }
      if (result.source === 'upstream_empty') {
        return res.json({
          ok: true,
          reports: [],
          source: 'upstream_empty',
          message: result.message,
          debug: result.debug,
        });
      }
      if (result.source === 'unconfigured') {
        return res.json({
          ok: true,
          reports: [],
          source: 'unconfigured',
          message: result.message,
        });
      }
      return res.json({
        ok: true,
        reports: [],
        source: 'upstream_error',
        message: result.message,
        debug: result.debug,
      });
    } catch (e) {
      console.error(e);
      return res.status(500).json({ ok: false, error: String(e?.message || e) });
    }
  });

  router.get('/reports/:reportId/timeline', (req, res) => {
    const reportId = decodeURIComponent(req.params.reportId || '').trim();
    return res.json({ ok: true, events: getTimeline(reportId) });
  });

  router.get('/reports/:reportId', async (req, res) => {
    try {
      const reportId = decodeURIComponent(req.params.reportId || '').trim();
      if (!reportId) return res.status(400).json({ ok: false, error: 'missing_id' });

      const doc = await fetchUpstreamReportById(reportId);
      if (!doc || doc.error) {
        return res.status(404).json({ ok: false, error: 'report_not_found' });
      }

      const p = doc.payload && typeof doc.payload === 'object' ? doc.payload : doc;
      const mergedUrls = collectImageUrlStringsFromReportShape(doc);
      const records = p.evidenceVault?.records || doc.evidenceVault?.records;
      const evidence = [];
      let i = 0;
      for (const url of mergedUrls.slice(0, 48)) {
        const abs = resolveUpstreamAssetUrl(url);
        if (!abs || abs.startsWith('blob:')) continue;
        evidence.push({
          id: `ev-img-${i++}`,
          type: 'image',
          file_url: abs,
          thumbnail_url: abs,
          uploaded_at: doc.anchoredAt || doc.submittedAt,
        });
      }
      if (Array.isArray(records)) {
        for (const r of records) {
          const link = r.verificationLink ? resolveUpstreamAssetUrl(r.verificationLink) : '';
          evidence.push({
            id: r.evidenceRefId || `ev-${i++}`,
            type: r.mimeType?.startsWith('audio') ? 'audio' : 'file',
            file_url: link,
            thumbnail_url: link || undefined,
            metadata: r,
            uploaded_at: r.timestampIso,
          });
        }
      }

      const notes = getNotes(reportId);
      const timeline = getTimeline(reportId);
      const priorActions = getActionsForReport(reportId);
      const situationMessages = await fetchUpstreamSituationMessages(reportId);
      const caseState = getCaseState(reportId);

      const syntheticRaw = {
        id: doc.id || reportId,
        reportId: doc.id || reportId,
        payload: {
          title: p.title ?? doc.title,
          description: p.description ?? doc.description,
          category: p.category ?? doc.category,
          location: p.location ?? doc.location,
          imageUrls: mergedUrls,
          evidenceVault: p.evidenceVault ?? doc.evidenceVault,
          lifecycleState: doc.lifecycleState,
        },
        lifecycleState: doc.lifecycleState,
      };
      const row = toVerifierQueueRow(syntheticRaw);

      return res.json({
        ok: true,
        report: {
          ...row,
          description: String(p.description ?? doc.description ?? row.summary ?? ''),
          latitude: p.latitude ?? doc.latitude,
          longitude: p.longitude ?? doc.longitude,
          location: String(p.location ?? doc.location ?? row.city ?? ''),
          urgency: row.severity,
          reporter: String(p.reporterLabel || p.reporter || doc.reporterLabel || 'Reporter'),
          evidence,
          priorActions,
          recommendedRouting: row.categoryKey,
        },
        caseState,
        notes,
        timeline,
        situationMessages,
        meta: {
          dispositions: [...DISPOSITIONS],
          accountabilityFields: [
            'destination_name',
            'destination_email',
            'destination_phone',
            'sent_at',
            'response_recorded_at',
            'response_summary',
            'resolution',
            'no_action_reason',
          ],
        },
      });
    } catch (e) {
      console.error(e);
      return res.status(500).json({ ok: false, error: String(e?.message || e) });
    }
  });

  /** Full case patch: disposition, assignments, deadline, redaction */
  router.patch('/reports/:reportId/case', (req, res) => {
    try {
      const reportId = decodeURIComponent(req.params.reportId || '').trim();
      const who = getVerifierIdentity(req);
      const b = req.body || {};
      const patch = {};
      if (b.disposition != null) {
        const d = String(b.disposition).trim();
        if (!DISPOSITIONS.has(d)) {
          return res.status(400).json({ ok: false, error: 'invalid_disposition', allowed: [...DISPOSITIONS] });
        }
        patch.disposition = d;
        patch.reporterFacingStatus = b.reporterFacingStatus || d;
      }
      if (b.assignedVerifier != null) patch.assignedVerifier = String(b.assignedVerifier).slice(0, 200);
      if (b.assignedSupervisor != null) patch.assignedSupervisor = String(b.assignedSupervisor).slice(0, 200);
      if (b.deadline != null) patch.deadline = b.deadline === '' ? null : String(b.deadline);
      if (b.redactionNotes != null) patch.redactionNotes = String(b.redactionNotes).slice(0, 8000);
      patch.lastReviewedBy = who;
      patch.lastReviewedAt = new Date().toISOString();

      const next = mergeCaseState(reportId, patch, who, {
        label: 'Case workspace updated',
        detail: Object.keys(patch).join(', '),
      });

      let upstream = null;
      if (patch.disposition) {
        upstream = syncDispositionUpstream(reportId, patch.disposition, who, b.publicNote || '');
      }

      return res.json({ ok: true, caseState: next, upstream });
    } catch (e) {
      console.error(e);
      return res.status(500).json({ ok: false, error: String(e?.message || e) });
    }
  });

  /** One-click disposition (convenience) */
  router.post('/reports/:reportId/disposition', (req, res) => {
    try {
      const reportId = decodeURIComponent(req.params.reportId || '').trim();
      const who = getVerifierIdentity(req);
      const d = String(req.body?.disposition || '').trim();
      if (!DISPOSITIONS.has(d)) {
        return res.status(400).json({ ok: false, error: 'invalid_disposition', allowed: [...DISPOSITIONS] });
      }
      const note = String(req.body?.note || '');
      const next = mergeCaseState(
        reportId,
        {
          disposition: d,
          reporterFacingStatus: d,
          lastReviewedBy: who,
          lastReviewedAt: new Date().toISOString(),
        },
        who,
        { label: `Disposition: ${d}`, detail: note.slice(0, 400) },
      );
      logAction(reportId, {
        actionType: 'disposition',
        label: `Marked: ${d}`,
        summary: note,
        disposition: d,
        performed_by: who,
      });
      const upstream = syncDispositionUpstream(reportId, d, who, note);
      return res.json({ ok: true, caseState: next, upstream });
    } catch (e) {
      console.error(e);
      return res.status(500).json({ ok: false, error: String(e?.message || e) });
    }
  });

  router.post('/reports/:reportId/notes', (req, res) => {
    try {
      const reportId = decodeURIComponent(req.params.reportId || '').trim();
      const who = getVerifierIdentity(req);
      const { text } = req.body || {};
      const n = saveNotes(reportId, text, who);
      return res.json({ ok: true, notes: n });
    } catch (e) {
      return res.status(500).json({ ok: false, error: String(e?.message || e) });
    }
  });

  router.post('/reports/:reportId/verify', (req, res) => {
    try {
      const reportId = decodeURIComponent(req.params.reportId || '').trim();
      const who = getVerifierIdentity(req);
      const body = req.body || {};
      const entry = logAction(reportId, {
        actionType: 'verify',
        label: 'Verification decision',
        summary: JSON.stringify(body).slice(0, 800),
        decision: body.decision,
        credibility_score: body.credibility_score,
        evidence_score: body.evidence_score,
        performed_by: who,
        reviewed_by: who,
        recorded_at: new Date().toISOString(),
      });
      mergeCaseState(
        reportId,
        { lastReviewedBy: who, lastReviewedAt: new Date().toISOString() },
        who,
        { label: 'Verification logged', detail: '' },
      );
      return res.json({ ok: true, action: entry });
    } catch (e) {
      return res.status(500).json({ ok: false, error: String(e?.message || e) });
    }
  });

  router.post('/reports/:reportId/request-evidence', (req, res) => {
    try {
      const reportId = decodeURIComponent(req.params.reportId || '').trim();
      const who = getVerifierIdentity(req);
      const { message } = req.body || {};
      const entry = logAction(reportId, {
        actionType: 'request_evidence',
        label: 'More evidence requested',
        summary: String(message || ''),
        performed_by: who,
        recorded_at: new Date().toISOString(),
      });
      mergeCaseState(
        reportId,
        {
          disposition: 'needs_more_evidence',
          reporterFacingStatus: 'needs_more_evidence',
          lastReviewedBy: who,
          lastReviewedAt: new Date().toISOString(),
        },
        who,
        { label: 'Evidence requested', detail: String(message || '').slice(0, 200) },
      );
      const upstream = syncDispositionUpstream(reportId, 'needs_more_evidence', who, String(message || ''));
      return res.json({ ok: true, action: entry, upstream });
    } catch (e) {
      return res.status(500).json({ ok: false, error: String(e?.message || e) });
    }
  });

  router.post('/reports/:reportId/ai-triage', async (req, res) => {
    try {
      const reportId = decodeURIComponent(req.params.reportId || '').trim();
      const doc = await fetchUpstreamReportById(reportId);
      if (!doc || doc.error) return res.status(404).json({ ok: false, error: 'report_not_found' });
      const p = doc.payload && typeof doc.payload === 'object' ? doc.payload : doc;
      const mergedUrls = collectImageUrlStringsFromReportShape(doc);
      const triage = await runVerifierAiTriage({
        title: p.title ?? doc.title,
        description: p.description ?? doc.description,
        category: p.category ?? doc.category,
        location: p.location ?? doc.location,
        evidenceCount: mergedUrls.length,
      });
      return res.json({ ok: true, triage });
    } catch (e) {
      console.error(e);
      return res.status(500).json({ ok: false, error: String(e?.message || e) });
    }
  });

  router.post('/reports/:reportId/actions/call-script', async (req, res) => {
    try {
      const reportId = decodeURIComponent(req.params.reportId || '').trim();
      const doc = await fetchUpstreamReportById(reportId);
      if (!doc || doc.error) return res.status(404).json({ ok: false, error: 'report_not_found' });
      const p = doc.payload && typeof doc.payload === 'object' ? doc.payload : doc;
      const script = await generateCallScript({
        title: p.title ?? doc.title,
        description: p.description ?? doc.description,
        category: p.category ?? doc.category,
        location: p.location ?? doc.location,
      });
      return res.json({ ok: true, ...script });
    } catch (e) {
      return res.status(500).json({ ok: false, error: String(e?.message || e) });
    }
  });

  /** Email city/agency — logs + optional Resend delivery */
  router.post('/reports/:reportId/actions/email', async (req, res) => {
    try {
      const reportId = decodeURIComponent(req.params.reportId || '').trim();
      const who = getVerifierIdentity(req);
      const b = req.body || {};
      const to = b.destination_email || b.to;
      const subject = b.subject || `DPAL verifier — report ${reportId}`;
      const html = b.html || (b.message ? `<pre>${String(b.message).replace(/</g, '&lt;')}</pre>` : '');
      const entry = logAction(reportId, {
        actionType: 'email',
        label: 'Email to agency',
        destination_name: b.destination_name,
        destination_email: to,
        summary: b.message || b.summary || '',
        performed_by: who,
        status: 'logged',
        recorded_at: new Date().toISOString(),
        sent_to: to,
      });

      let delivery = { sent: false, reason: to ? undefined : 'no_recipient' };
      let actionOut = entry;
      if (to) {
        delivery = await sendVerifierEmail({
          to,
          subject,
          html: html || String(b.message || ''),
          text: b.message ? String(b.message) : undefined,
        });
        if (delivery.sent) {
          const u = updateActionEntry(entry.id, {
            sent_at: new Date().toISOString(),
            delivery_provider: delivery.provider,
            delivery_id: delivery.id,
            status: 'sent',
          });
          if (u) actionOut = u;
        } else {
          updateActionEntry(entry.id, {
            status: 'send_failed',
            send_error: delivery.error || delivery.reason || delivery.attempts,
          });
        }
      }

      return res.json({
        ok: true,
        action: actionOut,
        delivery,
        hint: delivery.sent
          ? undefined
          : 'Configure email: RESEND_API_KEY+VERIFIER_FROM_EMAIL, or SENDGRID_API_KEY+VERIFIER_FROM_EMAIL, or SMTP_HOST+SMTP_USER+SMTP_PASS. Test Resend with VERIFIER_FROM_EMAIL=onboarding@resend.dev and send only to your account email.',
      });
    } catch (e) {
      return res.status(500).json({ ok: false, error: String(e?.message || e) });
    }
  });

  router.post('/reports/:reportId/actions/call', (req, res) => {
    try {
      const reportId = decodeURIComponent(req.params.reportId || '').trim();
      const who = getVerifierIdentity(req);
      const b = req.body || {};
      const entry = logAction(reportId, {
        actionType: 'call',
        label: 'Phone outreach (logged)',
        destination_name: b.destination_name,
        destination_phone: b.destination_phone,
        summary: b.message || b.summary || '',
        performed_by: who,
        recorded_at: new Date().toISOString(),
      });
      return res.json({ ok: true, action: entry });
    } catch (e) {
      return res.status(500).json({ ok: false, error: String(e?.message || e) });
    }
  });

  /** Structured phone log */
  router.post('/reports/:reportId/actions/phone-log', (req, res) => {
    try {
      const reportId = decodeURIComponent(req.params.reportId || '').trim();
      const who = getVerifierIdentity(req);
      const b = req.body || {};
      const entry = logAction(reportId, {
        actionType: 'phone_log',
        label: 'Phone call logged',
        destination_phone: b.called_number || b.destination_phone,
        duration_minutes: b.duration_min,
        reached_contact: Boolean(b.reached_contact),
        summary: b.summary || b.message || '',
        performed_by: who,
        recorded_at: new Date().toISOString(),
        sent_at: b.ended_at || new Date().toISOString(),
      });
      return res.json({ ok: true, action: entry });
    } catch (e) {
      return res.status(500).json({ ok: false, error: String(e?.message || e) });
    }
  });

  router.post('/reports/:reportId/actions/escalate', async (req, res) => {
    try {
      const reportId = decodeURIComponent(req.params.reportId || '').trim();
      const who = getVerifierIdentity(req);
      const b = req.body || {};
      const entry = logAction(reportId, {
        actionType: 'escalate',
        label: 'Escalation',
        destination_name: b.destination_name,
        destination_email: b.destination_email,
        summary: b.message || b.summary || '',
        performed_by: who,
        recorded_at: new Date().toISOString(),
      });
      mergeCaseState(
        reportId,
        {
          disposition: 'escalated',
          lastReviewedBy: who,
          lastReviewedAt: new Date().toISOString(),
        },
        who,
        { label: 'Escalated', detail: '' },
      );
      const upstream = syncDispositionUpstream(reportId, 'escalated', who, b.message || '');

      let delivery = null;
      const to = b.destination_email || b.to;
      const msg = String(b.message || b.summary || '');
      if (to && msg) {
        delivery = await sendVerifierEmail({
          to,
          subject: b.subject || `DPAL escalation — ${reportId}`,
          html: `<p><strong>Escalation</strong> (${who})</p><pre>${msg.replace(/</g, '&lt;')}</pre>`,
          text: msg,
        });
        if (delivery.sent) {
          updateActionEntry(entry.id, {
            sent_at: new Date().toISOString(),
            delivery_provider: delivery.provider,
            delivery_id: delivery.id,
            status: 'sent',
          });
        } else {
          updateActionEntry(entry.id, { status: 'send_failed', send_error: delivery.error || delivery.reason });
        }
      }

      return res.json({ ok: true, action: entry, upstream, delivery });
    } catch (e) {
      return res.status(500).json({ ok: false, error: String(e?.message || e) });
    }
  });

  router.post('/reports/:reportId/actions/escalate-emergency', async (req, res) => {
    try {
      const reportId = decodeURIComponent(req.params.reportId || '').trim();
      const who = getVerifierIdentity(req);
      const b = req.body || {};
      const entry = logAction(reportId, {
        actionType: 'escalate_emergency',
        label: 'Emergency risk escalation',
        summary: b.message || b.summary || '',
        destination_phone: b.destination_phone,
        destination_name: b.destination_name,
        destination_email: b.destination_email,
        performed_by: who,
        recorded_at: new Date().toISOString(),
      });
      mergeCaseState(
        reportId,
        {
          disposition: 'urgent',
          lastReviewedBy: who,
          lastReviewedAt: new Date().toISOString(),
        },
        who,
        { label: 'Emergency escalation', detail: '' },
      );
      const upstream = patchUpstreamOpsStatus(reportId, 'Investigating', `[EMERGENCY] ${b.message || 'Escalated'} (${who})`);

      let delivery = null;
      const to = b.destination_email || b.to;
      const msg = String(b.message || b.summary || '');
      if (to && msg) {
        delivery = await sendVerifierEmail({
          to,
          subject: b.subject || `URGENT — DPAL report ${reportId}`,
          html: `<p><strong>EMERGENCY ESCALATION</strong> (${who})</p><p>${b.destination_phone ? `Phone: ${b.destination_phone}<br/>` : ''}</p><pre>${msg.replace(/</g, '&lt;')}</pre>`,
          text: msg,
        });
        if (delivery.sent) {
          updateActionEntry(entry.id, {
            sent_at: new Date().toISOString(),
            delivery_provider: delivery.provider,
            delivery_id: delivery.id,
            status: 'sent',
          });
        } else {
          updateActionEntry(entry.id, { status: 'send_failed', send_error: delivery.error || delivery.reason });
        }
      }

      return res.json({ ok: true, action: entry, upstream, delivery });
    } catch (e) {
      return res.status(500).json({ ok: false, error: String(e?.message || e) });
    }
  });

  router.post('/reports/:reportId/actions/legal-referral', async (req, res) => {
    try {
      const reportId = decodeURIComponent(req.params.reportId || '').trim();
      const who = getVerifierIdentity(req);
      const b = req.body || {};
      const entry = logAction(reportId, {
        actionType: 'legal_referral',
        label: 'Legal referral',
        destination_name: b.destination_name,
        destination_email: b.destination_email,
        summary: b.message || b.summary || '',
        performed_by: who,
        recorded_at: new Date().toISOString(),
      });
      const to = b.destination_email;
      const msg = String(b.message || b.summary || '');
      let delivery = null;
      if (to && msg) {
        delivery = await sendVerifierEmail({
          to,
          subject: b.subject || `Legal referral — ${reportId}`,
          html: `<p>Legal referral (${who})</p><pre>${msg.replace(/</g, '&lt;')}</pre>`,
          text: msg,
        });
        if (delivery.sent) {
          updateActionEntry(entry.id, {
            sent_at: new Date().toISOString(),
            delivery_provider: delivery.provider,
            delivery_id: delivery.id,
            status: 'sent',
          });
        }
      }
      return res.json({ ok: true, action: entry, delivery });
    } catch (e) {
      return res.status(500).json({ ok: false, error: String(e?.message || e) });
    }
  });

  router.post('/reports/:reportId/actions/nonprofit-referral', async (req, res) => {
    try {
      const reportId = decodeURIComponent(req.params.reportId || '').trim();
      const who = getVerifierIdentity(req);
      const b = req.body || {};
      const entry = logAction(reportId, {
        actionType: 'nonprofit_referral',
        label: 'Nonprofit referral',
        destination_name: b.destination_name,
        destination_email: b.destination_email,
        destination_phone: b.destination_phone,
        summary: b.message || b.summary || '',
        performed_by: who,
        recorded_at: new Date().toISOString(),
      });
      const to = b.destination_email;
      const msg = String(b.message || b.summary || '');
      let delivery = null;
      if (to && msg) {
        delivery = await sendVerifierEmail({
          to,
          subject: b.subject || `Nonprofit referral — ${reportId}`,
          html: `<p>Nonprofit referral (${who})</p><pre>${msg.replace(/</g, '&lt;')}</pre>`,
          text: msg,
        });
        if (delivery.sent) {
          updateActionEntry(entry.id, {
            sent_at: new Date().toISOString(),
            delivery_provider: delivery.provider,
            delivery_id: delivery.id,
            status: 'sent',
          });
        }
      }
      return res.json({ ok: true, action: entry, delivery });
    } catch (e) {
      return res.status(500).json({ ok: false, error: String(e?.message || e) });
    }
  });

  router.post('/reports/:reportId/actions/assign-followup', (req, res) => {
    try {
      const reportId = decodeURIComponent(req.params.reportId || '').trim();
      const who = getVerifierIdentity(req);
      const b = req.body || {};
      const entry = logAction(reportId, {
        actionType: 'assign_followup',
        label: 'Internal follow-up task',
        destination_name: b.assignee || b.destination_name,
        summary: b.message || b.summary || '',
        due_at: b.due_at,
        performed_by: who,
        recorded_at: new Date().toISOString(),
      });
      return res.json({ ok: true, action: entry });
    } catch (e) {
      return res.status(500).json({ ok: false, error: String(e?.message || e) });
    }
  });

  router.post('/reports/:reportId/actions/internal-followup', (req, res) => {
    try {
      const reportId = decodeURIComponent(req.params.reportId || '').trim();
      const who = getVerifierIdentity(req);
      const b = req.body || {};
      const entry = logAction(reportId, {
        actionType: 'internal_followup',
        label: 'Internal follow-up (task)',
        destination_name: b.assignee,
        summary: b.summary || b.message || '',
        due_at: b.due_at,
        performed_by: who,
        recorded_at: new Date().toISOString(),
      });
      return res.json({ ok: true, action: entry });
    } catch (e) {
      return res.status(500).json({ ok: false, error: String(e?.message || e) });
    }
  });

  /** Notify reporter — log + optional email if RESEND + reporter email provided */
  router.post('/reports/:reportId/actions/notify-reporter', async (req, res) => {
    try {
      const reportId = decodeURIComponent(req.params.reportId || '').trim();
      const who = getVerifierIdentity(req);
      const b = req.body || {};
      const entry = logAction(reportId, {
        actionType: 'notify_reporter',
        label: 'Reporter notification',
        summary: b.message || '',
        destination_email: b.reporter_email,
        channel: b.channel || 'log',
        performed_by: who,
        recorded_at: new Date().toISOString(),
      });
      let delivery = { sent: false };
      if (b.reporter_email && b.message) {
        delivery = await sendVerifierEmail({
          to: b.reporter_email,
          subject: b.subject || `Update on your report (${reportId})`,
          html: `<p>${String(b.message).replace(/</g, '&lt;')}</p>`,
          text: String(b.message || ''),
        });
        if (delivery.sent) {
          updateActionEntry(entry.id, { sent_at: new Date().toISOString(), status: 'sent' });
        }
      }
      const upstream = b.public_line
        ? patchUpstreamOpsStatus(reportId, 'Investigating', `[Reporter update] ${b.public_line}`.slice(0, 800))
        : null;
      return res.json({ ok: true, action: entry, delivery, upstream });
    } catch (e) {
      return res.status(500).json({ ok: false, error: String(e?.message || e) });
    }
  });

  /** Attach accountability fields to an existing action row */
  router.post('/reports/:reportId/actions/:actionId/accountability', (req, res) => {
    try {
      const reportId = decodeURIComponent(req.params.reportId || '').trim();
      const actionId = decodeURIComponent(req.params.actionId || '').trim();
      const who = getVerifierIdentity(req);
      const b = req.body || {};
      const updated = updateActionEntry(actionId, {
        response_recorded_at: b.response_recorded_at || new Date().toISOString(),
        response_summary: b.response_summary,
        resolution: b.resolution,
        no_action_reason: b.no_action_reason,
        recorded_to_whom: b.recorded_to_whom,
        performed_by: who,
      });
      if (!updated || updated.reportId !== reportId) {
        return res.status(404).json({ ok: false, error: 'action_not_found' });
      }
      return res.json({ ok: true, action: updated });
    } catch (e) {
      return res.status(500).json({ ok: false, error: String(e?.message || e) });
    }
  });

  /** Close with explicit “why no action” */
  router.post('/reports/:reportId/close', (req, res) => {
    try {
      const reportId = decodeURIComponent(req.params.reportId || '').trim();
      const who = getVerifierIdentity(req);
      const reason = String(req.body?.no_action_reason || req.body?.reason || '').slice(0, 2000);
      const entry = logAction(reportId, {
        actionType: 'closure',
        label: 'Closed — no action / resolved',
        summary: reason,
        no_action_reason: reason,
        performed_by: who,
        recorded_at: new Date().toISOString(),
      });
      const next = mergeCaseState(
        reportId,
        {
          disposition: 'closed_no_action',
          lastReviewedBy: who,
          lastReviewedAt: new Date().toISOString(),
        },
        who,
        { label: 'Case closed', detail: reason.slice(0, 300) },
      );
      const upstream = syncDispositionUpstream(reportId, 'closed_no_action', who, reason);
      return res.json({ ok: true, action: entry, caseState: next, upstream });
    } catch (e) {
      return res.status(500).json({ ok: false, error: String(e?.message || e) });
    }
  });

  router.get('/audit/export', (_req, res) => {
    try {
      return res.json(readAudit());
    } catch (e) {
      return res.status(500).json({ ok: false, error: String(e?.message || e) });
    }
  });

  return router;
}
