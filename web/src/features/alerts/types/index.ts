export type Severity = "critical" | "warning" | "info";
export type AlertStatus = "new" | "acknowledged" | "resolved" | "dismissed";
export type ResolutionType = "fixed" | "false_alarm" | "known_issue" | "deferred" | "cannot_reproduce";

export interface UserBrief {
  id: number;
  name: string;
  role: string;
}

export interface AlertResolution {
  type: ResolutionType;
  rootCause: string;
  actionTaken: string;
  preventiveMeasures?: string;
  timeSpentMinutes?: number;
}

export interface TimelineEvent {
  timestamp: string;
  action: string;
  user: string;
  details?: string;
  note?: string;
}

export interface KnaqAlert {
  id: number;
  deviceId: string;
  deviceName: string;
  location: string;
  deviceTimezone: string;
  company: string;
  alertType: string;
  severity: Severity;
  title: string;
  threshold?: number;
  readingValue?: number;
  readingName?: string;
  ts: string;
  status: AlertStatus;
  assignedTo?: UserBrief;
  acknowledgedAt?: string;
  resolvedAt?: string;
  resolution?: AlertResolution;
  timeline?: TimelineEvent[];
}

export interface AlertsResponse {
  data: KnaqAlert[];
  counts_by_status: Record<AlertStatus, number>;
  page: number;
  page_size: number;
  total: number;
}

export interface Device {
  deviceId: string;
  type: string;
  company: string;
  name: string;
  location: string;
  timezone: string;
  floorCount?: number;
  installedDate?: string;
  readingTypes?: Record<string, unknown>;
  alertThresholds?: Record<string, unknown>;
}

export interface DevicesResponse {
  data: Device[];
}

export interface KnaqUser {
  id: number;
  name: string;
  role: string;
  company?: string;
}

export interface UsersResponse {
  data: KnaqUser[];
}

export interface Badge {
  id: string;
  label: string;
  icon: string;
  description: string;
  earned: boolean;
}

export interface LeaderboardPlayer {
  userId: number;
  name: string;
  role: string;
  points: number;
  level: number;
  xpIntoLevel: number;
  xpForNextLevel: number;
  rank: number;
  stats: {
    acknowledged: number;
    assigned: number;
    notes: number;
    dismissed: number;
    resolved: number;
  };
  badges: Badge[];
}

export interface LeaderboardResponse {
  players: LeaderboardPlayer[];
  summary: {
    company: string;
    totalPoints: number;
    totalResolved: number;
    activePlayers: number;
  };
  meUserId: number;
}

export interface AlertStats {
  statusCounts: Record<AlertStatus, number>;
  openBySeverity: Record<Severity, number>;
  mttrMinutes?: number;
  resolvedThisWeek: number;
  resolvedLastWeek: number;
  dismissalRate: number;
  resolutionBySeverity: Record<Severity, number | null>;
  volumeTrend: Array<{ date: string; critical: number; warning: number; info: number }>;
}
