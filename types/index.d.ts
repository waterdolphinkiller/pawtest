export type SquadId = 'A' | 'B' | 'C' | 'D';
export type CatAxis = 'human' | 'agent' | 'dual';
export type CatMode = 'fast' | 'full';
export type Severity = 'critical' | 'high' | 'medium' | 'low' | 'info';
export type Grade = 'S' | 'A' | 'B' | 'C' | 'D' | 'F';

export interface CatFinding {
  id: string;
  severity: Severity;
  axis: 'human' | 'agent';
  title: string;
  detail: string;
  evidence?: string;
  fixHint: string;
}

export interface CatReport {
  catId: string;
  code: string;
  name: string;
  squad: SquadId;
  axis: CatAxis;
  status: 'pass' | 'warn' | 'fail' | 'error' | 'skipped';
  score: number;
  durationMs: number;
  quips: string[];
  findings: CatFinding[];
  metrics?: Record<string, unknown>;
}

export interface CatMeta {
  id: string;
  code: string;
  name: string;
  title: string;
  squad: SquadId;
  axis: CatAxis;
  mode: CatMode;
  color: string;
  accentColor: string;
  prop: string;
  description: string;
}

export interface AuditOptions {
  url: string;
  full?: boolean;
  cats?: string[];
  timeoutMs?: number;
  allowMutations?: boolean;
  allowPrivateIp?: boolean;
  blockLocalhost?: boolean;
  outputDir?: string;
  chromePath?: string;
  shareCard?: boolean;
  captureGif?: boolean;
  openStage?: boolean;
}

export interface AxisScore {
  score: number;
  grade: Grade;
  catsRun: number;
  criticalCount: number;
  highCount: number;
}

export interface AuditReport {
  tool: 'pawtest';
  version: string;
  targetUrl: string;
  timestamp: string;
  mode: 'fast' | 'full' | 'custom';
  durationMs: number;
  sandbox: {
    readOnly: boolean;
    mutationsBlocked: number;
    redactionsApplied: number;
  };
  scores: {
    human: AxisScore;
    agent: AxisScore;
  };
  topRoasts: string[];
  cats: CatReport[];
}
