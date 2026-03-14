export interface AIInsights {
  summary: string;
  patterns: string[];
  tips: string[];
  generatedAt: number;
}

export interface UsageData {
  totalLocksCreated: number;
  activeLocks: number;
  cancelledLocks: number;
  blockEventsLast30Days: number;
  blockEventHours: number[];
  blockEventDays: number[];
  unlockRequestCount: number;
  unlockApprovalRate: number;
  avgDailyMinutes: number;
}
