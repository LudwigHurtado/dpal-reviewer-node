export const ecosystemRoles = [
  {
    id: 'legal',
    title: 'Legal reviewers',
    desc: 'Licensed counsel and compliance reviewers for admissibility, privilege, and escalation paths.',
  },
  {
    id: 'sector',
    title: 'Sector reviewers',
    desc: 'Subject-matter experts mapped to environmental, labor, housing, and public-safety categories.',
  },
  {
    id: 'community',
    title: 'Community validators',
    desc: 'Verified residents and witnesses providing structured corroboration within guardrails.',
  },
  {
    id: 'nonprofit',
    title: 'Nonprofit partners',
    desc: 'Accredited organizations co-signing validations and routing cases to advocacy workflows.',
  },
  {
    id: 'regional',
    title: 'Regional truth-check teams',
    desc: 'Cross-jurisdictional panels for duplicate detection, pattern analysis, and local fact alignment.',
  },
  {
    id: 'qc',
    title: 'Senior QC reviewers',
    desc: 'Final quality gate for contested outcomes, credential disputes, and audit exceptions.',
  },
] as const;

export const queueRows = [
  {
    id: 'RPT-28491',
    category: 'Environmental',
    sla: '4h',
    confidence: 78,
    assignee: 'M. Okonkwo (Sector)',
    stage: 'Evidence QC',
  },
  {
    id: 'RPT-28488',
    category: 'Housing',
    sla: '12h',
    confidence: 62,
    assignee: 'Unassigned',
    stage: 'Triage',
  },
  {
    id: 'RPT-28480',
    category: 'Labor',
    sla: '2h',
    confidence: 91,
    assignee: 'L. Reyes (Legal)',
    stage: 'Legal review',
  },
  {
    id: 'RPT-28475',
    category: 'Public safety',
    sla: '24h',
    confidence: 55,
    assignee: 'Regional team NE-2',
    stage: 'Truth-check',
  },
] as const;

export const reviewers = [
  { name: 'Dr. A. Mensah', role: 'Sector', accuracy: 94, trust: 0.91, reviews: 1284, flag: false },
  { name: 'L. Reyes, Esq.', role: 'Legal', accuracy: 97, trust: 0.95, reviews: 842, flag: false },
  { name: 'K. Park', role: 'Community', accuracy: 81, trust: 0.72, reviews: 410, flag: true },
  { name: 'NE Regional Panel', role: 'Regional', accuracy: 89, trust: 0.88, reviews: 2102, flag: false },
] as const;

export const escalations = [
  {
    id: 'ESC-1092',
    report: 'RPT-28475',
    reason: 'Conflicting geo-tagged media vs. witness statement',
    recommendation: 'Senior QC + nonprofit partner joint review',
    priority: 'High',
  },
  {
    id: 'ESC-1090',
    report: 'RPT-28460',
    reason: 'Potential PII in attachment bundle',
    recommendation: 'Legal hold + redaction workflow',
    priority: 'Medium',
  },
] as const;

export const credentials = [
  {
    id: 'CRED-L-4402',
    holder: 'L. Reyes',
    type: 'Legal validator',
    wallet: '0x7a3…c91f',
    status: 'Active',
    issued: '2025-11-02',
    chain: 'DPAL Attestation L2',
  },
  {
    id: 'CRED-S-8821',
    holder: 'M. Okonkwo',
    type: 'Sector SME — Environmental',
    wallet: '0x4f1…9bde',
    status: 'Active',
    issued: '2025-09-18',
    chain: 'DPAL Attestation L2',
  },
  {
    id: 'CRED-C-1190',
    holder: 'K. Park',
    type: 'Community validator',
    wallet: '0xb02…7aa4',
    status: 'Probation',
    issued: '2024-06-01',
    chain: 'DPAL Attestation L2',
  },
] as const;

export const consensusItems = [
  { report: 'RPT-28440', panel: 'Sector + Regional', agree: 4, dissent: 0, outcome: 'Validated pattern' },
  { report: 'RPT-28422', panel: 'Legal + QC', agree: 3, dissent: 1, outcome: 'Escalated' },
  { report: 'RPT-28401', panel: 'Nonprofit + Sector', agree: 5, dissent: 0, outcome: 'Corroborated' },
] as const;

export const coiAlerts = [
  {
    id: 'COI-044',
    detail: 'Validator shares employer with reported entity (disclosed, recused)',
    severity: 'Review',
  },
  {
    id: 'COI-041',
    detail: 'Prior advocacy relationship with submitter — auto-routed to alternate panel',
    severity: 'Resolved',
  },
] as const;

export const regions = [
  { code: 'NE', coverage: 88, pending: 14, teams: 3 },
  { code: 'SE', coverage: 82, pending: 22, teams: 4 },
  { code: 'MW', coverage: 79, pending: 31, teams: 5 },
  { code: 'W', coverage: 91, pending: 9, teams: 3 },
] as const;

export const expertise = [
  { sector: 'Environmental', depth: 92, panelists: 28 },
  { sector: 'Housing', depth: 85, panelists: 22 },
  { sector: 'Labor', depth: 78, panelists: 19 },
  { sector: 'Public safety', depth: 71, panelists: 24 },
] as const;

export const auditEvents = [
  { ts: '2026-04-04T08:12:00Z', actor: 'system', action: 'Attestation anchored', ref: '0x9c2e…41ab' },
  { ts: '2026-04-04T07:55:00Z', actor: 'admin@dpal', action: 'Credential probation applied', ref: 'CRED-C-1190' },
  { ts: '2026-04-04T06:40:00Z', actor: 'L. Reyes', action: 'Review signed', ref: 'RPT-28480' },
] as const;

export const aiSummary =
  'Queue pressure is elevated in MW housing with longer SLA exposure. Legal and sector agreement is high on environmental clusters; two escalations require senior QC pairing. Trust scores remain stable except one community validator under probation — recommend workload cap until accuracy recovers.';
