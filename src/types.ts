// ─── Plan ────────────────────────────────────────────────────────────────────

export interface PlanNode {
  id: string;
  agentName: string;
  dependsOn: string[]; // ids of nodes that must finish first
  instruction: string;
}

export interface ExecutionPlan {
  task: string;
  nodes: PlanNode[];
}

// ─── Agent ───────────────────────────────────────────────────────────────────

export interface Agent {
  name: string;
  description: string; // shown to the Planner so it knows when to use this agent
  run: (instruction: string, priorContext: string) => Promise<AgentResult>;
}

export interface AgentResult {
  agent: string;
  nodeId?: string;
  result: string;
  success: boolean;
  tokens: number;
  durationMs: number;
}

// ─── Critic ──────────────────────────────────────────────────────────────────

export interface RetryInstruction {
  id: string;
  refinedInstruction: string;
}

export interface CritiqueResult {
  approved: boolean;
  retryNodes: RetryInstruction[];
  reasoning: string;
}

// ─── Run metadata ─────────────────────────────────────────────────────────────

export interface RunMetadata {
  totalAgents: number;
  stages: number;
  totalTokens: number;
  totalDurationMs: number;
  retries: number;
  failures: number;
}
