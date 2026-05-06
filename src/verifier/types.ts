export type CategoryKey = 'environmental' | 'housing' | 'labor' | 'public_safety' | 'medical';

export type Severity = 'low' | 'medium' | 'high' | 'urgent';

export type VerifierDisposition =
  | 'under_review'
  | 'verified'
  | 'needs_more_evidence'
  | 'urgent'
  | 'duplicate'
  | 'false_unsupported'
  | 'closed_no_action'
  | 'escalated'
  | 'action_taken'
  | 'follow_up_requested';

export interface VerifierCaseState {
  disposition: VerifierDisposition | string;
  assignedVerifier: string;
  assignedSupervisor: string;
  deadline: string | null;
  redactionNotes: string;
  reporterFacingStatus: string;
  lastReviewedBy: string;
  lastReviewedAt: string | null;
  updatedAt?: string;
  updatedBy?: string;
}

export interface VerifierAiTriage {
  summary: string;
  urgency: string;
  credibility_estimate: number;
  destination: string;
  missing_info: string[];
  draft_email: string;
  draft_call_summary: string;
  why_recommended: string;
  category_suggestion?: string;
  quality_issues?: string[];
  remediation_suggestions?: string[];
  reporter_follow_up_needed?: boolean;
  quest_steps?: string[];
  agency_drafts?: Array<{
    agency: string;
    channel?: string;
    subject?: string;
    body: string;
  }>;
  mode?: string;
}

export interface VerifierQueueRow {
  id: string;
  title: string;
  summary: string;
  category: string;
  categoryKey: CategoryKey;
  city: string;
  severity: Severity;
  verificationScore: number;
  status: string;
  evidenceCount: number;
  stage?: string;
  publicUrl?: string;
  /** First filing image, absolute URL (server resolves paths against DPAL_UPSTREAM_URL). */
  thumbnailUrl?: string;
}

export interface VerifierEvidenceItem {
  id: string;
  type: string;
  file_url?: string;
  thumbnail_url?: string;
  metadata?: unknown;
  uploaded_at?: string;
}

export interface VerifierReportDetail extends VerifierQueueRow {
  description: string;
  latitude?: number;
  longitude?: number;
  location: string;
  urgency: Severity;
  reporter: string;
  evidence: VerifierEvidenceItem[];
  priorActions: unknown[];
  recommendedRouting: string;
}

export interface TimelineEvent {
  id: string;
  at: string;
  type?: string;
  label?: string;
  detail?: string;
  performedBy?: string;
}

/** Mirrors main app situation room messages when upstream exposes GET /api/situation/:id/messages */
export interface VerifierSituationMessage {
  id: string;
  sender: string;
  text: string;
  timestamp: number;
  isSystem?: boolean;
  imageUrl?: string;
  audioUrl?: string;
}

export interface VerifierDetailMeta {
  dispositions?: string[];
  accountabilityFields?: string[];
}

export interface VerifierDetailResponse {
  ok: boolean;
  report: VerifierReportDetail;
  caseState?: VerifierCaseState;
  meta?: VerifierDetailMeta;
  notes: { text: string; updatedAt: string | null; updatedBy?: string };
  timeline: TimelineEvent[];
  situationMessages?: VerifierSituationMessage[];
}

export interface VerifierQueueResponse {
  ok: boolean;
  reports: VerifierQueueRow[];
  /** How the queue was loaded — drives demo vs empty vs live. */
  source?:
    | 'upstream'
    | 'upstream_empty'
    | 'unconfigured'
    | 'upstream_error'
    | 'empty'
    | string;
  message?: string;
  /** Non-secret hints (feed URL tested) for troubleshooting. */
  debug?: { feedUrl?: string; httpStatus?: number };
}

export interface VerifierActionResponse {
  ok: boolean;
  action?: unknown;
  warning?: string;
  upstream?: unknown;
  delivery?: { sent?: boolean; reason?: string; id?: string };
  hint?: string;
  triage?: VerifierAiTriage;
  script?: string;
  caseState?: VerifierCaseState;
}

export type ReviewerCaseStatus =
  | 'pending_review'
  | 'needs_more_evidence'
  | 'verified'
  | 'rejected'
  | 'escalated'
  | 'closed';

export interface ReviewerCaseRecord {
  caseId: string;
  reportId: string;
  source: 'field_os_super_agent' | string;
  goal: string;
  location?: string;
  dateRange?: { startDate?: string; endDate?: string };
  claimLabels?: Record<string, boolean>;
  limitations?: string[];
  evidenceTimeline?: unknown[];
  executionTraces?: unknown[];
  mappedWorkflows?: string[];
  pendingAdapters?: string[];
  finalActionsBlocked?: boolean;
  humanApprovalRequired?: boolean;
  approvalStatus?: Record<string, boolean>;
  nextRecommendedAction?: string;
  analysisSummaries?: {
    water?: Record<string, unknown>;
    earthObservation?: Record<string, unknown>;
    pollution?: Record<string, unknown>;
    carbonViu?: Record<string, unknown>;
  };
  evidenceAttachments?: Array<{
    id?: string;
    type?: string;
    title?: string;
    description?: string;
    url?: string;
    thumbnailUrl?: string;
    source?: string;
    workflowId?: string;
    claimLabels?: Record<string, boolean>;
    createdAt?: string;
  }>;
  subAgentOutputs?: unknown[];
  workflowPreviewArtifacts?: unknown[];
  status: ReviewerCaseStatus;
  humanVerified: boolean;
  reviewerNotes?: Array<{ note?: string; at?: string; reviewerId?: string }>;
  reviewedAt?: string | null;
  reviewerId?: string | null;
  decision?: string | null;
  updatedAt?: string;
}
