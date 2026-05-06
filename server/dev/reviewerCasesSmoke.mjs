import {
  getReviewerCase,
  patchReviewerCaseStatus,
  upsertReviewerCase,
} from '../lib/reviewerCasesStore.mjs';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const caseId = `smoke-${Date.now()}`;
const base = upsertReviewerCase({
  caseId,
  source: 'field_os_super_agent',
  goal: 'Smoke test reviewer bridge',
  claimLabels: { blockchain_anchored: false, human_verified: false },
});
assert(base.status === 'pending_review', 'initial status should be pending_review');

const status0 = getReviewerCase(caseId);
assert(status0?.status === 'pending_review', 'stored case should be pending_review');

const verified = patchReviewerCaseStatus(caseId, {
  status: 'verified',
  reviewerNote: 'smoke note',
  reviewerId: 'smoke-tester',
});
assert(verified?.humanVerified === true, 'humanVerified should be true after verified');
assert(Boolean(verified?.claimLabels?.blockchain_anchored) === false, 'blockchain_anchored must stay false');

const reverted = patchReviewerCaseStatus(caseId, {
  status: 'needs_more_evidence',
  reviewerId: 'smoke-tester',
});
assert(reverted?.humanVerified === false, 'humanVerified should be false when not verified');

console.log('reviewer-cases smoke test passed');
