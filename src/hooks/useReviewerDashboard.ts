import { useCallback, useEffect, useState } from 'react';
import { fetchDashboard, reviewerStreamUrl } from '../api/client';
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
  const [refreshKey, setRefreshKey] = useState(0);
  const [sseFailed, setSseFailed] = useState(false);
  const useMock = import.meta.env.VITE_USE_MOCK_DATA === 'true';
  const sseEnabled = import.meta.env.VITE_REVIEWER_USE_SSE !== 'false';

  const refresh = useCallback(() => setRefreshKey((k) => k + 1), []);

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
  }, [useMock, refreshKey]);

  useEffect(() => {
    if (useMock || !sseEnabled) return;

    const es = new EventSource(reviewerStreamUrl());
    es.onmessage = (ev) => {
      try {
        const msg = JSON.parse(ev.data) as { dashboard?: ReviewerDashboard };
        if (msg?.dashboard) setData(msg.dashboard);
      } catch {
        /* ignore */
      }
    };
    es.onerror = () => {
      setSseFailed(true);
      es.close();
    };

    return () => {
      es.close();
    };
  }, [useMock, sseEnabled]);

  /** HTTP polling when SSE is turned off or the EventSource connection failed. */
  useEffect(() => {
    if (useMock) return;
    if (sseEnabled && !sseFailed) return;

    const pollMs = Number(import.meta.env.VITE_REVIEWER_POLL_MS || 15000);
    if (!Number.isFinite(pollMs) || pollMs <= 0) return;

    const id = window.setInterval(() => refresh(), pollMs);
    return () => window.clearInterval(id);
  }, [useMock, sseEnabled, sseFailed, refresh]);

  const liveMode: 'off' | 'sse' | 'poll' = useMock
    ? 'off'
    : sseEnabled && !sseFailed
      ? 'sse'
      : 'poll';

  return {
    data,
    loading,
    error,
    hadApiFailure: Boolean(error) && !useMock,
    refresh,
    liveMode,
  };
}
