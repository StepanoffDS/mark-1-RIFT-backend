export enum IncidentSeverity {
  P1 = 'P1',
  P2 = 'P2',
  P3 = 'P3',
}

export enum IncidentStatus {
  OPEN = 'OPEN',
  INVESTIGATING = 'INVESTIGATING',
  MONITORING = 'MONITORING',
  RESOLVED = 'RESOLVED',
}

export enum IncidentEventType {
  INCIDENT_CREATED = 'INCIDENT_CREATED',
  INCIDENT_UPDATED = 'INCIDENT_UPDATED',
  STATUS_CHANGED = 'STATUS_CHANGED',
  SEVERITY_CHANGED = 'SEVERITY_CHANGED',
  USER_ASSIGNED = 'USER_ASSIGNED',
  USER_UNASSIGNED = 'USER_UNASSIGNED',
  INCIDENT_RESOLVED = 'INCIDENT_RESOLVED',
  INCIDENT_REOPENED = 'INCIDENT_REOPENED',
}

export type IncidentRow = {
  id: string;
  title: string;
  description: string | null;
  status: IncidentStatus;
  severity: IncidentSeverity;
  created_by: string;
  assigned_to: string | null;
  created_at: Date;
  updated_at: Date;
  resolved_at: Date | null;
};

export type IncidentChanges = {
  title?: string;
  description?: string | null;
  severity?: IncidentSeverity;
  assignedTo?: string | null;
};
