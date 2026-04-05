import type { VerifierQueueRow } from '../verifier/types';

/** Training data when no upstream DPAL feed is configured. */
export const demoVerifierReports: VerifierQueueRow[] = [
  {
    id: 'demo-RPT-41012',
    title: 'Industrial runoff near public water intake',
    category: 'Environment',
    categoryKey: 'environmental',
    city: 'Santa Cruz',
    severity: 'high',
    verificationScore: 82,
    status: 'needs_action',
    evidenceCount: 5,
    summary: 'Photos, video, and location markers suggest runoff entering a drainage path near a public intake.',
  },
  {
    id: 'demo-RPT-41013',
    title: 'Unsafe heating and exposed wiring in multi-unit building',
    category: 'Housing',
    categoryKey: 'housing',
    city: 'Santa Cruz',
    severity: 'urgent',
    verificationScore: 91,
    status: 'ready_to_escalate',
    evidenceCount: 7,
    summary: 'Heat outage, exposed wiring, and minors in the building. Reporter uploaded photos and utility shutoff notice.',
  },
  {
    id: 'demo-RPT-41014',
    title: 'Workplace guard missing on packaging line',
    category: 'Workplace Issues',
    categoryKey: 'labor',
    city: 'Monterey Park',
    severity: 'high',
    verificationScore: 76,
    status: 'under_review',
    evidenceCount: 4,
    summary: 'Machine appears active without a guard. Reporter requests anonymity and fears retaliation.',
  },
];
