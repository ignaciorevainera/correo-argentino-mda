export const CHANNEL_TYPES = ["wise_call", "wise_email", "invgate_ticket"] as const;
export type ChannelType = (typeof CHANNEL_TYPES)[number];

export interface EvaluationParameter {
  id?: number;
  code: string;
  name: string;
  weight: number | null; // null for n/a items like 'Solicitud'
  section: "items" | "ticket" | "mda";
  channel: ChannelType;
  description?: string;
  order: number;
}

export interface QualityCall {
  id: number;
  channelType?: ChannelType;
  callId: string;
  ticketId: string;
  duration: string;
  date: string;
  month: string;
  notes: string;
  // Specific multi-channel metadata
  ringTime?: string;
  creationTime?: string;
  takeTime?: string;
  isPas?: boolean;
  appliesMda?: boolean;
  staysInMda?: boolean;
  isReclamoNovedad?: boolean;
  recordingUrl?: string | null;
  comments?: Record<string, string>;
  section1: {
    score: number;
    maxScore: number;
    details: Record<string, boolean>;
    comments?: Record<string, string>;
  };
  section2: {
    score: number;
    maxScore: number;
    details: Record<string, boolean>;
    comments?: Record<string, string>;
  };
  totalScore: number;
}

export interface QualityAuditRecord {
  id: number;
  agentId: number;
  channelType: ChannelType;
  callId: string; // Used for Case Number / Call ID
  ticketId: string; // Used for Ticket ID / AG Number
  duration: string;
  date: string;
  month: string;
  notes: string | null;
  ringTime: string | null;
  creationTime: string | null;
  takeTime: string | null;
  isPas: boolean;
  appliesMda: boolean;
  staysInMda: boolean;
  isReclamoNovedad?: boolean;
  recordingUrl?: string | null;
  section1Score: number;
  section2Score: number;
  totalScore: number;
}

export interface OperatorQuality {
  id: string;
  name: string;
  username: string;
  month: string;
  monthSummary: string;
  calls: QualityCall[];
  history: number[];
  averageScore: number;
  // Channel-specific averages and counts
  wiseCallsAvg?: number;
  wiseCallsCount?: number;
  wiseEmailsAvg?: number;
  wiseEmailsCount?: number;
  invgateAgAvg?: number;
  invgateAgCount?: number;
  totalAuditsCount?: number;
  quotaFulfilled?: boolean;
  prevAverageScore?: number;
  prevCallsCount?: number;
}

export interface AuditParameter {
  id: number;
  code: string;
  name: string;
  weight: number | null;
  category: string;
  active: boolean;
  channel?: ChannelType;
  section?: "items" | "ticket" | "mda";
}
