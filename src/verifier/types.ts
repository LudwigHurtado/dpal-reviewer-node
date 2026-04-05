export type CategoryKey = 'environmental' | 'housing' | 'labor' | 'public_safety' | 'medical';

export type Severity = 'low' | 'medium' | 'high' | 'urgent';

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

export interface VerifierDetailResponse {
  ok: boolean;
  report: VerifierReportDetail;
  notes: { text: string; updatedAt: string | null };
  timeline: TimelineEvent[];
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
}
