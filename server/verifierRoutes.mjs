import { Router } from 'express';
import {
  fetchUpstreamVerifierFeedResult,
  fetchUpstreamReportById,
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
} from './lib/verifierAudit.mjs';

export function createVerifierPortalRouter() {
  const router = Router();

  /** GET /reports — live queue */
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

  /** Must be registered before `/reports/:reportId` or `timeline` is captured as an id. */
  router.get('/reports/:reportId/timeline', (req, res) => {
    const reportId = decodeURIComponent(req.params.reportId || '').trim();
    return res.json({ ok: true, events: getTimeline(reportId) });
  });

  /** GET /reports/:id — detail + audit merge */
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

      const syntheticRaw = {
        id: doc.id || reportId,
        reportId: doc.id || reportId,
        payload: {
          title: p.title ?? doc.title,
          description: p.description ?? doc.description,
          category: p.category ?? doc.category,
          location: p.location ?? doc.location,
          imageUrls,
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
          reporter: String(p.reporterLabel || 'Reporter'),
          evidence,
          priorActions,
          recommendedRouting: row.categoryKey,
        },
        notes,
        timeline,
      });
    } catch (e) {
      console.error(e);
      return res.status(500).json({ ok: false, error: String(e?.message || e) });
    }
  });

  router.post('/reports/:reportId/notes', (req, res) => {
    try {
      const reportId = decodeURIComponent(req.params.reportId || '').trim();
      const { text, performedBy } = req.body || {};
      const n = saveNotes(reportId, text, performedBy || 'verifier');
      return res.json({ ok: true, notes: n });
    } catch (e) {
      return res.status(500).json({ ok: false, error: String(e?.message || e) });
    }
  });

  router.post('/reports/:reportId/verify', (req, res) => {
    try {
      const reportId = decodeURIComponent(req.params.reportId || '').trim();
      const body = req.body || {};
      const entry = logAction(reportId, {
        actionType: 'verify',
        label: 'Verification decision',
        summary: JSON.stringify(body).slice(0, 800),
        decision: body.decision,
        credibility_score: body.credibility_score,
        evidence_score: body.evidence_score,
        performed_by: body.performedBy || 'verifier',
      });
      return res.json({ ok: true, action: entry });
    } catch (e) {
      return res.status(500).json({ ok: false, error: String(e?.message || e) });
    }
  });

  router.post('/reports/:reportId/request-evidence', (req, res) => {
    try {
      const reportId = decodeURIComponent(req.params.reportId || '').trim();
      const { message, performedBy } = req.body || {};
      const entry = logAction(reportId, {
        actionType: 'request_evidence',
        label: 'More evidence requested',
        summary: String(message || ''),
        performed_by: performedBy || 'verifier',
      });
      return res.json({ ok: true, action: entry });
    } catch (e) {
      return res.status(500).json({ ok: false, error: String(e?.message || e) });
    }
  });

  function actionHandler(actionLabel) {
    return (req, res) => {
      try {
        const reportId = decodeURIComponent(req.params.reportId || '').trim();
        const body = req.body || {};
        const entry = logAction(reportId, {
          actionType: body.action_type || actionLabel,
          label: actionLabel,
          destination_name: body.destination_name,
          destination_email: body.destination_email,
          destination_phone: body.destination_phone,
          summary: body.message || body.summary || '',
          action_payload: body,
          performed_by: body.performedBy || 'verifier',
          status: 'logged',
        });
        return res.json({
          ok: true,
          action: entry,
          warning:
            'This creates an audit log entry only. Wire email/SMS/voice providers to perform real outbound delivery.',
        });
      } catch (e) {
        return res.status(500).json({ ok: false, error: String(e?.message || e) });
      }
    };
  }

  router.post('/reports/:reportId/actions/call', actionHandler('call'));
  router.post('/reports/:reportId/actions/email', actionHandler('email'));
  router.post('/reports/:reportId/actions/escalate', actionHandler('escalate'));
  router.post('/reports/:reportId/actions/legal-referral', actionHandler('legal_referral'));
  router.post('/reports/:reportId/actions/assign-followup', actionHandler('assign_followup'));

  /** Optional: export full audit (admin) */
  router.get('/audit/export', (_req, res) => {
    try {
      return res.json(readAudit());
    } catch (e) {
      return res.status(500).json({ ok: false, error: String(e?.message || e) });
    }
  });

  return router;
}
