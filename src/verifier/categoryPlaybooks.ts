import type { CategoryKey } from './types';

export const categoryPlaybooks: Record<
  CategoryKey,
  { label: string; severityRule: string; actions: string[]; agencies: string[] }
> = {
  environmental: {
    label: 'Environmental',
    severityRule:
      'Escalate when contamination, gas leak, smoke, runoff, or hazardous waste is supported by photo/video + location + witness/reporter statement.',
    actions: [
      'Call city/environment line',
      'Email local authority',
      'Request field inspection',
      'Flag emergency risk',
      'Preserve evidence bundle',
    ],
    agencies: ['City Environmental Department', 'County Health', 'EPA/Regional', 'Water Utility'],
  },
  housing: {
    label: 'Housing',
    severityRule:
      'Escalate when habitability, unsafe heating, structural damage, mold, exposed wiring, or child/senior risk is supported by evidence.',
    actions: [
      'Call housing inspector',
      'Email landlord/city',
      'Create compliance notice',
      'Flag vulnerable occupants',
      'Open legal referral',
    ],
    agencies: ['City Housing Department', 'Code Enforcement', 'Legal Aid', 'Fire Marshal'],
  },
  labor: {
    label: 'Labor',
    severityRule:
      'Escalate when immediate worker injury risk, missing guards, retaliation, wage theft pattern, or child labor indicators are present.',
    actions: [
      'Call OSHA/local safety office',
      'Email employer notice',
      'Open worker protection case',
      'Flag retaliation risk',
      'Preserve statements',
    ],
    agencies: ['OSHA', 'State Labor Dept', 'Worker Center', 'Legal Aid'],
  },
  public_safety: {
    label: 'Public Safety',
    severityRule:
      'Escalate immediately when violence risk, traffic hazard, bodycam contradiction, weapon presence, or urgent injury risk appears credible.',
    actions: [
      'Call emergency service',
      'Call non-emergency dispatch',
      'Email city/public safety office',
      'Request supervisor review',
      'Lock chain of custody',
    ],
    agencies: ['911 / Emergency', 'Police Non-Emergency', 'City Public Safety', 'Civil Rights Partner'],
  },
  medical: {
    label: 'Medical / Elder / Child',
    severityRule:
      'Escalate when patient safety, neglect, medication denial, infectious hazard, or elder/child risk is documented.',
    actions: [
      'Call facility',
      'Email health regulator',
      'Open patient safety referral',
      'Flag abuse concern',
      'Urgent welfare escalation',
    ],
    agencies: ['Health Department', 'Facility Administration', 'Adult Protective Services', 'Patient Advocate'],
  },
};
