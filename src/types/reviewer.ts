export interface EcosystemRole {
  id: string;
  title: string;
  desc: string;
}

/** Saved reviewer input (API persists in server/data/reviewer-reviews.json). */
export interface ReportReviewEntry {
  opinion: string;
  effect: ReviewEffect;
  updatedAt: string;
}

export type ReviewEffect =
  | 'none'
  | 'proceed_validation'
  | 'request_evidence'
  | 'escalate'
  | 'hold';

export interface QueueRow {
  id: string;
  title?: string;
  summary?: string;
  category: string;
  sla: string;
  confidence: number;
  assignee: string;
  stage: string;
  submittedAt?: string;
  /** Public URL to open the filing in the main DPAL app (from upstream or `DPAL_PUBLIC_REPORT_BASE`). */
  publicUrl?: string;
  location?: string;
  /** Last saved reviewer opinion + recommended effect for this report id. */
  review?: ReportReviewEntry;
}

export interface ReviewerStat {
  name: string;
  role: string;
  accuracy: number;
  trust: number;
  reviews: number;
  flag: boolean;
}

export interface Escalation {
  id: string;
  report: string;
  reason: string;
  recommendation: string;
  priority: string;
}

export interface Credential {
  id: string;
  holder: string;
  type: string;
  wallet: string;
  status: string;
  issued: string;
  chain: string;
}

export interface ConsensusItem {
  report: string;
  panel: string;
  agree: number;
  dissent: number;
  outcome: string;
}

export interface CoiAlert {
  id: string;
  detail: string;
  severity: string;
}

export interface Region {
  code: string;
  coverage: number;
  pending: number;
  teams: number;
}

export interface Expertise {
  sector: string;
  depth: number;
  panelists: number;
}

export interface AuditEvent {
  ts: string;
  actor: string;
  action: string;
  ref: string;
}

export interface QualityAnalytics {
  meanEvidenceGrade: string;
  evidenceGradePct: number;
  panelAgreementPct: number;
  escalationPrecisionPct: number;
}

export interface ReviewerDashboard {
  ecosystemRoles: EcosystemRole[];
  queueRows: QueueRow[];
  reviewers: ReviewerStat[];
  escalations: Escalation[];
  credentials: Credential[];
  consensusItems: ConsensusItem[];
  coiAlerts: CoiAlert[];
  regions: Region[];
  expertise: Expertise[];
  auditEvents: AuditEvent[];
  aiSummary: string;
  qualityAnalytics?: QualityAnalytics;
  _sources?: { queueRows: 'local' | 'upstream'; upstream: boolean };
}
