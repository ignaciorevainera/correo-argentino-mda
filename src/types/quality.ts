export interface QualityCall {
  id: number;
  callId: string;
  ticketId: string;
  duration: string;
  date: string;
  month: string;
  notes: string;
  isCriticalFailure: boolean;
  section1: {
    score: number;
    maxScore: number;
    details: Record<string, boolean>;
  };
  section2: {
    score: number;
    maxScore: number;
    details: Record<string, boolean>;
  };
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
}

export interface AuditParameter {
  id: number;
  code: string;
  name: string;
  weight: number;
  category: string;
  active: boolean;
}
