import {
  getReviewerCase,
  listReviewerCases,
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
  location: '37.25, -119.80',
  dateRange: { startDate: '2026-03-04', endDate: '2026-04-05' },
  mappedWorkflows: ['aquascan-investigation', 'earth-observation-audit', 'carbon-viu-project'],
  claimLabels: { blockchain_anchored: false, human_verified: false },
  limitations: ['Dry-run package.', 'Pending live service adapter'],
  analysisSummaries: {
    water: { title: 'Water analysis', summary: 'Dry-run water summary', status: 'preview_complete' },
  },
  evidenceAttachments: [
    {
      id: 'att-1',
      type: 'note',
      title: 'Pending screenshot capture',
      description: 'No live screenshot captured in dry-run.',
    },
  ],
  evidenceTimeline: [{ title: 'Goal received' }],
  executionTraces: [{ stepName: 'Plan generated' }],
});
assert(base.status === 'pending_review', 'initial status should be pending_review');

const status0 = getReviewerCase(caseId);
assert(status0?.status === 'pending_review', 'stored case should be pending_review');
assert(status0?.location === '37.25, -119.80', 'location should be preserved');
assert(status0?.mappedWorkflows?.length === 3, 'mappedWorkflows should be preserved');
assert(status0?.analysisSummaries?.water?.summary === 'Dry-run water summary', 'analysis summaries should be preserved');
assert(Array.isArray(status0?.evidenceAttachments) && status0.evidenceAttachments.length > 0, 'attachments should be preserved');
assert(Array.isArray(status0?.evidenceTimeline) && status0.evidenceTimeline.length > 0, 'evidenceTimeline should be preserved');
assert(Array.isArray(status0?.executionTraces) && status0.executionTraces.length > 0, 'executionTraces should be preserved');
const fetched = listReviewerCases().find((row) => row.caseId === caseId);
assert(Boolean(fetched), 'fetched case should be discoverable in list');
assert(fetched?.analysisSummaries?.water?.summary === 'Dry-run water summary', 'fetched analysis should be preserved');

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
