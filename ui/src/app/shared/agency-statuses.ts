export const AGENCY_STATUSES = ['ACTIVE', 'INACTIVE', 'DO_NOT_CONTACT'] as const;
export type AgencyStatus = typeof AGENCY_STATUSES[number];

export const AGENCY_STATUS_LABELS: Record<AgencyStatus, string> = {
  ACTIVE: 'Active',
  INACTIVE: 'Inactive',
  DO_NOT_CONTACT: 'Do Not Contact',
};
