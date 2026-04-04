import { useEffect, useState } from 'react';
import { fetchDashboard } from '../api/client';
import type { ReviewerDashboard } from '../types/reviewer';
import {
  aiSummary as mockAi,
  auditEvents as mockAudit,
  coiAlerts as mockCoi,
  consensusItems as mockConsensus,
  credentials as mockCred,
  ecosystemRoles as mockEco,
  escalations as mockEsc,
  expertise as mockExp,
  queueRows as mockQueue,
  regions as mockRegions,
  reviewers as mockReviewers,
} from '../data/mock';

function mockDashboard(): ReviewerDashboard {
  return {
    ecosystemRoles: [...mockEco],
    queueRows: [...mockQueue],
    reviewers: [...mockReviewers],
    escalations: [...mockEsc],
    credentials: [...mockCred],
    consensusItems: [...mockConsensus],
    coiAlerts: [...mockCoi],
    regions: [...mockRegions],
    expertise: [...mockExp],
    auditEvents: [...mockAudit],
    aiSummary: mockAi,
    qualityAnalytics: {
      meanEvidenceGrade: 'B+',
      evidenceGradePct: 78,
      panelAgreementPct: 91,
      escalationPrecisionPct: 87,
    },
    _sources: { queueRows: 'local', upstream: false },
  };
}

export function useReviewerDashboard() {
  const [data, setData] = useState<ReviewerDashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const useMock = import.meta.env.VITE_USE_MOCK_DATA === 'true';

  useEffect(() => {
    if (useMock) {
      setData(mockDashboard());
      setLoading(false);
      setError(null);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    fetchDashboard()
      .then((d) => {
        if (!cancelled) setData(d);
      })
      .catch((e: unknown) => {
        if (!cancelled) {
          const msg = e instanceof Error ? e.message : String(e);
          setError(msg);
          setData(mockDashboard());
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [useMock]);

  return { data, loading, error, hadApiFailure: Boolean(error) && !useMock };
}
