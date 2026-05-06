#!/usr/bin/env node

const DEFAULT_API_BASE = 'http://localhost:8787/api';
const API_BASE = String(process.env.REVIEWER_API_BASE || DEFAULT_API_BASE).replace(/\/+$/, '');
const caseId = `case-http-smoke-${Date.now()}`;

function fail(message, details) {
  console.error(`\n❌ Field OS → Reviewer Node HTTP smoke failed: ${message}`);
  if (details) console.error(details);
  process.exit(1);
}

function assert(condition, message, details) {
  if (!condition) fail(message, details);
}

async function requestJson(path, options = {}) {
  const url = `${API_BASE}${path}`;
  let response;
  try {
    response = await fetch(url, {
      ...options,
      headers: {
        'content-type': 'application/json',
        ...(options.headers || {}),
      },
    });
  } catch (error) {
    fail(
      'Reviewer Node API is not running. Start it with npm run dev:all, then rerun npm run test:field-os-bridge-http.',
      `Attempted: ${url}\n${String(error?.message || error)}`,
    );
  }

  let json = null;
  const text = await response.text();
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { raw: text };
  }

  if (!response.ok) {
    fail(`HTTP ${response.status} for ${options.method || 'GET'} ${path}`, json || text);
  }

  return json;
}

function ensureNotBlockchainAnchored(value, context) {
  assert(value?.blockchain_anchored !== true, `${context}: blockchain_anchored must not be true`);
  assert(value?.claimLabels?.blockchain_anchored !== true, `${context}: claimLabels.blockchain_anchored must not be true`);
}

function ensureHumanVerified(value, expected, context) {
  assert(value?.humanVerified === expected, `${context}: expected humanVerified === ${expected}`, value);
}

