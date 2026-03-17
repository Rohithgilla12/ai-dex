export interface McpServerConfig {
  command: string;
  args: string[];
  env?: Record<string, string>;
}

export interface SkillInfo {
  name: string;
  description?: string;
  path?: string;
}

export interface RepoInfo {
  name: string;
  url: string;
  path: string;
  skills: SkillInfo[];
}

export interface ToolInfo {
  name: string;
  configPath?: string;
  configContent?: string;
  schemaContent?: string;
  mcpServers?: Record<string, McpServerConfig>;
  skills: SkillInfo[];
}

export interface GlobalSkillSearchResult {
  id: string;
  installs: string;
  url: string;
}

export interface ActivityPoint {
  date: string;
  count: number;
}

export interface ProjectActivity {
  name: string;
  count: number;
}

export interface ModelUsage {
  messageCount: number;
  estimatedTokens: number;
  estimatedCost: number;
}

export interface ToolSequence {
  sequence: string;
  count: number;
}

export interface UsageStats {
  dailyActivity: ActivityPoint[];
  hourlyActivity: number[];
  totalSkills: number;
  topProjects: ProjectActivity[];
  skillDistribution: Record<string, number>;
  avgPromptLength: number;
  commandRatio: number;
  estimatedCostToday: number;
  estimatedCostWeek: number;
  estimatedCostAllTime: number;
  modelUsageStats: Record<string, ModelUsage>;
  commonSequences: ToolSequence[];
  totalTokens: number;
  cacheReadTokens: number;
}

export interface MemoryEntry {
  projectName: string;
  path: string;
  lineCount: number;
  contentPreview: string[];
}

export interface MarketplaceServer {
  name: string;
  description: string;
  command: string;
  args: string[];
  author: string;
  category: string;
  useCount: number;
  homepage?: string;
  qualifiedName?: string;
}

export interface ConfigRevision {
  timestamp: string;
  filename: string;
  size: number;
}

export interface DiffHunk {
  kind: "add" | "remove" | "context";
  content: string;
}

export interface DiffResult {
  oldContent: string;
  newContent: string;
  hunks: DiffHunk[];
}

export interface DiagnosticResult {
  success: boolean;
  status: string;
  message: string;
  failureKind?: string;
  suggestion?: string;
  missingRuntime?: string;
  details: string[];
  evidence: DiagnosticEvidence[];
  repairActions: DiagnosticAction[];
  checkedAt: string;
}

export interface DiagnosticEvidence {
  label: string;
  value: string;
}

export interface DiagnosticAction {
  kind: string;
  label: string;
  description?: string;
  runtime?: string;
  revisionFilename?: string;
}

export interface DiagnosticHistoryEntry {
  checkedAt: string;
  status: string;
  message: string;
  failureKind?: string;
  revisionFilename?: string;
}

export interface SuspiciousConfigChange {
  label: string;
  previousValue: string;
  currentValue: string;
}

export interface LastKnownGoodDiagnostic {
  checkedAt: string;
  result: DiagnosticResult;
  revisionFilename?: string;
  suspiciousChanges: SuspiciousConfigChange[];
}

export interface ServerDiagnosticHistory {
  serverName: string;
  runs: DiagnosticHistoryEntry[];
  lastKnownGood?: LastKnownGoodDiagnostic;
}

export interface DiagnosticAdvice {
  title: string;
  summary: string;
  confidence: string;
  reasons: string[];
  recommendedSteps: string[];
}

export interface ExportedDiagnosticBundle {
  path: string;
  preview: string;
}

export interface DexData {
  tools: ToolInfo[];
  repos: RepoInfo[];
}

export type ViewMode = "dashboard" | "tools" | "repos" | "add_repo" | "global_search" | "create_skill" | "marketplace" | "costs" | "memory";
