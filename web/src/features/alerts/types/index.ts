// Mirrors the backend serializers in api/app/schemas.py — this is the shared contract.

export type AlertStatus = "new" | "acknowledged" | "resolved" | "dismissed";
export type Severity = "critical" | "warning" | "info";
export type ResolutionType =
  | "fixed"
  | "false_alarm"
  | "known_issue"
  | "deferred"
  | "cannot_reproduce";

export interface UserBrief {
  id: number;
  name: string;
  role: string;
}

export interface TimelineEntry {
  timestamp: string;
  action: string;
  user: string | null;
  details: string | null;
  note: string | null;
}

export interface Resolution {
  type: ResolutionType;
  rootCause: string | null;
  actionTaken: string | null;
  preventiveMeasures: string | null;
  timeSpentMinutes: number | null;
}

export interface Alert {
  id: number;
  deviceId: string;
  deviceName: string;
  location: string;
  deviceTimezone: string;
  company: string;
  alertType: string;
  severity: Severity;
  title: string;
  threshold: number | null;
  readingValue: number | null;
  readingName: string | null;
  ts: string;
  status: AlertStatus;
  assignedTo: UserBrief | null;
  acknowledgedAt: string | null;
  resolvedAt: string | null;
  resolution: Resolution | null;
  timeline?: TimelineEntry[];
}

export type CountsByStatus = Record<AlertStatus, number>;

export interface AlertListResponse {
  data: Alert[];
  counts_by_status: CountsByStatus;
}

export interface Device {
  deviceId: string;
  type: string;
  company: string;
  name: string;
  location: string;
  timezone: string;
  floorCount: number | null;
  installedDate: string;
  readingTypes: string[];
  alertThresholds: Record<string, number>;
}

export interface TeamUser {
  id: number;
  name: string;
  role: string;
  company: string;
}

export interface AlertFilters {
  severity: Severity[];
  status: AlertStatus[];
  deviceId: string | null;
  assignedTo: number | null;
  q: string;
}

export interface AssignPayload {
  id: number;
  assignee_id: number;
  note?: string;
}

export interface ResolvePayload {
  id: number;
  resolution_type: ResolutionType;
  root_cause: string;
  action_taken: string;
  preventive_measures?: string;
  time_spent_minutes?: number;
}

export interface NotePayload {
  id: number;
  note: string;
}