async function main() {
  console.log('DPAL Field OS → Reviewer Node HTTP smoke test');
  console.log(`API base: ${API_BASE}`);

  console.log('\n1) Health check');
  const health = await requestJson('/reviewer/v1/health');
  assert(health?.ok !== false, 'Health endpoint returned ok:false', health);

  const payload = {
    caseId,
    source: 'field_os_super_agent',
    goal: 'HTTP smoke: verify Field OS Super Agent water and VIU case handoff.',
    location: '37.25, -119.80',
    dateRange: {
      startDate: '2026-03-04',
      endDate: '2026-04-05',
    },
    evidenceRefs: [
      'User report: Colorado River water conservation project.',
      'Source note: proposed improvement area near Yuma.',
      'Evidence pending: satellite scan, water measurement, field verification.',
    ],
    claimLabels: {
      observed: true,
      calculated: true,
      imported: false,
      user_submitted: true,
      ai_inferred: true,
      pending_verification: true,
      human_verified: false,
      blockchain_anchored: false,
    },
    limitations: [
      'Dry Run / Preview only. Live service adapters pending.',
      'Human verification required before any verified claim is asserted.',
      'Blockchain anchoring is separate and must not be inferred from review status.',
    ],
    caseWorkspace: {
      status: 'preview_ready',
      finalActionsBlocked: true,
      humanApprovalRequired: true,
    },
    evidenceTimeline: [
      { label: 'User goal received', mode: 'Dry Run', at: new Date().toISOString() },
      { label: 'Super Agent plan generated', mode: 'Dry Run', at: new Date().toISOString() },
    ],
    executionTraces: [
      { stepName: 'Plan mapped to workflows', mode: 'Dry Run', status: 'success' },
      { stepName: 'Pending live adapters recorded', mode: 'Pending live service adapter', status: 'pending' },
    ],
    mappedWorkflows: ['aquascan-investigation', 'earth-observation-audit', 'carbon-viu-project'],
    artifacts: [
      { type: 'report', id: 'draft-report-preview' },
      { type: 'draft_hash_preview', id: 'simulated-hash-preview-not-submitted' },
    ],
    approvalStatus: {
      final_report_publication: false,
      public_qr_publication: false,
      blockchain_anchoring: false,
      validator_submission: true,
      legal_packet_export: false,
      viu_draft_issuance: false,
    },
    finalActionsBlocked: true,
    humanApprovalRequired: true,
    nextRecommendedAction: 'Reviewer should inspect evidence and determine whether more evidence is needed.',
  };

  console.log('\n2) Submit Field OS case');
  const submitted = await requestJson('/reviewer/v1/verifier/cases', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  assert(submitted?.ok === true, 'Submit response must return ok:true', submitted);
  assert(submitted?.caseId === caseId, 'Submit response caseId must match', submitted);
  assert(Boolean(submitted?.reportId), 'Submit response must include reportId', submitted);
  assert(submitted?.status === 'pending_review', 'Submit response status must be pending_review', submitted);
  assert(submitted?.humanVerified !== true, 'Submit response must not mark humanVerified true', submitted);
  ensureNotBlockchainAnchored(submitted, 'submit response');

  console.log('\n3) Fetch pending status');
  const pendingStatus = await requestJson(`/reviewer/v1/verifier/cases/${encodeURIComponent(caseId)}/status`);
  assert(pendingStatus?.status === 'pending_review', 'Initial fetched status must be pending_review', pendingStatus);
  ensureHumanVerified(pendingStatus, false, 'pending_review status');
  ensureNotBlockchainAnchored(pendingStatus, 'pending_review status');

  console.log('\n4) Patch to needs_more_evidence');
  const needsEvidence = await requestJson(`/reviewer/v1/verifier/cases/${encodeURIComponent(caseId)}/status`, {
    method: 'PATCH',
    body: JSON.stringify({
      status: 'needs_more_evidence',
      reviewerNote: 'HTTP smoke: request more field evidence.',
      reviewerId: 'http-smoke',
    }),
  });
  assert(needsEvidence?.status === 'needs_more_evidence', 'Status must become needs_more_evidence', needsEvidence);
  ensureHumanVerified(needsEvidence, false, 'needs_more_evidence status');
  ensureNotBlockchainAnchored(needsEvidence, 'needs_more_evidence status');

  console.log('\n5) Patch to verified');
  const verified = await requestJson(`/reviewer/v1/verifier/cases/${encodeURIComponent(caseId)}/status`, {
    method: 'PATCH',
    body: JSON.stringify({
      status: 'verified',
      reviewerNote: 'HTTP smoke: reviewer verified test case.',
      reviewerId: 'http-smoke',
    }),
  });
  assert(verified?.status === 'verified', 'Status must become verified', verified);
  ensureHumanVerified(verified, true, 'verified status');
  ensureNotBlockchainAnchored(verified, 'verified status');

  console.log('\n6) Patch to rejected');
  const rejected = await requestJson(`/reviewer/v1/verifier/cases/${encodeURIComponent(caseId)}/status`, {
    method: 'PATCH',
    body: JSON.stringify({
      status: 'rejected',
      reviewerNote: 'HTTP smoke: rejected transition clears human verification.',
      reviewerId: 'http-smoke',
    }),
  });
  assert(rejected?.status === 'rejected', 'Status must become rejected', rejected);
  ensureHumanVerified(rejected, false, 'rejected status');
  ensureNotBlockchainAnchored(rejected, 'rejected status');

  console.log('\n✅ PASS: Field OS → Reviewer Node HTTP bridge smoke test');
  console.log(JSON.stringify({
    caseId,
    reportId: submitted.reportId,
    transitions: ['pending_review', 'needs_more_evidence', 'verified', 'rejected'],
    safety: {
      pendingReviewHumanVerified: false,
      needsMoreEvidenceHumanVerified: false,
      verifiedHumanVerified: true,
      rejectedHumanVerified: false,
      blockchainAnchoredNeverInferred: true,
    },
  }, null, 2));
}

main().catch((error) => fail('Unhandled smoke test error', error));
